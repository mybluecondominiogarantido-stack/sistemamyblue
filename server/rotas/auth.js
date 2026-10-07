'use strict';
const express = require('express');
const { hashSenha, conferirSenha, validarNovaSenha, HASH_FALSO, sha256, COOKIE } = require('../seguranca');

function rotasAuth({ db, seg }) {
  const r = express.Router();
  const json = express.json({ limit: '50kb' });
  r.post('/api/auth/login', json, async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    // ignora espaços nas pontas (comuns ao copiar a senha temporária do log ou de mensagens)
    const senha = String((req.body && req.body.senha) || '').trim();
    if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    const chave = `${req.ip}|${email}`;
    if (seg.bloqueado(chave)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });

    const u = await db.um('SELECT id, nome, email, papel, ativo, trocar_senha, senha_hash FROM usuarios WHERE email = $1', [email]);
    const ok = conferirSenha(senha, u ? u.senha_hash : HASH_FALSO);
    if (!u || !ok || !u.ativo) {
      seg.registrarFalha(chave);
      await seg.auditar(req, 'login_falha', null, { email, motivo: !u ? 'usuario_inexistente' : !ok ? 'senha' : 'inativo' }, null);
      return res.status(401).json({ erro: u && ok && !u.ativo ? 'Usuário desativado. Fale com a administração.' : 'E-mail ou senha incorretos.' });
    }
    seg.limparFalhas(chave);
    await seg.iniciarSessao(req, res, u);
    await db.q('UPDATE usuarios SET ultimo_login = now() WHERE id = $1', [u.id]);
    await seg.auditar(req, 'login', null, null, u);
    res.json({ usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel, trocar_senha: !!u.trocar_senha } });
  });

  r.post('/api/auth/logout', async (req, res) => {
    if (req.usuario) await seg.auditar(req, 'logout', null, null);
    await seg.encerrarSessao(req, res);
    res.json({ ok: true });
  });

  r.get('/api/auth/eu', (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Sem sessão.' });
    res.set('Cache-Control', 'no-store');
    res.json({ usuario: req.usuario });
  });

  r.post('/api/auth/senha', json, async (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
    const { atual, nova } = req.body || {};
    const u = await db.um('SELECT id, senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!conferirSenha(String(atual || '').trim(), u.senha_hash)) return res.status(400).json({ erro: 'A senha atual está incorreta.' });
    const erro = validarNovaSenha(nova);
    if (erro) return res.status(400).json({ erro });
    if (String(nova) === String(atual || '').trim()) return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    await db.q('UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE, atualizado_em = now() WHERE id = $2', [hashSenha(nova), u.id]);
    // encerra as sessões abertas em outros aparelhos
    const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
    await db.q('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [u.id, cookie ? sha256(decodeURIComponent(cookie.slice(COOKIE.length + 1))) : '']);
    await seg.auditar(req, 'senha_alterada', null, null);
    res.json({ ok: true });
  });

  /* ---------- foto de perfil ---------- */
  const FORMATOS = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
  const LIMITE_FOTO = 400 * 1024;

  r.put('/api/auth/foto', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim();
    const assinatura = FORMATOS[tipo];
    // confere o tipo pelo conteúdo do arquivo, não só pelo cabeçalho
    if (!assinatura || buf.length < 12 || !assinatura.every((b, i) => buf[i] === b) || (tipo === 'image/webp' && buf.subarray(8, 12).toString() !== 'WEBP')) {
      return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG ou WEBP.' });
    }
    if (buf.length > LIMITE_FOTO) return res.status(413).json({ erro: 'Imagem grande demais.' });
    const r2 = await db.um('UPDATE usuarios SET foto = $1, foto_tipo = $2, foto_em = now() WHERE id = $3 RETURNING foto_em', [buf, tipo, req.usuario.id]);
    await seg.auditar(req, 'foto_alterada', null, { bytes: buf.length });
    res.json({ ok: true, foto_v: new Date(r2.foto_em).getTime() });
  });

  r.delete('/api/auth/foto', async (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
    await db.q('UPDATE usuarios SET foto = NULL, foto_tipo = NULL, foto_em = NULL WHERE id = $1', [req.usuario.id]);
    await seg.auditar(req, 'foto_removida', null, null);
    res.json({ ok: true });
  });

  /* qualquer pessoa logada vê a foto dos colegas (menu, lista de usuários) */
  r.get('/api/usuarios/:id/foto', async (req, res) => {
    if (!req.usuario) return res.status(401).end();
    const u = await db.um('SELECT foto, foto_tipo FROM usuarios WHERE id = $1', [Number(req.params.id) || 0]);
    if (!u || !u.foto) return res.status(404).end();
    // o endereço muda a cada nova foto (?v=), então pode ficar em cache
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.set('Content-Security-Policy', "default-src 'none'");
    res.type(u.foto_tipo).send(u.foto);
  });

  return r;
}

module.exports = { rotasAuth };
