'use strict';
/*
 * Tutoriais em vídeo: cada pessoa vê os do perfil, do setor e das ferramentas dela.
 * O vídeo sai aos pedaços (Range), direto do banco, para o player poder avançar e voltar
 * sem baixar o arquivo inteiro. Só a administração envia e remove vídeos.
 */
const express = require('express');
const { TUTORIAIS, GRUPOS, porSlug, rotuloPublico, visibilidade, duracaoMp4 } = require('../tutoriais');

const PEDACO = 1024 * 1024; // 1 MB por resposta parcial

function rotasTutoriais({ db, seg, cfg }) {
  const r = express.Router();
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });
  const limiteVideo = (cfg.limiteVideoMb || 150) * 1024 * 1024;

  r.use('/api/tutoriais', seg.exigirLogin);

  const resumo = (t, linha) => ({
    slug: t.slug, grupo: t.grupo, titulo: t.titulo, descricao: t.descricao, publico: rotuloPublico(t.publico),
    modulo: typeof t.publico === 'object' ? t.publico.modulo : null,
    tem_video: !!(linha && linha.tem_video), tem_legendas: !!(linha && linha.tem_legendas),
    duracao: linha ? linha.duracao_s : null, tamanho: linha ? linha.tamanho : null,
    enviado_em: linha ? linha.enviado_em : null, v: linha ? new Date(linha.enviado_em).getTime() : null,
  });
  const LINHAS = 'SELECT slug, video IS NOT NULL AS tem_video, legendas IS NOT NULL AS tem_legendas, duracao_s, tamanho, enviado_em FROM tutoriais';
  async function linhas() {
    const m = new Map();
    for (const l of (await db.q(LINHAS)).rows) m.set(l.slug, l);
    return m;
  }

  async function podeVer(req, slug) {
    const t = porSlug.get(slug);
    if (!t) return null;
    return (await visibilidade(db, seg, req.usuario))(t) ? t : null;
  }

  r.get('/api/tutoriais', async (req, res) => {
    const ver = await visibilidade(db, seg, req.usuario);
    const l = await linhas();
    res.set('Cache-Control', 'no-store');
    res.json({ grupos: GRUPOS, tutoriais: TUTORIAIS.filter((t) => ver(t) && l.get(t.slug)?.tem_video).map((t) => resumo(t, l.get(t.slug))) });
  });

  r.get('/api/tutoriais/:slug/video', async (req, res) => {
    const t = await podeVer(req, req.params.slug);
    const info = t && await db.um('SELECT tamanho FROM tutoriais WHERE slug = $1 AND video IS NOT NULL', [t.slug]);
    if (!info) return res.status(404).end();
    const total = info.tamanho;
    let ini = 0;
    let fim = total - 1;
    const intervalo = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (intervalo && (intervalo[1] || intervalo[2])) {
      if (intervalo[1] === '') ini = Math.max(0, total - Number(intervalo[2]));
      else { ini = Number(intervalo[1]); if (intervalo[2]) fim = Math.min(Number(intervalo[2]), total - 1); }
      if (ini > fim) { res.set('Content-Range', `bytes */${total}`); return res.status(416).end(); }
      fim = Math.min(fim, ini + PEDACO - 1);
    }
    const { parte } = await db.um('SELECT substring(video from $1 for $2) AS parte FROM tutoriais WHERE slug = $3', [ini + 1, fim - ini + 1, t.slug]);
    res.status(intervalo ? 206 : 200);
    res.set({
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(parte.length),
      // o endereço muda a cada vídeo novo (?v=)
      'Cache-Control': 'private, max-age=604800',
      'Content-Security-Policy': "default-src 'none'",
    });
    if (intervalo) res.set('Content-Range', `bytes ${ini}-${ini + parte.length - 1}/${total}`);
    res.end(Buffer.from(parte));
  });

  r.get('/api/tutoriais/:slug/legendas', async (req, res) => {
    const t = await podeVer(req, req.params.slug);
    const l = t && await db.um('SELECT legendas FROM tutoriais WHERE slug = $1 AND legendas IS NOT NULL', [t.slug]);
    if (!l) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=604800');
    res.type('text/vtt; charset=utf-8').send(l.legendas);
  });

  /* ---------- administração (o acesso só do administrador é conferido em rotasAdmin) ---------- */
  r.get('/api/admin/tutoriais', async (req, res) => {
    const l = await linhas();
    res.json({ grupos: GRUPOS, tutoriais: TUTORIAIS.map((t) => resumo(t, l.get(t.slug))) });
  });

  const slugValido = (req, res, next) => (porSlug.has(req.params.slug) ? next() : erro(res, 404, 'Este vídeo não está na lista de tutoriais.'));

  r.put('/api/admin/tutoriais/:slug/video', slugValido, express.raw({ type: () => true, limit: limiteVideo }), async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') return erro(res, 400, 'Envie o vídeo em MP4.');
    await db.q(`INSERT INTO tutoriais (slug, video, tamanho, duracao_s, enviado_por, enviado_em) VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (slug) DO UPDATE SET video = EXCLUDED.video, tamanho = EXCLUDED.tamanho, duracao_s = EXCLUDED.duracao_s,
        enviado_por = EXCLUDED.enviado_por, enviado_em = now()`, [req.params.slug, buf, buf.length, duracaoMp4(buf), req.usuario.id]);
    await seg.auditar(req, 'tutorial_enviado', null, { slug: req.params.slug, bytes: buf.length });
    res.json({ ok: true });
  });

  r.put('/api/admin/tutoriais/:slug/legendas', slugValido, express.text({ type: () => true, limit: '512kb' }), async (req, res) => {
    const txt = String(req.body || '').replace(/^﻿/, '');
    if (!/^WEBVTT/.test(txt)) return erro(res, 400, 'Envie as legendas em .vtt (WEBVTT).');
    await db.q(`INSERT INTO tutoriais (slug, legendas, enviado_por) VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET legendas = EXCLUDED.legendas`, [req.params.slug, txt, req.usuario.id]);
    res.json({ ok: true });
  });

  r.delete('/api/admin/tutoriais/:slug', slugValido, async (req, res) => {
    await db.q('DELETE FROM tutoriais WHERE slug = $1', [req.params.slug]);
    await seg.auditar(req, 'tutorial_removido', null, { slug: req.params.slug });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasTutoriais };
