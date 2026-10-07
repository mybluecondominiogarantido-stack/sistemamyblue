'use strict';
/*
 * Central de Links: página do portal com os links úteis da empresa, aberta a todos que entram no portal.
 * Quem cuida dela (administrador ou pessoa marcada como "Marketing — Central de Links" no cadastro)
 * edita os links e cadastra as campanhas do mês: cada campanha tem a imagem de fundo (computador e,
 * se quiser, uma versão para celular) e passa a valer sozinha na data de início.
 */
const express = require('express');

const ICONES_LINK = ['link', 'documento', 'calendario', 'pessoas', 'grafico', 'casa', 'ticket', 'escudo', 'carteira', 'calculadora', 'mensagem', 'video', 'pasta', 'megafone'];
const URL_RE = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s()-]+)$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/* tipo da imagem pelos primeiros bytes (não confia no cabeçalho enviado) */
function tipoImagem(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* data de hoje no fuso da empresa (a campanha vira à meia-noite de Brasília, não de Londres) */
function hojeNoFuso(fuso = process.env.EXPEDIENTE_FUSO || 'America/Sao_Paulo', agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const podeEditar = (u) => !!u && (u.papel === 'admin' || !!u.editor_links);

function rotasLinks({ db, seg, cfg }) {
  const r = express.Router();
  const json = express.json({ limit: '200kb' });
  const limiteFundo = (cfg.limiteFundoMb || 8) * 1024 * 1024;
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  r.use('/api/links', seg.exigirLogin);
  r.use('/api/links/gestao', (req, res, next) => (podeEditar(req.usuario) ? next() : erro(res, 403, 'Só o marketing e a administração editam a Central de Links.')));

  const CAMPOS_CAMPANHA = `id, nome, to_char(inicio, 'YYYY-MM-DD') AS inicio, escurecer, atualizado_em,
    fundo IS NOT NULL AS tem_fundo, fundo_celular IS NOT NULL AS tem_fundo_celular,
    COALESCE(octet_length(fundo), 0) AS tamanho_fundo, COALESCE(octet_length(fundo_celular), 0) AS tamanho_fundo_celular`;

  function comEnderecos(c) {
    if (!c) return null;
    const v = new Date(c.atualizado_em).getTime();
    return {
      ...c,
      fundo_url: c.tem_fundo ? `/api/links/campanhas/${c.id}/fundo?v=${v}` : null,
      fundo_celular_url: c.tem_fundo_celular ? `/api/links/campanhas/${c.id}/fundo-celular?v=${v}` : null,
    };
  }

  async function pagina() {
    return (await db.um("SELECT titulo, subtitulo FROM links_pagina WHERE id = 1")) || { titulo: 'Central de Links', subtitulo: '' };
  }

  /* campanha em vigor: a de início mais recente que já começou */
  const campanhaVigente = async () => comEnderecos(await db.um(
    `SELECT ${CAMPOS_CAMPANHA} FROM links_campanhas WHERE inicio <= $1::date ORDER BY inicio DESC, id DESC LIMIT 1`, [hojeNoFuso()]));

  /* ===================== página (todos) ===================== */
  r.get('/api/links', async (req, res) => {
    let campanha;
    // pré-visualização de outra campanha, para quem edita
    if (req.query.campanha && podeEditar(req.usuario)) {
      campanha = comEnderecos(await db.um(`SELECT ${CAMPOS_CAMPANHA} FROM links_campanhas WHERE id = $1`, [Number(req.query.campanha) || 0]));
    } else campanha = await campanhaVigente();
    const links = (await db.q('SELECT id, grupo, titulo, url, descricao, icone FROM links WHERE ativo ORDER BY ordem, id')).rows;
    res.json({ pagina: await pagina(), campanha, links, pode_editar: podeEditar(req.usuario) });
  });

  const COLUNA = { fundo: 'fundo', 'fundo-celular': 'fundo_celular' };
  r.get('/api/links/campanhas/:id/:qual', async (req, res) => {
    const col = COLUNA[req.params.qual];
    if (!col) return erro(res, 404, 'Imagem não encontrada.');
    const c = await db.um(`SELECT ${col} AS img, ${col}_tipo AS tipo FROM links_campanhas WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!c || !c.img) return erro(res, 404, 'Imagem não encontrada.');
    res.set('Content-Type', c.tipo);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    // o endereço muda (?v=) a cada troca de imagem, então pode ficar guardado no navegador
    res.set('Cache-Control', 'private, max-age=604800');
    res.send(c.img);
  });

  /* ===================== gestão (marketing / admin) ===================== */
  r.get('/api/links/gestao', async (req, res) => {
    const links = (await db.q(`SELECT l.id, l.grupo, l.titulo, l.url, l.descricao, l.icone, l.ordem, l.ativo, l.atualizado_em, u.nome AS atualizado_por_nome
      FROM links l LEFT JOIN usuarios u ON u.id = l.atualizado_por ORDER BY l.ordem, l.id`)).rows;
    const campanhas = (await db.q(`SELECT ${CAMPOS_CAMPANHA} FROM links_campanhas ORDER BY inicio DESC, id DESC`)).rows.map(comEnderecos);
    const vigente = await campanhaVigente();
    res.json({ pagina: await pagina(), links, campanhas, vigente_id: vigente ? vigente.id : null, hoje: hojeNoFuso(), icones: ICONES_LINK, limite_fundo_mb: limiteFundo / 1048576 });
  });

  r.put('/api/links/gestao/pagina', json, async (req, res) => {
    const titulo = String((req.body && req.body.titulo) || '').trim();
    const subtitulo = String((req.body && req.body.subtitulo) || '').trim();
    if (!titulo || titulo.length > 120) return erro(res, 400, 'Informe o título da página (até 120 caracteres).');
    if (subtitulo.length > 300) return erro(res, 400, 'Subtítulo longo demais (até 300 caracteres).');
    await db.q(`INSERT INTO links_pagina (id, titulo, subtitulo) VALUES (1, $1, $2)
      ON CONFLICT (id) DO UPDATE SET titulo = excluded.titulo, subtitulo = excluded.subtitulo, atualizado_em = now()`, [titulo, subtitulo]);
    await seg.auditar(req, 'links_pagina', null, { titulo, subtitulo });
    res.json({ ok: true });
  });

  function dadosLink(b) {
    const titulo = String(b.titulo || '').trim();
    const url = String(b.url || '').trim();
    const grupo = String(b.grupo || '').trim();
    const descricao = String(b.descricao || '').trim();
    const icone = ICONES_LINK.includes(b.icone) ? b.icone : 'link';
    if (!titulo || titulo.length > 120) return { erro: 'Informe o nome do link (até 120 caracteres).' };
    if (!URL_RE.test(url) || url.length > 2000) return { erro: 'Endereço inválido. Use um link completo, começando com https://' };
    if (grupo.length > 80) return { erro: 'Nome do grupo longo demais (até 80 caracteres).' };
    if (descricao.length > 300) return { erro: 'Descrição longa demais (até 300 caracteres).' };
    return { titulo, url, grupo, descricao, icone, ativo: b.ativo === undefined ? true : !!b.ativo };
  }

  r.post('/api/links/gestao/links', json, async (req, res) => {
    const d = dadosLink(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    const { id } = await db.um(`INSERT INTO links (grupo, titulo, url, descricao, icone, ativo, ordem, atualizado_por)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM links), $7) RETURNING id`,
    [d.grupo, d.titulo, d.url, d.descricao, d.icone, d.ativo, req.usuario.id]);
    await seg.auditar(req, 'link_criado', null, { id, titulo: d.titulo, url: d.url });
    res.status(201).json({ id });
  });

  r.patch('/api/links/gestao/links/:id', json, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const atual = await db.um('SELECT grupo, titulo, url, descricao, icone, ativo FROM links WHERE id = $1', [id]);
    if (!atual) return erro(res, 404, 'Link não encontrado.');
    const d = dadosLink({ ...atual, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    await db.q(`UPDATE links SET grupo = $1, titulo = $2, url = $3, descricao = $4, icone = $5, ativo = $6, atualizado_em = now(), atualizado_por = $7 WHERE id = $8`,
      [d.grupo, d.titulo, d.url, d.descricao, d.icone, d.ativo, req.usuario.id, id]);
    await seg.auditar(req, 'link_editado', null, { id, titulo: d.titulo, url: d.url, ativo: d.ativo });
    res.json({ ok: true });
  });

  r.delete('/api/links/gestao/links/:id', async (req, res) => {
    const l = await db.um('DELETE FROM links WHERE id = $1 RETURNING titulo, url', [Number(req.params.id) || 0]);
    if (!l) return erro(res, 404, 'Link não encontrado.');
    await seg.auditar(req, 'link_removido', null, l);
    res.json({ ok: true });
  });

  /* nova ordem: lista de ids, de cima para baixo */
  r.put('/api/links/gestao/ordem', json, async (req, res) => {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) return erro(res, 400, 'Envie a lista de links na nova ordem.');
    await db.tx(async (t) => { for (let i = 0; i < ids.length; i++) await t.q('UPDATE links SET ordem = $1 WHERE id = $2', [i + 1, ids[i]]); });
    res.json({ ok: true });
  });

  function dadosCampanha(b) {
    const nome = String(b.nome || '').trim();
    const inicio = String(b.inicio || '').trim();
    const escurecer = Math.round(Number(b.escurecer));
    if (!nome || nome.length > 100) return { erro: 'Informe o nome da campanha (até 100 caracteres).' };
    if (!DATA_RE.test(inicio) || Number.isNaN(Date.parse(inicio))) return { erro: 'Informe a data em que a campanha começa.' };
    if (!(escurecer >= 0 && escurecer <= 85)) return { erro: 'O escurecimento do fundo vai de 0% a 85%.' };
    return { nome, inicio, escurecer };
  }

  r.post('/api/links/gestao/campanhas', json, async (req, res) => {
    const d = dadosCampanha({ escurecer: 0, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    const { id } = await db.um('INSERT INTO links_campanhas (nome, inicio, escurecer, criado_por) VALUES ($1, $2, $3, $4) RETURNING id',
      [d.nome, d.inicio, d.escurecer, req.usuario.id]);
    await seg.auditar(req, 'campanha_criada', null, { id, ...d });
    res.status(201).json({ id });
  });

  r.patch('/api/links/gestao/campanhas/:id', json, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const atual = await db.um("SELECT nome, to_char(inicio, 'YYYY-MM-DD') AS inicio, escurecer FROM links_campanhas WHERE id = $1", [id]);
    if (!atual) return erro(res, 404, 'Campanha não encontrada.');
    const d = dadosCampanha({ ...atual, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    await db.q('UPDATE links_campanhas SET nome = $1, inicio = $2, escurecer = $3, atualizado_em = now() WHERE id = $4', [d.nome, d.inicio, d.escurecer, id]);
    await seg.auditar(req, 'campanha_editada', null, { id, ...d });
    res.json({ ok: true });
  });

  r.delete('/api/links/gestao/campanhas/:id', async (req, res) => {
    const c = await db.um('DELETE FROM links_campanhas WHERE id = $1 RETURNING id, nome', [Number(req.params.id) || 0]);
    if (!c) return erro(res, 404, 'Campanha não encontrada.');
    await seg.auditar(req, 'campanha_removida', null, c);
    res.json({ ok: true });
  });

  const corpoImagem = express.raw({ type: () => true, limit: limiteFundo });
  r.put('/api/links/gestao/campanhas/:id/:qual', corpoImagem, async (req, res) => {
    const col = COLUNA[req.params.qual];
    if (!col) return erro(res, 404, 'Rota não encontrada.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tipo = tipoImagem(buf);
    if (!tipo) return erro(res, 400, 'Envie uma imagem JPG, PNG ou WEBP.');
    const c = await db.um(`UPDATE links_campanhas SET ${col} = $1, ${col}_tipo = $2, atualizado_em = now() WHERE id = $3 RETURNING id, nome`,
      [buf, tipo, Number(req.params.id) || 0]);
    if (!c) return erro(res, 404, 'Campanha não encontrada.');
    await seg.auditar(req, 'campanha_fundo', null, { id: c.id, nome: c.nome, imagem: col === 'fundo' ? 'computador' : 'celular', tamanho: buf.length });
    res.json({ ok: true });
  });

  r.delete('/api/links/gestao/campanhas/:id/fundo-celular', async (req, res) => {
    const c = await db.um('UPDATE links_campanhas SET fundo_celular = NULL, fundo_celular_tipo = NULL, atualizado_em = now() WHERE id = $1 RETURNING id', [Number(req.params.id) || 0]);
    if (!c) return erro(res, 404, 'Campanha não encontrada.');
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasLinks, tipoImagem, hojeNoFuso, ICONES_LINK };
