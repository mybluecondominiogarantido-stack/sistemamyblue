'use strict';
const express = require('express');

const CALLBACK_RE = /^[A-Za-z_$][\w$]{0,80}$/;
const COLECAO_RE = /^[A-Za-z0-9_-]{1,40}$/;

const paginaSimples = (titulo, msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><link rel="stylesheet" href="/estilos.css"></head><body class="pagina-aviso"><div class="aviso-card"><img src="/img/logo.png" alt="MyBlue" height="40">
<h1>${titulo}</h1><p>${msg}</p><a class="btn primary" href="/" target="_top">Voltar ao início</a></div></body></html>`;

function rotasFerramentas({ db, seg, modulos, registros, cfg }) {
  const r = express.Router();

  const stArm = {
    ler: db.prepare('SELECT chave, valor FROM armazenamento WHERE modulo_slug = ? AND escopo = ?'),
    gravar: db.prepare(`INSERT INTO armazenamento (modulo_slug, escopo, chave, valor, atualizado_por) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(modulo_slug, escopo, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now'), atualizado_por = excluded.atualizado_por`),
    apagar: db.prepare('DELETE FROM armazenamento WHERE modulo_slug = ? AND escopo = ? AND chave = ?'),
    limpar: db.prepare('DELETE FROM armazenamento WHERE modulo_slug = ? AND escopo = ?'),
  };

  /* ---------- lista de ferramentas do usuário ---------- */
  r.get('/api/modulos', seg.exigirLogin, (req, res) => {
    const permitidos = req.usuario.papel === 'admin' ? null : seg.modulosDoUsuario(req.usuario);
    const lista = modulos.listar()
      .filter((m) => (m.ativo || req.usuario.papel === 'admin') && (!permitidos || permitidos.has(m.slug)))
      .map((m) => ({ slug: m.slug, nome: m.nome, descricao: m.descricao, setor: m.setor_nome || 'Outros', setor_ordem: m.setor_ordem ?? 999,
        icone: m.icone, ativo: m.ativo, tem_arquivo: m.tem_arquivo, versao_em: m.versao_em }));
    const recentes = db.prepare(`SELECT modulo_slug, MAX(quando) AS quando FROM auditoria
      WHERE usuario_id = ? AND acao = 'modulo_aberto' GROUP BY modulo_slug ORDER BY quando DESC LIMIT 6`).all(req.usuario.id);
    res.json({ modulos: lista, recentes: recentes.map((x) => x.modulo_slug) });
  });

  /* ---------- entrega da ferramenta (HTML) ---------- */
  r.get('/m/:slug', (req, res) => {
    const slug = req.params.slug;
    if (!req.path.endsWith('/')) return res.redirect(301, `/m/${encodeURIComponent(slug)}/`);
    if (!req.usuario) return res.redirect(`/login?volta=${encodeURIComponent('/#/m/' + slug)}`);
    if (req.usuario.trocar_senha) return res.redirect('/');
    const m = modulos.obter(slug);
    if (!m || (!m.ativo && req.usuario.papel !== 'admin')) return res.status(404).send(paginaSimples('Ferramenta não encontrada', 'Esta ferramenta não existe ou foi desativada.'));
    if (!seg.podeAcessar(req.usuario, slug)) return res.status(403).send(paginaSimples('Sem acesso', 'Você não tem permissão para esta ferramenta. Peça acesso à administração.'));
    if (!m.tem_arquivo) {
      return res.status(404).send(paginaSimples('Ferramenta ainda sem arquivo',
        req.usuario.papel === 'admin' ? 'Envie o HTML desta ferramenta em Administração → Módulos.' : 'A administração ainda não publicou o arquivo desta ferramenta.'));
    }
    const html = modulos.montarHtml(m, req.usuario);
    seg.auditar(req, 'modulo_aberto', slug, null);
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  });

  /* ---------- armazenamento (localStorage das ferramentas no servidor) ---------- */
  function moduloComArmazenamento(req, res) {
    const m = modulos.obter(req.params.slug);
    if (!m || !seg.podeAcessar(req.usuario, m.slug)) { res.status(403).json({ erro: 'Sem acesso a esta ferramenta.' }); return null; }
    if (m.armazenamento === 'navegador') { res.status(409).json({ erro: 'Esta ferramenta guarda os dados só no navegador.' }); return null; }
    return { m, escopo: m.armazenamento === 'compartilhado' ? '*' : `u:${req.usuario.id}` };
  }

  r.get('/api/armazenamento/:slug', seg.exigirLogin, (req, res) => {
    const x = moduloComArmazenamento(req, res);
    if (!x) return;
    res.set('Cache-Control', 'no-store');
    res.json({ dados: Object.fromEntries(stArm.ler.all(x.m.slug, x.escopo).map((l) => [l.chave, l.valor])) });
  });

  const gravarArmazenamento = db.transaction((slug, escopo, corpo, usuarioId) => {
    if (corpo.limpar) stArm.limpar.run(slug, escopo);
    for (const k of corpo.del || []) stArm.apagar.run(slug, escopo, String(k));
    for (const [k, v] of Object.entries(corpo.set || {})) stArm.gravar.run(slug, escopo, String(k), String(v), usuarioId);
  });

  r.post('/api/armazenamento/:slug', seg.exigirLogin, express.json({ limit: `${cfg.limiteDadosMb}mb` }), (req, res) => {
    const x = moduloComArmazenamento(req, res);
    if (!x) return;
    const corpo = req.body || {};
    if ((corpo.set && typeof corpo.set !== 'object') || (corpo.del && !Array.isArray(corpo.del))) return res.status(400).json({ erro: 'Formato inválido.' });
    gravarArmazenamento(x.m.slug, x.escopo, corpo, req.usuario.id);
    const chaves = Object.keys(corpo.set || {});
    seg.auditar(req, 'dados_gravados', x.m.slug, { chaves: chaves.slice(0, 20), removidas: (corpo.del || []).slice(0, 20), limpar: !!corpo.limpar, escopo: x.escopo === '*' ? 'equipe' : 'usuario' });
    res.json({ ok: true });
  });

  /* ---------- endpoint compatível com o Apps Script (substitui a planilha Google) ---------- */
  function responder(res, cb, dados, status = 200) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (cb) return res.status(status).type('application/javascript').send(`/**/${cb}(${JSON.stringify(dados)});`);
    return res.status(status).json(dados);
  }

  /* gravações por GET (JSONP) só valem quando a página que pediu é do próprio portal */
  function getDoProprioSite(req) {
    const sfs = req.headers['sec-fetch-site'];
    if (sfs) return sfs === 'same-origin';
    const ref = req.headers.referer;
    if (!ref) return false;
    try { return new URL(ref).host === req.headers.host; } catch { return false; }
  }

  r.all('/api/gas/:slug', seg.exigirLogin, express.text({ type: () => true, limit: `${cfg.limiteDadosMb}mb` }), (req, res) => {
    const cb = req.query.callback && CALLBACK_RE.test(req.query.callback) ? req.query.callback : null;
    if (req.query.callback && !cb) return res.status(400).json({ erro: 'callback inválido' });
    const m = modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return responder(res, cb, { ok: false, error: 'Módulo sem planilha interna.' }, 404);
    if (!seg.podeAcessar(req.usuario, m.slug)) return responder(res, cb, { ok: false, error: 'Sem acesso.' }, 403);
    if (!['GET', 'POST'].includes(req.method)) return responder(res, cb, { ok: false, error: 'Método não suportado.' }, 405);

    let corpo = {};
    if (req.method === 'POST' && typeof req.body === 'string' && req.body.trim()) {
      try { corpo = JSON.parse(req.body); } catch { return responder(res, cb, { ok: false, error: 'JSON inválido.' }, 400); }
    }
    const p = { ...req.query, ...corpo };
    const colecao = String(p.sheet || m.config.colecao_padrao || '');
    if (!COLECAO_RE.test(colecao)) return responder(res, cb, { ok: false, error: 'Aba inválida.' }, 400);
    const acao = p.action ? String(p.action) : null;
    if (acao && req.method === 'GET' && !getDoProprioSite(req)) return responder(res, cb, { ok: false, error: 'Origem não permitida.' }, 403);

    const uid = req.usuario.id;
    const log = (detalhe) => seg.auditar(req, 'registro_' + acao, m.slug, { colecao, ...detalhe });

    try {
      if (m.adaptador === 'gas-linhas') {
        if (!acao) {
          const cab = modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[colecao]) || registros.cabecalho(m.slug, colecao);
          const linhas = registros.listar(m.slug, colecao);
          return responder(res, cb, cab ? [cab, ...linhas] : linhas);
        }
        const idDaLinha = (row) => (Array.isArray(row) && row[0] != null && String(row[0]).trim() !== '' ? String(row[0]) : `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const validarLinhas = (rows) => Array.isArray(rows) && rows.every(Array.isArray);
        switch (acao) {
          case 'add':
            if (!Array.isArray(p.row)) break;
            registros.upsert(m.slug, colecao, idDaLinha(p.row), p.row, uid); log({ id: p.row[0] });
            return responder(res, cb, { ok: true });
          case 'update': {
            if (!Array.isArray(p.row)) break;
            const id = p.id != null ? String(p.id) : idDaLinha(p.row);
            registros.upsert(m.slug, colecao, id, p.row, uid); log({ id });
            return responder(res, cb, { ok: true });
          }
          case 'delete':
            if (p.id == null) break;
            registros.apagar(m.slug, colecao, p.id); log({ id: p.id });
            return responder(res, cb, { ok: true });
          case 'addMany':
            if (!validarLinhas(p.rows)) break;
            registros.lote(m.slug, colecao, p.rows.map((row) => ({ id: idDaLinha(row), dados: row })), uid); log({ total: p.rows.length });
            return responder(res, cb, { ok: true });
          case 'replaceAll':
            if (!validarLinhas(p.rows)) break;
            registros.substituirTudo(m.slug, colecao, p.rows.map((row) => ({ id: idDaLinha(row), dados: row })), uid); log({ total: p.rows.length });
            return responder(res, cb, { ok: true });
          case 'dedupe':
            // no banco interno cada ID é único: não existem linhas duplicadas para remover
            return responder(res, cb, { ok: true, removidos: 0 });
          default:
            return responder(res, cb, { ok: false, error: 'Ação desconhecida: ' + acao }, 400);
        }
        return responder(res, cb, { ok: false, error: 'Dados incompletos para ' + acao }, 400);
      }

      // gas-objetos
      if (!acao) return responder(res, cb, registros.listar(m.slug, colecao));
      if (acao === 'upsert') {
        let item = p.item;
        if (typeof item === 'string') { try { item = JSON.parse(item); } catch { item = null; } }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return responder(res, cb, { ok: false, error: 'item inválido' }, 400);
        const id = item.id != null && item.id !== '' ? item.id : item.key;
        if (id == null || id === '') return responder(res, cb, { ok: false, error: 'item sem id' }, 400);
        const r2 = registros.upsert(m.slug, colecao, id, item, uid); log({ id, resultado: r2 });
        return responder(res, cb, { ok: true });
      }
      if (acao === 'delete') {
        if (p.id == null || p.id === '') return responder(res, cb, { ok: false, error: 'id ausente' }, 400);
        registros.apagar(m.slug, colecao, p.id); log({ id: p.id });
        return responder(res, cb, { ok: true });
      }
      return responder(res, cb, { ok: false, error: 'Ação desconhecida: ' + acao }, 400);
    } catch (e) {
      console.error('[gas]', e);
      return responder(res, cb, { ok: false, error: 'Erro interno ao gravar.' }, 500);
    }
  });

  return r;
}

module.exports = { rotasFerramentas, paginaSimples };
