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

    const u = await db.um('SELECT * FROM usuarios WHERE email = $1', [email]);
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
    const u = await db.um('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
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

  return r;
}

module.exports = { rotasAuth };
