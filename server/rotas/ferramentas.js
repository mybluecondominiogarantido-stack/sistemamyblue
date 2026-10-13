'use strict';
const express = require('express');
const { hostsDoPortal } = require('../seguranca');

const CALLBACK_RE = /^[A-Za-z_$][\w$]{0,80}$/;
const COLECAO_RE = /^[A-Za-z0-9_-]{1,40}$/;

const paginaSimples = (titulo, msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><link rel="stylesheet" href="/estilos.css"></head><body class="pagina-aviso"><div class="aviso-card"><img src="/img/logo.png" alt="MyBlue" height="40">
<h1>${titulo}</h1><p>${msg}</p><a class="btn primary" href="/" target="_top">Voltar ao início</a></div></body></html>`;

function rotasFerramentas({ db, seg, modulos, registros, documentos, cfg }) {
  const r = express.Router();

  /* ---------- lista de ferramentas do usuário ---------- */
  r.get('/api/modulos', seg.exigirLogin, async (req, res) => {
    const permitidos = req.usuario.papel === 'admin' ? null : await seg.modulosDoUsuario(req.usuario);
    const lista = (await modulos.listar())
      .filter((m) => (m.ativo || req.usuario.papel === 'admin') && (!permitidos || permitidos.has(m.slug)))
      .map((m) => ({ slug: m.slug, nome: m.nome, descricao: m.descricao, setor: m.setor_nome || 'Outros', setor_ordem: m.setor_ordem ?? 999,
        icone: m.icone, ativo: m.ativo, tem_arquivo: m.tem_arquivo, versao_em: m.versao_em }));
    const { rows: recentes } = await db.q(`SELECT modulo_slug, MAX(quando) AS quando FROM auditoria
      WHERE usuario_id = $1 AND acao = 'modulo_aberto' GROUP BY modulo_slug ORDER BY quando DESC LIMIT 6`, [req.usuario.id]);
    res.json({ modulos: lista, recentes: recentes.map((x) => x.modulo_slug) });
  });

  /* ---------- entrega da ferramenta (HTML) ---------- */
  r.get('/m/:slug', async (req, res) => {
    const slug = req.params.slug;
    if (!req.path.endsWith('/')) return res.redirect(301, `/m/${encodeURIComponent(slug)}/`);
    if (!req.usuario) return res.redirect(`/login?volta=${encodeURIComponent('/#/m/' + slug)}`);
    if (req.usuario.trocar_senha) return res.redirect('/');
    const m = await modulos.obter(slug);
    if (!m || (!m.ativo && req.usuario.papel !== 'admin')) return res.status(404).send(paginaSimples('Ferramenta não encontrada', 'Esta ferramenta não existe ou foi desativada.'));
    if (!(await seg.podeAcessar(req.usuario, slug))) return res.status(403).send(paginaSimples('Sem acesso', 'Você não tem permissão para esta ferramenta. Peça acesso à administração.'));
    if (!m.tem_arquivo) {
      return res.status(404).send(paginaSimples('Ferramenta ainda sem arquivo',
        req.usuario.papel === 'admin' ? 'Envie o HTML desta ferramenta em Administração → Módulos.' : 'A administração ainda não publicou o arquivo desta ferramenta.'));
    }
    const html = await modulos.montarHtml(m, req.usuario);
    await seg.auditar(req, 'modulo_aberto', slug, null);
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  });

  /* ---------- armazenamento (localStorage das ferramentas no servidor) ---------- */
  async function moduloComArmazenamento(req, res) {
    const m = await modulos.obter(req.params.slug);
    if (!m || !(await seg.podeAcessar(req.usuario, m.slug))) { res.status(403).json({ erro: 'Sem acesso a esta ferramenta.' }); return null; }
    if (m.armazenamento === 'navegador') { res.status(409).json({ erro: 'Esta ferramenta guarda os dados só no navegador.' }); return null; }
    return { m, escopo: m.armazenamento === 'compartilhado' ? '*' : `u:${req.usuario.id}` };
  }

  r.get('/api/armazenamento/:slug', seg.exigirLogin, async (req, res) => {
    const x = await moduloComArmazenamento(req, res);
    if (!x) return;
    const { rows } = await db.q('SELECT chave, valor FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2', [x.m.slug, x.escopo]);
    res.set('Cache-Control', 'no-store');
    res.json({ dados: Object.fromEntries(rows.map((l) => [l.chave, l.valor])) });
  });

  const gravarArmazenamento = (slug, escopo, corpo, usuarioId) => db.tx(async (t) => {
    if (corpo.limpar) await t.q('DELETE FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2', [slug, escopo]);
    for (const k of corpo.del || []) await t.q('DELETE FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2 AND chave = $3', [slug, escopo, String(k)]);
    for (const [k, v] of Object.entries(corpo.set || {})) {
      await t.q(`INSERT INTO armazenamento (modulo_slug, escopo, chave, valor, atualizado_por) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (modulo_slug, escopo, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [slug, escopo, String(k), String(v), usuarioId]);
    }
  });

  r.post('/api/armazenamento/:slug', seg.exigirLogin, express.json({ limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const x = await moduloComArmazenamento(req, res);
    if (!x) return;
    const corpo = req.body || {};
    if ((corpo.set && typeof corpo.set !== 'object') || (corpo.del && !Array.isArray(corpo.del))) return res.status(400).json({ erro: 'Formato inválido.' });
    await gravarArmazenamento(x.m.slug, x.escopo, corpo, req.usuario.id);
    const chaves = Object.keys(corpo.set || {});
    await seg.auditar(req, 'dados_gravados', x.m.slug, { chaves: chaves.slice(0, 20), removidas: (corpo.del || []).slice(0, 20), limpar: !!corpo.limpar, escopo: x.escopo === '*' ? 'equipe' : 'usuario' });
    res.json({ ok: true });
  });

  /* ---------- banco de documentos das ferramentas feitas como artefato do Claude ---------- */
  const pessoaDe = (u) => `mb-${u.id}`;
  async function moduloComDocumentos(req, res) {
    const m = await modulos.obter(req.params.slug);
    if (!m || m.adaptador !== 'claude-db') { res.status(404).json({ code: 'not_granted', erro: 'Ferramenta sem banco de documentos.' }); return null; }
    if (!(await seg.podeAcessar(req.usuario, m.slug))) { res.status(403).json({ code: 'not_granted', erro: 'Sem acesso a esta ferramenta.' }); return null; }
    res.set('Cache-Control', 'no-store');
    return m;
  }
  const falhaDoc = (res, e) => {
    if (e && e.code && e.status) return res.status(e.status).json({ code: e.code, erro: e.message });
    console.error('[documentos]', e);
    return res.status(500).json({ code: 'unavailable', erro: 'Erro interno ao gravar.' });
  };

  r.get('/api/db/:slug', seg.exigirLogin, async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    res.json(await documentos.mudancas(m.slug, req.query.desde, pessoaDe(req.usuario)));
  });

  r.post('/api/db/:slug', seg.exigirLogin, express.json({ limit: '2mb' }), async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    try {
      const ops = (req.body || {}).ops;
      const r2 = await documentos.gravar(m.slug, ops, pessoaDe(req.usuario), req.usuario.id);
      await seg.auditar(req, 'documento_gravado', m.slug, { ops: ops.slice(0, 10).map((o) => `${o.op} ${o.path}`) });
      res.json(r2);
    } catch (e) { falhaDoc(res, e); }
  });

  r.post('/api/db/:slug/trava', seg.exigirLogin, express.json({ limit: '300kb' }), async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    try {
      const b = req.body || {};
      res.json(await documentos.adquirir(m.slug, b.path, b, pessoaDe(req.usuario), req.usuario.id));
    } catch (e) { falhaDoc(res, e); }
  });

  /* nomes de quem aparece nos registros (ids "mb-<n>" do portal; ids antigos do Claude pelo config do módulo) */
  r.get('/api/db/:slug/pessoas', seg.exigirLogin, async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200);
    const numeros = ids.map((x) => /^mb-(\d{1,9})$/.exec(x)).filter(Boolean).map((x) => Number(x[1]));
    const { rows } = numeros.length ? await db.q('SELECT id, nome, email, foto_em FROM usuarios WHERE id = ANY($1::int[])', [numeros]) : { rows: [] };
    const legados = m.config.pessoas_legadas || {};
    const saida = {};
    for (const u of rows) {
      const id = `mb-${u.id}`;
      saida[id] = { id, name: u.nome, email: u.email, avatarUrl: u.foto_em ? `/api/usuarios/${u.id}/foto?v=${new Date(u.foto_em).getTime()}` : '', isMe: u.id === req.usuario.id, guest: false };
    }
    for (const id of ids) if (!saida[id] && typeof legados[id] === 'string') saida[id] = { id, name: legados[id], email: null, avatarUrl: '', isMe: false, guest: false };
    res.json({ pessoas: saida });
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
    try { return hostsDoPortal(req).has(new URL(ref).host); } catch { return false; }
  }

  /* ---------- planilha "posicional" (Controle de Pedidos): as alterações apontam a linha pela posição ---------- */
  const semAcento = (x) => String(x == null ? '' : x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // mesma regra que a ferramenta usa para achar as colunas pelo cabeçalho
  function colunas(cab) {
    const idx = {};
    (cab || []).forEach((col, i) => {
      const k = semAcento(col);
      if (k.includes('pedido') || k === 'n' || k.includes('numero')) idx.num = i;
      else if (k.includes('descri') || k.includes('fornecedor')) idx.desc = i;
      else if (k.includes('valor') || k.includes('preco')) idx.valor = i;
      else if (k.includes('parcela')) idx.parcelas = i;
      else if (k.includes('forma') || k.includes('pagamento')) idx.forma = i;
      else if (k.includes('vencimento') || k.includes('venc') || k.includes('data')) idx.venc = i;
      else if (k.includes('status') || k.includes('situa')) idx.status = i;
    });
    return idx;
  }
  const novoId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  async function planilhaPosicional(req, res, cb, m, colecao, acao, p, uid, log) {
    const cab = (await registros.cabecalho(m.slug, colecao)) || m.config.cabecalho_padrao || [];
    // devolve as células como texto, como a planilha Google entrega (a ferramenta usa .trim() em cada célula)
    const texto = (row) => row.map((v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)));
    if (!acao) return responder(res, cb, [cab, ...(await registros.listar(m.slug, colecao)).map(texto)]);
    if (acao === 'addMany' || acao === 'add') {
      const rows = acao === 'add' ? [p.row] : p.rows;
      if (!Array.isArray(rows) || !rows.every(Array.isArray)) return responder(res, cb, { ok: false, error: 'linhas inválidas' }, 400);
      if (!(await registros.cabecalho(m.slug, colecao)) && cab.length) await registros.salvarCabecalho(m.slug, colecao, cab);
      await registros.lote(m.slug, colecao, rows.map((row) => ({ id: novoId(), dados: row })), uid);
      await log({ total: rows.length });
      return responder(res, cb, { ok: true });
    }
    if (acao === 'update' || acao === 'setStatus') {
      const idx = colunas(cab);
      const linhas = await registros.listarComIds(m.slug, colecao);
      const igual = (a, b) => String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
      // datas podem vir como 31/12/2026 (da ferramenta) ou 2026-12-31… (da planilha Google importada)
      const dia = (v) => { const t = String(v == null ? '' : v).trim(); let x;
        if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return `${x[1]}-${x[2].padStart(2, '0')}-${x[3].padStart(2, '0')}`;
        if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t))) return `${x[3].length === 2 ? '20' + x[3] : x[3]}-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
        return t; };
      const mesmaData = (a, b) => dia(a) === dia(b);
      // a ferramenta envia a linha da planilha (cabeçalho = linha 1); confere pelo nº do pedido antes de alterar
      let alvo = linhas[Number(p.row) - 2];
      const confere = (l) => l && (idx.num === undefined || igual(l.dados[idx.num], p.num)) && (!p.venc || idx.venc === undefined || mesmaData(l.dados[idx.venc], p.venc) || acao === 'update');
      if (!confere(alvo)) alvo = linhas.find((l) => idx.num !== undefined && igual(l.dados[idx.num], p.num) && (!p.venc || idx.venc === undefined || mesmaData(l.dados[idx.venc], p.venc)));
      if (!alvo) return responder(res, cb, { ok: false, error: 'linha não encontrada' }, 409);
      const dados = [...alvo.dados];
      while (dados.length < cab.length) dados.push('');
      const por = (campo, valor) => { if (idx[campo] !== undefined && valor !== undefined) dados[idx[campo]] = valor; };
      por('status', p.status);
      if (acao === 'update') { por('num', p.num); por('desc', p.desc); por('valor', p.valor); por('venc', p.venc); }
      await registros.upsert(m.slug, colecao, alvo.id, dados, uid);
      await log({ linha: Number(p.row), pedido: p.num, status: p.status });
      return responder(res, cb, { ok: true });
    }
    return responder(res, cb, { ok: false, error: 'Ação desconhecida: ' + acao }, 400);
  }

  r.all('/api/gas/:slug', seg.exigirLogin, express.text({ type: () => true, limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const cb = req.query.callback && CALLBACK_RE.test(req.query.callback) ? req.query.callback : null;
    if (req.query.callback && !cb) return res.status(400).json({ erro: 'callback inválido' });
    const m = await modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return responder(res, cb, { ok: false, error: 'Módulo sem planilha interna.' }, 404);
    if (!(await seg.podeAcessar(req.usuario, m.slug))) return responder(res, cb, { ok: false, error: 'Sem acesso.' }, 403);
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
          const cab = (await modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[colecao])) || (await registros.cabecalho(m.slug, colecao));
          const linhas = await registros.listar(m.slug, colecao);
          return responder(res, cb, cab ? [cab, ...linhas] : linhas);
        }
        const idDaLinha = (row) => (Array.isArray(row) && row[0] != null && String(row[0]).trim() !== '' ? String(row[0]) : `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const validarLinhas = (rows) => Array.isArray(rows) && rows.every(Array.isArray);
        switch (acao) {
          case 'add':
            if (!Array.isArray(p.row)) break;
            await registros.upsert(m.slug, colecao, idDaLinha(p.row), p.row, uid); await log({ id: p.row[0] });
            return responder(res, cb, { ok: true });
          case 'update': {
            if (!Array.isArray(p.row)) break;
            const id = p.id != null ? String(p.id) : idDaLinha(p.row);
            await registros.upsert(m.slug, colecao, id, p.row, uid); await log({ id });
            return responder(res, cb, { ok: true });
          }
          case 'delete':
            if (p.id == null) break;
            await registros.apagar(m.slug, colecao, p.id); await log({ id: p.id });
            return responder(res, cb, { ok: true });
          case 'addMany':
            if (!validarLinhas(p.rows)) break;
            await registros.lote(m.slug, colecao, p.rows.map((row) => ({ id: idDaLinha(row), dados: row })), uid); await log({ total: p.rows.length });
            return responder(res, cb, { ok: true });
          case 'replaceAll':
            if (!validarLinhas(p.rows)) break;
            await registros.substituirTudo(m.slug, colecao, p.rows.map((row) => ({ id: idDaLinha(row), dados: row })), uid); await log({ total: p.rows.length });
            return responder(res, cb, { ok: true });
          case 'dedupe':
            // no banco interno cada ID é único: não existem linhas duplicadas para remover
            return responder(res, cb, { ok: true, removidos: 0 });
          default:
            return responder(res, cb, { ok: false, error: 'Ação desconhecida: ' + acao }, 400);
        }
        return responder(res, cb, { ok: false, error: 'Dados incompletos para ' + acao }, 400);
      }

      if (m.adaptador === 'gas-posicional') return await planilhaPosicional(req, res, cb, m, colecao, acao, p, uid, log);

      // gas-objetos
      if (!acao) return responder(res, cb, await registros.listar(m.slug, colecao));
      if (acao === 'upsert') {
        let item = p.item;
        if (typeof item === 'string') { try { item = JSON.parse(item); } catch { item = null; } }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return responder(res, cb, { ok: false, error: 'item inválido' }, 400);
        const id = item.id != null && item.id !== '' ? item.id : item.key;
        if (id == null || id === '') return responder(res, cb, { ok: false, error: 'item sem id' }, 400);
        const r2 = await registros.upsert(m.slug, colecao, id, item, uid); await log({ id, resultado: r2 });
        return responder(res, cb, { ok: true });
      }
      if (acao === 'delete') {
        if (p.id == null || p.id === '') return responder(res, cb, { ok: false, error: 'id ausente' }, 400);
        await registros.apagar(m.slug, colecao, p.id); await log({ id: p.id });
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
