'use strict';
const express = require('express');
const { hashSenha, validarNovaSenha, senhaAleatoria } = require('../seguranca');
const { SLUG_RE } = require('../modulos');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ICONES = ['app', 'calculadora', 'grafico', 'aperto', 'caixa', 'carteira', 'documento', 'pessoas', 'ticket', 'casa', 'calendario', 'escudo'];
const ehDuplicado = (e) => e && (e.code === '23505' || /duplicate key|unique/i.test(String(e.message)));

function rotasAdmin({ db, seg, modulos, registros, cfg }) {
  const r = express.Router();
  const json = express.json({ limit: '2mb' });
  r.use('/api/admin', seg.exigirLogin, seg.exigirAdmin);

  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  /* link do Apps Script que veio embutido no HTML original (ajuda na importação) */
  async function urlPlanilhaDoHtml(m) {
    try {
      const html = await modulos.lerHtml(m);
      const r2 = html && /SHEET_URL_BUILTIN\s*=\s*["'](https:\/\/script\.google\.com\/[^"']+)["']/.exec(html);
      return r2 ? r2[1] : null;
    } catch { return null; }
  }

  /* ===================== usuários ===================== */
  r.get('/api/admin/usuarios', async (req, res) => {
    const perms = {};
    for (const p of (await db.q('SELECT usuario_id, modulo_slug FROM permissoes')).rows) (perms[p.usuario_id] ||= []).push(p.modulo_slug);
    const { rows } = await db.q('SELECT id, nome, email, papel, ativo, trocar_senha, criado_em, ultimo_login FROM usuarios ORDER BY ativo DESC, nome');
    res.json({ usuarios: rows.map((u) => ({ ...u, modulos: perms[u.id] || [] })) });
  });

  async function dadosUsuario(body) {
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const papel = body.papel === 'admin' ? 'admin' : 'usuario';
    if (!nome || nome.length > 120) return { erro: 'Informe o nome (até 120 caracteres).' };
    if (!EMAIL_RE.test(email) || email.length > 200) return { erro: 'E-mail inválido.' };
    const lista = Array.isArray(body.modulos) ? body.modulos.map(String) : [];
    const existentes = new Set((await db.q('SELECT slug FROM modulos')).rows.map((m) => m.slug));
    return { nome, email, papel, modulos: lista.filter((s) => existentes.has(s)) };
  }

  const salvarPermissoes = (id, lista) => db.tx(async (t) => {
    await t.q('DELETE FROM permissoes WHERE usuario_id = $1', [id]);
    for (const s of lista) await t.q('INSERT INTO permissoes (usuario_id, modulo_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, s]);
  });

  r.post('/api/admin/usuarios', json, async (req, res) => {
    const d = await dadosUsuario(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    let senha = req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    let id;
    try {
      id = (await db.um("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
        [d.nome, d.email, hashSenha(senha), d.papel])).id;
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    await salvarPermissoes(id, d.modulos);
    await seg.auditar(req, 'usuario_criado', null, { id, email: d.email, papel: d.papel, modulos: d.modulos });
    res.status(201).json({ id, senha_temporaria: senha });
  });

  r.patch('/api/admin/usuarios/:id', json, async (req, res) => {
    const id = Number(req.params.id);
    const atual = await db.um('SELECT id, nome, email, papel, ativo FROM usuarios WHERE id = $1', [id]);
    if (!atual) return erro(res, 404, 'Usuário não encontrado.');
    const d = await dadosUsuario({ ...atual, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    const ativo = req.body.ativo === undefined ? !!atual.ativo : !!req.body.ativo;
    if (atual.papel === 'admin' && (d.papel !== 'admin' || !ativo)) {
      const outros = await db.um("SELECT COUNT(*)::int AS n FROM usuarios WHERE papel = 'admin' AND ativo AND id <> $1", [id]);
      if (outros.n === 0) return erro(res, 400, 'Não é possível remover o último administrador ativo.');
    }
    try {
      await db.q('UPDATE usuarios SET nome = $1, email = $2, papel = $3, ativo = $4, atualizado_em = now() WHERE id = $5', [d.nome, d.email, d.papel, ativo, id]);
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    if (Array.isArray(req.body.modulos)) await salvarPermissoes(id, d.modulos);
    if (!ativo) await db.q('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
    await seg.auditar(req, 'usuario_editado', null, { id, email: d.email, papel: d.papel, ativo, modulos: Array.isArray(req.body.modulos) ? d.modulos : undefined });
    res.json({ ok: true });
  });

  r.post('/api/admin/usuarios/:id/senha', json, async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.um('SELECT 1 FROM usuarios WHERE id = $1', [id]))) return erro(res, 404, 'Usuário não encontrado.');
    let senha = req.body && req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    await db.q('UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE, atualizado_em = now() WHERE id = $2', [hashSenha(senha), id]);
    await db.q('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
    await seg.auditar(req, 'senha_redefinida', null, { id });
    res.json({ senha_temporaria: senha });
  });

  /* ===================== setores ===================== */
  r.get('/api/admin/setores', async (req, res) => {
    const { rows } = await db.q('SELECT s.id, s.nome, s.ordem, (SELECT COUNT(*)::int FROM modulos m WHERE m.setor_id = s.id) AS modulos FROM setores s ORDER BY s.ordem, s.nome');
    res.json({ setores: rows });
  });

  r.post('/api/admin/setores', json, async (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome || nome.length > 80) return erro(res, 400, 'Informe o nome do setor.');
    try {
      const { id } = await db.um('INSERT INTO setores (nome, ordem) VALUES ($1, $2) RETURNING id', [nome, Number(req.body.ordem) || 0]);
      await seg.auditar(req, 'setor_criado', null, { id, nome });
      res.status(201).json({ id });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um setor com este nome.');
      throw e;
    }
  });

  r.patch('/api/admin/setores/:id', json, async (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do setor.');
    try {
      await db.q('UPDATE setores SET nome = $1, ordem = $2 WHERE id = $3', [nome, Number(req.body.ordem) || 0, Number(req.params.id)]);
      await seg.auditar(req, 'setor_editado', null, { id: Number(req.params.id), nome });
      res.json({ ok: true });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um setor com este nome.');
      throw e;
    }
  });

  r.delete('/api/admin/setores/:id', async (req, res) => {
    await db.q('DELETE FROM setores WHERE id = $1', [Number(req.params.id)]);
    await seg.auditar(req, 'setor_removido', null, { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== módulos ===================== */
  r.get('/api/admin/modulos', async (req, res) => {
    const lista = [];
    for (const m of await modulos.listar()) {
      lista.push({
        ...m,
        usuarios: (await db.q('SELECT usuario_id FROM permissoes WHERE modulo_slug = $1', [m.slug])).rows.map((x) => x.usuario_id),
        dados_registros: m.adaptador ? await registros.resumo(m.slug) : [],
        dados_armazenamento: (await db.q(`SELECT escopo, COUNT(*)::int AS chaves, SUM(LENGTH(valor))::int AS bytes, MAX(atualizado_em) AS ultima
          FROM armazenamento WHERE modulo_slug = $1 GROUP BY escopo`, [m.slug])).rows,
        google_url_detectada: m.adaptador ? await urlPlanilhaDoHtml(m) : null,
      });
    }
    res.json({ modulos: lista, icones: ICONES });
  });

  r.post('/api/admin/modulos', json, async (req, res) => {
    const b = req.body || {};
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return erro(res, 400, 'Identificador inválido: use letras minúsculas, números e hífen (ex.: juridico-contratos).');
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    if (await modulos.obter(slug)) return erro(res, 409, 'Já existe um módulo com este identificador.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : 'compartilhado';
    await db.q(`INSERT INTO modulos (slug, nome, descricao, setor_id, icone, ordem, armazenamento, config) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)`,
      [slug, nome, String(b.descricao || ''), b.setor_id ? Number(b.setor_id) : null, ICONES.includes(b.icone) ? b.icone : 'app', Number(b.ordem) || 0, arm]);
    await seg.auditar(req, 'modulo_criado', slug, { nome });
    res.status(201).json({ slug });
  });

  r.patch('/api/admin/modulos/:slug', json, async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const b = { ...m, ...req.body };
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : m.armazenamento;
    const fonte = m.adaptador && ['google', 'interno'].includes(b.fonte_dados) ? b.fonte_dados : m.fonte_dados;
    const config = { ...m.config };
    if (Array.isArray(req.body.chaves_locais)) config.chaves_locais = req.body.chaves_locais.map(String).filter(Boolean).slice(0, 30);
    if (typeof req.body.google_url === 'string') config.google_url = req.body.google_url.trim();
    await db.q(`UPDATE modulos SET nome = $1, descricao = $2, setor_id = $3, icone = $4, ordem = $5, ativo = $6, armazenamento = $7, fonte_dados = $8,
      config = $9::jsonb, atualizado_em = now() WHERE slug = $10`, [nome, String(b.descricao || ''), b.setor_id ? Number(b.setor_id) : null,
      ICONES.includes(b.icone) ? b.icone : m.icone, Number(b.ordem) || 0, !!b.ativo, arm, fonte, JSON.stringify(config), m.slug]);
    if (Array.isArray(req.body.usuarios)) {
      await db.tx(async (t) => {
        await t.q('DELETE FROM permissoes WHERE modulo_slug = $1', [m.slug]);
        for (const id of req.body.usuarios) await t.q('INSERT INTO permissoes (usuario_id, modulo_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [Number(id), m.slug]);
      });
    }
    await seg.auditar(req, 'modulo_editado', m.slug, {
      nome, armazenamento: arm, fonte_dados: fonte, ativo: !!b.ativo,
      ...(arm !== m.armazenamento ? { armazenamento_anterior: m.armazenamento } : {}),
      ...(fonte !== m.fonte_dados ? { fonte_anterior: m.fonte_dados } : {}),
    });
    res.json({ ok: true });
  });

  r.delete('/api/admin/modulos/:slug', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    if (String(req.query.confirmar) !== m.slug) return erro(res, 400, 'Confirme digitando o identificador do módulo.');
    await db.q('DELETE FROM modulos WHERE slug = $1', [m.slug]); // versões, dados e permissões saem em cascata
    await seg.auditar(req, 'modulo_removido', m.slug, { nome: m.nome });
    res.json({ ok: true });
  });

  /* envio do HTML (corpo bruto) */
  const corpoBruto = express.raw({ type: () => true, limit: `${cfg.limiteHtmlMb}mb` });

  r.put('/api/admin/modulos/:slug/arquivo', corpoBruto, async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    const nomeOriginal = req.headers['x-nome-arquivo'] ? decodeURIComponent(String(req.headers['x-nome-arquivo'])) : null;
    const reconhecido = await modulos.reconhecer(buf);
    const id = await modulos.salvarVersao(m.slug, buf, nomeOriginal, req.usuario.id);
    await seg.auditar(req, 'arquivo_enviado', m.slug, { versao: id, nome: nomeOriginal, bytes: buf.length });
    // aviso se o arquivo parece ser de outra ferramenta
    const aviso = reconhecido && reconhecido !== m.slug ? `Atenção: este arquivo parece ser da ferramenta "${(await modulos.obter(reconhecido)).nome}".` : null;
    let avisoPatch = null;
    if (m.adaptador) {
      const html = buf.toString('utf8');
      const faltando = (m.config.patches_interno || []).filter((p) => (p.tipo === 'regex' ? !new RegExp(p.busca).test(html) : !html.includes(p.busca)));
      if (faltando.length) avisoPatch = 'Este HTML não tem os pontos de ligação esperados: o banco interno não poderá ser usado com esta versão.';
    }
    res.json({ ok: true, versao: id, aviso, aviso_banco: avisoPatch });
  });

  /* envio em lote: reconhece cada HTML pelo título */
  r.post('/api/admin/modulos/reconhecer', corpoBruto, async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    res.json({ slug: await modulos.reconhecer(buf) });
  });

  r.get('/api/admin/modulos/:slug/versoes', async (req, res) => res.json({ versoes: await modulos.listarVersoes(req.params.slug) }));

  r.post('/api/admin/modulos/:slug/versoes/:id/usar', async (req, res) => {
    if (!(await modulos.restaurarVersao(req.params.slug, Number(req.params.id)))) return erro(res, 404, 'Versão não encontrada.');
    await seg.auditar(req, 'versao_restaurada', req.params.slug, { versao: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== dados dos módulos ===================== */
  async function colecoesDoModulo(m) {
    const nomes = new Set(Object.keys(m.config.colecoes || {}));
    for (const x of await registros.resumo(m.slug)) nomes.add(x.colecao);
    return [...nomes];
  }
  const cabecalhoDe = async (m, c) => (await modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[c])) || (await registros.cabecalho(m.slug, c));

  r.get('/api/admin/modulos/:slug/dados', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const armazenamento = (await db.q('SELECT escopo, chave, valor, atualizado_em FROM armazenamento WHERE modulo_slug = $1 ORDER BY escopo, chave', [m.slug])).rows;
    const saida = { modulo: m.slug, nome: m.nome, exportado_em: new Date().toISOString(), colecoes: {}, armazenamento };
    for (const c of await colecoesDoModulo(m)) saida.colecoes[c] = { cabecalho: await cabecalhoDe(m, c), registros: await registros.listar(m.slug, c) };
    await seg.auditar(req, 'dados_exportados', m.slug, null);
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(saida);
  });

  r.get('/api/admin/modulos/:slug/dados/:colecao.csv', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return erro(res, 404, 'Módulo sem planilha interna.');
    const c = req.params.colecao;
    const linhas = await registros.listar(m.slug, c);
    let cab, matriz;
    if (m.adaptador === 'gas-linhas') {
      cab = (await cabecalhoDe(m, c)) || [];
      matriz = linhas;
    } else {
      const ks = new Set();
      linhas.forEach((o) => Object.keys(o).forEach((k) => ks.add(k)));
      cab = [...ks];
      matriz = linhas.map((o) => cab.map((k) => o[k]));
    }
    const cel = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cab, ...matriz].map((l) => l.map(cel).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${c}.csv"`);
    res.type('text/csv').send(csv);
  });

  /* importa os dados lidos da planilha Google (o navegador do admin lê a planilha e envia para cá) */
  r.post('/api/admin/modulos/:slug/importar', express.json({ limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return erro(res, 404, 'Módulo sem planilha interna.');
    const colecao = String((req.body && req.body.colecao) || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(colecao)) return erro(res, 400, 'Coleção inválida.');
    const dados = req.body.dados;
    if (!Array.isArray(dados)) return erro(res, 400, 'Dados inválidos.');
    const itens = [];
    const vistos = new Set();
    if (m.adaptador === 'gas-linhas') {
      if (!dados.every(Array.isArray)) return erro(res, 400, 'Esperava linhas da planilha.');
      const [cab, ...rows] = dados;
      if (cab) await registros.salvarCabecalho(m.slug, colecao, cab);
      rows.forEach((row, i) => {
        if (!row.some((v) => v !== '' && v != null)) return;
        const id = row[0] != null && String(row[0]).trim() !== '' ? String(row[0]) : `sheet-${i + 1}`;
        if (vistos.has(id)) return; // mantém a primeira ocorrência (mesma regra do "remover duplicados")
        vistos.add(id);
        itens.push({ id, dados: row });
      });
    } else {
      for (const o of dados) {
        if (!o || typeof o !== 'object') continue;
        const id = o.id != null && o.id !== '' ? o.id : o.key;
        if (id == null || id === '' || vistos.has(String(id))) continue;
        vistos.add(String(id));
        itens.push({ id, dados: o });
      }
    }
    await registros.substituirTudo(m.slug, colecao, itens, req.usuario.id);
    await seg.auditar(req, 'dados_importados', m.slug, { colecao, total: itens.length, origem: 'google' });
    res.json({ ok: true, total: itens.length });
  });

  /* ===================== auditoria ===================== */
  r.get('/api/admin/auditoria', async (req, res) => {
    const where = [];
    const args = [];
    const p = (v) => { args.push(v); return '$' + args.length; };
    if (req.query.usuario) where.push('usuario_id = ' + p(Number(req.query.usuario)));
    if (req.query.modulo) where.push('modulo_slug = ' + p(String(req.query.modulo)));
    if (req.query.acao) where.push('acao LIKE ' + p(String(req.query.acao) + '%'));
    if (req.query.ocultar_aberturas === '1') where.push("acao NOT IN ('modulo_aberto','dados_gravados')");
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const pagina = Math.max(Number(req.query.pagina) || 0, 0);
    const sql = `SELECT id, quando, usuario_email, acao, modulo_slug, detalhe, ip FROM auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC LIMIT ${p(limite)} OFFSET ${p(pagina * limite)}`;
    res.json({ eventos: (await db.q(sql, args)).rows });
  });

  /* ===================== backup (JSON com todas as tabelas) ===================== */
  r.get('/api/admin/backup', async (req, res) => {
    const tabelas = ['setores', 'usuarios', 'modulos', 'permissoes', 'modulo_versoes', 'armazenamento', 'colecoes', 'registros', 'auditoria'];
    const saida = { sistema: 'portal-myblue', versao_backup: 2, gerado_em: new Date().toISOString(), tabelas: {} };
    for (const t of tabelas) {
      const { rows } = await db.q(`SELECT * FROM ${t}`);
      // HTMLs em base64; hashes de senha ficam fora do backup por segurança
      saida.tabelas[t] = rows.map((l) => {
        const c = { ...l };
        if (Buffer.isBuffer(c.conteudo)) c.conteudo = c.conteudo.toString('base64');
        delete c.senha_hash;
        return c;
      });
    }
    await seg.auditar(req, 'backup_baixado', null, null);
    res.set('Content-Disposition', `attachment; filename="myblue-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(saida);
  });

  return r;
}

module.exports = { rotasAdmin, ICONES };
