'use strict';
const express = require('express');
const { hostsDoPortal } = require('../seguranca');

const CALLBACK_RE = /^[A-Za-z_$][\w$]{0,80}$/;
const COLECAO_RE = /^[A-Za-z0-9_-]{1,40}$/;

const paginaSimples = (titulo, msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><link rel="stylesheet" href="/estilos.css"></head><body class="pagina-aviso"><div class="aviso-card"><img src="/img/logo.png" alt="MyBlue" height="40">
<h1>${titulo}</h1><p>${msg}</p><a class="btn primary" href="/" target="_top">Voltar ao início</a></div></body></html>`;

function rotasFerramentas({ db, seg, modulos, registros, documentos, avisos, cfg }) {
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
    const { rows } = await db.q('SELECT chave, valor, versao FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2', [x.m.slug, x.escopo]);
    res.set('Cache-Control', 'no-store');
    res.json({ dados: Object.fromEntries(rows.map((l) => [l.chave, l.valor])), versoes: Object.fromEntries(rows.map((l) => [l.chave, Number(l.versao)])) });
  });

  /* Grava o lote. Com `base` ({ chave: versão que a página conhece; 0 = não existia }), confere antes:
     se outra pessoa gravou a chave depois, nada do lote é gravado e volta { conflito } com o que está no banco.
     Gravar o mesmo valor que já está no banco nunca é conflito. Devolve a versão nova de cada chave gravada. */
  const gravarArmazenamento = (slug, escopo, corpo, usuarioId) => db.tx(async (t) => {
    const base = corpo.base && typeof corpo.base === 'object' && !corpo.limpar ? corpo.base : null;
    const set = Object.entries(corpo.set || {}).map(([k, v]) => [String(k), String(v)]);
    const del = (corpo.del || []).map(String);
    if (base) {
      const chaves = set.map(([k]) => k).concat(del).filter((k) => Object.prototype.hasOwnProperty.call(base, k));
      if (chaves.length) {
        // uma gravação conferida por vez em cada ferramenta (inclui chaves novas, que ainda não têm linha para travar)
        await t.q('SELECT pg_advisory_xact_lock(hashtext($1))', [slug + '|' + escopo]);
        const { rows } = await t.q('SELECT chave, valor, versao FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2 AND chave = ANY($3::text[]) FOR UPDATE',
          [slug, escopo, chaves]);
        const atual = Object.fromEntries(rows.map((r) => [r.chave, r]));
        const novo = Object.fromEntries(set);
        const conflito = {};
        for (const k of chaves) {
          const a = atual[k];
          if (Number(base[k]) === (a ? Number(a.versao) : 0)) continue;
          if (k in novo ? (a && a.valor === novo[k]) : !a) continue; // o banco já está como a página quer
          conflito[k] = a ? { valor: a.valor, versao: Number(a.versao) } : { valor: null, versao: 0 };
        }
        if (Object.keys(conflito).length) return { conflito };
      }
    }
    if (corpo.limpar) await t.q('DELETE FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2', [slug, escopo]);
    const versoes = {};
    for (const k of del) { await t.q('DELETE FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2 AND chave = $3', [slug, escopo, k]); versoes[k] = 0; }
    for (const [k, v] of set) {
      const r = await t.um(`INSERT INTO armazenamento (modulo_slug, escopo, chave, valor, atualizado_por) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (modulo_slug, escopo, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por,
          versao = CASE WHEN armazenamento.valor = excluded.valor THEN armazenamento.versao ELSE armazenamento.versao + 1 END
        RETURNING versao`, [slug, escopo, k, v, usuarioId]);
      versoes[k] = Number(r.versao);
    }
    return { versoes };
  });

  r.post('/api/armazenamento/:slug', seg.exigirLogin, express.json({ limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const x = await moduloComArmazenamento(req, res);
    if (!x) return;
    const corpo = req.body || {};
    if ((corpo.set && typeof corpo.set !== 'object') || (corpo.del && !Array.isArray(corpo.del))) return res.status(400).json({ erro: 'Formato inválido.' });
    if (corpo.base && typeof corpo.base !== 'object') return res.status(400).json({ erro: 'Formato inválido.' });
    const r = await gravarArmazenamento(x.m.slug, x.escopo, corpo, req.usuario.id);
    if (r.conflito) {
      await seg.auditar(req, 'dados_conflito', x.m.slug, { chaves: Object.keys(r.conflito).slice(0, 20) });
      return res.status(409).json({ erro: 'Outra pessoa alterou estes dados depois que a página foi aberta.', conflito: r.conflito });
    }
    const chaves = Object.keys(corpo.set || {});
    await seg.auditar(req, 'dados_gravados', x.m.slug, { chaves: chaves.slice(0, 20), removidas: (corpo.del || []).slice(0, 20), limpar: !!corpo.limpar, escopo: x.escopo === '*' ? 'equipe' : 'usuario' });
    res.json({ ok: true, versoes: r.versoes });
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

  /* pessoas ativas que podem abrir a ferramenta: administradores, permissão direta ou gestores do setor dela */
  async function pessoasDoModulo(slug, busca) {
    const { rows } = await db.q(`SELECT u.id, u.nome, u.email, u.foto_em FROM usuarios u
      WHERE u.ativo AND (u.papel = 'admin'
        OR u.id IN (SELECT usuario_id FROM permissoes WHERE modulo_slug = $1)
        OR (u.papel = ANY($2::text[]) AND u.id IN (SELECT sm.usuario_id FROM setor_membros sm JOIN modulos m ON m.setor_id = sm.setor_id WHERE m.slug = $1)))
      ORDER BY u.nome`, [slug, seg.GESTORES_DE_SETOR]);
    const t = semAcento(busca || '').trim();
    return t ? rows.filter((u) => semAcento(u.nome).includes(t) || semAcento(u.email).includes(t)) : rows;
  }
  const pessoaJson = (u, eu) => ({ id: `mb-${u.id}`, name: u.nome, email: u.email,
    avatarUrl: u.foto_em ? `/api/usuarios/${u.id}/foto?v=${new Date(u.foto_em).getTime()}` : '', isMe: u.id === eu, guest: false });

  /* avisos enviados pela ferramenta (sino do portal + e-mail, quando configurado) */
  const enviosAviso = new Map(); // usuário|ferramenta → horários dos últimos envios
  const LIMITE_AVISOS = 60; // por pessoa e ferramenta a cada 10 minutos
  r.get('/api/db/:slug/avisos', seg.exigirLogin, async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    res.json({ email_ativo: !!(avisos && avisos.emailAtivo) });
  });
  r.post('/api/db/:slug/avisos', seg.exigirLogin, express.json({ limit: '50kb' }), async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    const b = req.body || {};
    const ids = [...new Set((Array.isArray(b.para) ? b.para : []).map((x) => /^mb-(\d{1,9})$/.exec(String(x))).filter(Boolean).map((x) => Number(x[1])))];
    const titulo = String(b.titulo == null ? '' : b.titulo).trim().slice(0, 160);
    const texto = String(b.texto == null ? '' : b.texto).trim().slice(0, 1000);
    const ref = b.ref == null || b.ref === '' ? '' : String(b.ref);
    if (!ids.length || ids.length > 50 || !titulo) return res.status(400).json({ code: 'invalid_argument', erro: 'Informe quem recebe (até 50 pessoas) e o título do aviso.' });
    if (ref && !/^[A-Za-z0-9_\-.:]{1,80}$/.test(ref)) return res.status(400).json({ code: 'invalid_argument', erro: 'Referência inválida.' });
    const chave = `${req.usuario.id}|${m.slug}`;
    const agora = Date.now();
    const recentes = (enviosAviso.get(chave) || []).filter((t) => agora - t < 10 * 60 * 1000);
    if (recentes.length >= LIMITE_AVISOS) return res.status(429).json({ code: 'resource_exhausted', erro: 'Avisos demais em pouco tempo. Aguarde alguns minutos.' });
    recentes.push(agora);
    enviosAviso.set(chave, recentes);
    const podem = new Set((await pessoasDoModulo(m.slug)).map((u) => u.id));
    const destino = ids.filter((id) => podem.has(id));
    if (avisos && destino.length) {
      await avisos.notificar(destino, { tipo: 'ferramenta', titulo, texto, link: `#/m/${m.slug}${ref ? '/' + ref : ''}`, email: b.email !== false, autor_id: req.usuario.id });
    }
    await seg.auditar(req, 'aviso_enviado', m.slug, { para: destino, ignorados: ids.filter((id) => !podem.has(id)), titulo });
    res.json({ ok: true, enviados: destino.filter((id) => id !== req.usuario.id).length, ignorados: ids.length - destino.length, email_ativo: !!(avisos && avisos.emailAtivo) });
  });

  /* nomes de quem aparece nos registros (ids "mb-<n>" do portal; ids antigos do Claude pelo config do módulo).
     Com ?busca=… lista quem tem acesso à ferramenta (filtrado por nome ou e-mail). */
  r.get('/api/db/:slug/pessoas', seg.exigirLogin, async (req, res) => {
    const m = await moduloComDocumentos(req, res);
    if (!m) return;
    if (req.query.busca !== undefined) {
      const lista = (await pessoasDoModulo(m.slug, String(req.query.busca).slice(0, 80))).slice(0, 100).map((u) => pessoaJson(u, req.usuario.id));
      return res.json({ lista });
    }
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

  /* Conferência opcional "o registro ainda está como eu vi?": a ferramenta manda em `antes` o registro como ela o
     mostrou (null = não existia). Se outra pessoa alterou depois, a gravação é recusada (409, conflito: true) e
     volta o registro atual. Sem `antes`, grava como sempre. JSONB reordena as chaves: a comparação ignora a ordem. */
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
      : JSON.stringify(v === undefined ? null : v));
  const temAntes = (p) => Object.prototype.hasOwnProperty.call(p, 'antes');
  const antesDe = (p) => { let a = p.antes; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* texto puro */ } } return a; };
  const conflitoGas = (res, cb, atual) => responder(res, cb, { ok: false, conflito: true, error: 'Outra pessoa alterou este registro depois que você abriu a tela. Atualize e tente de novo.', atual }, 409);

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
    if (acao === 'update' || acao === 'setStatus' || acao === 'delete') {
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
      // excluir exige nº do pedido e vencimento iguais (nunca apaga pela posição sozinha)
      if (acao === 'delete' && (p.num == null || String(p.num).trim() === '')) return responder(res, cb, { ok: false, error: 'informe o nº do pedido' }, 400);
      const confere = (l) => l && (idx.num === undefined || igual(l.dados[idx.num], p.num)) && (!p.venc || idx.venc === undefined || mesmaData(l.dados[idx.venc], p.venc) || acao === 'update');
      if (!confere(alvo)) alvo = linhas.find((l) => idx.num !== undefined && igual(l.dados[idx.num], p.num) && (!p.venc || idx.venc === undefined || mesmaData(l.dados[idx.venc], p.venc)));
      if (!alvo) return responder(res, cb, { ok: false, error: 'linha não encontrada' }, 409);
      if (temAntes(p) && p.antes && typeof p.antes === 'object') {
        const a = antesDe(p);
        const mudou = ['num', 'desc', 'valor', 'venc', 'status'].some((c) => a[c] !== undefined && idx[c] !== undefined
          && !(c === 'venc' ? mesmaData(alvo.dados[idx[c]], a[c]) : igual(alvo.dados[idx[c]], a[c])));
        if (mudou) return conflitoGas(res, cb, alvo.dados);
      }
      if (acao === 'delete') {
        await registros.apagar(m.slug, colecao, alvo.id);
        await log({ linha: Number(p.row), pedido: p.num });
        return responder(res, cb, { ok: true });
      }
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
            if (temAntes(p)) {
              const atual = await registros.obter(m.slug, colecao, id);
              if (canon(atual) !== canon(antesDe(p)) && canon(atual) !== canon(p.row)) return conflitoGas(res, cb, atual);
            }
            await registros.upsert(m.slug, colecao, id, p.row, uid); await log({ id });
            return responder(res, cb, { ok: true });
          }
          case 'delete':
            if (p.id == null) break;
            if (temAntes(p)) {
              const atual = await registros.obter(m.slug, colecao, p.id);
              if (atual && canon(atual) !== canon(antesDe(p))) return conflitoGas(res, cb, atual);
            }
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
        if (temAntes(p)) {
          const atual = await registros.obter(m.slug, colecao, id);
          if (canon(atual) !== canon(antesDe(p)) && canon(atual) !== canon(item)) return conflitoGas(res, cb, atual);
        }
        const r2 = await registros.upsert(m.slug, colecao, id, item, uid); await log({ id, resultado: r2 });
        return responder(res, cb, { ok: true });
      }
      if (acao === 'delete') {
        if (p.id == null || p.id === '') return responder(res, cb, { ok: false, error: 'id ausente' }, 400);
        if (temAntes(p)) {
          const atual = await registros.obter(m.slug, colecao, p.id);
          if (atual && canon(atual) !== canon(antesDe(p))) return conflitoGas(res, cb, atual);
        }
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
