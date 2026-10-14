'use strict';
/*
 * Demonstrativos de comissão ("Minhas comissões").
 *
 * A ferramenta de Comissionamento (módulo com config.relatorios_comissao) envia, depois do mês aprovado,
 * o demonstrativo de cada pessoa. Quem vê cada demonstrativo:
 *   - a própria pessoa (dona do demonstrativo), que confirma com "Estou ciente";
 *   - os leitores enviados junto: líderes dela (supervisão, coordenação, gerência) e a diretoria;
 *   - quem abre a ferramenta de Comissionamento (o gestor da comissão e a administração do portal, que abre todas).
 * Ninguém mais: nem a supervisão de tickets, nem coordenadores de outros setores, nem os colegas.
 * Reenviar cria uma nova versão; a anterior fica guardada e sai das listas.
 */
const express = require('express');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeComp = (c) => { const [a, m] = c.split('-'); return `${MESES[Number(m) - 1].replace(/^./, (x) => x.toUpperCase())}/${a}`; };
const COMP_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const LIMITE_HTML = 1.5 * 1024 * 1024;

// o demonstrativo é exibido sem scripts, formulários nem recursos de fora (só as fontes do Google)
const CSP_RELATORIO = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; "
  + "frame-ancestors 'self'; form-action 'none'; base-uri 'none'";
const semScripts = (html) => String(html).replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*>/gi, '');

function rotasComissao({ db, seg, cfg, avisos }) {
  const r = express.Router();
  r.use('/api/comissao', seg.exigirLogin);
  const json = express.json({ limit: `${cfg.limiteDadosMb}mb` });
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  /* quem envia: só quem abre um módulo marcado como ferramenta de comissão */
  async function podeEnviar(u, slug) {
    const m = await db.um('SELECT slug, config FROM modulos WHERE slug = $1', [String(slug || '')]);
    if (!m || !m.config || !m.config.relatorios_comissao) return false;
    return seg.podeAcessar(u, m.slug);
  }

  /* usuários do portal, para ligar cada pessoa da ferramenta ao login dela */
  r.get('/api/comissao/usuarios', async (req, res) => {
    if (!(await podeEnviar(req.usuario, req.query.modulo))) return erro(res, 403, 'Só quem usa a ferramenta de Comissionamento vê esta lista.');
    const { rows } = await db.q(`SELECT u.id, u.nome, u.email, u.papel, COALESCE(string_agg(s.nome, ', ' ORDER BY s.ordem), '') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id LEFT JOIN setores s ON s.id = sm.setor_id
      WHERE u.ativo GROUP BY u.id ORDER BY u.nome`);
    res.json({ usuarios: rows });
  });

  /* envio (ou reenvio) dos demonstrativos de uma competência */
  r.post('/api/comissao/relatorios', json, async (req, res) => {
    const b = req.body || {};
    const slug = String(b.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a ferramenta de Comissionamento envia demonstrativos.');
    const comp = String(b.competencia || '');
    if (!COMP_RE.test(comp)) return erro(res, 400, 'Competência inválida (use aaaa-mm).');
    const lista = Array.isArray(b.relatorios) ? b.relatorios : [];
    if (!lista.length) return erro(res, 400, 'Nenhum demonstrativo para enviar.');
    if (lista.length > 500) return erro(res, 400, 'Envie no máximo 500 demonstrativos por vez.');

    const ativos = new Set((await db.q('SELECT id FROM usuarios WHERE ativo')).rows.map((x) => x.id));
    const itens = [];
    for (const x of lista) {
      const chave = texto(x.chave, 80);
      const dono = Number(x.usuario_id);
      const html = String(x.html || '');
      if (!chave) return erro(res, 400, 'Demonstrativo sem identificação da pessoa.');
      if (!ativos.has(dono)) return erro(res, 400, `${texto(x.nome, 80) || chave}: usuário do portal inválido ou inativo.`);
      if (!/<html[\s>]/i.test(html) || Buffer.byteLength(html) > LIMITE_HTML) return erro(res, 400, `${texto(x.nome, 80) || chave}: demonstrativo inválido.`);
      const leitores = new Map();
      for (const l of Array.isArray(x.leitores) ? x.leitores : []) {
        const id = Number(l && typeof l === 'object' ? l.usuario_id : l);
        if (ativos.has(id) && id !== dono) leitores.set(id, l && l.motivo === 'diretoria' ? 'diretoria' : 'lider');
      }
      itens.push({ chave, dono, nome: texto(x.nome, 160) || chave, cargo: texto(x.cargo, 160), setor: texto(x.setor, 120),
        valor: Math.round((Number(x.valor) || 0) * 100) / 100, html: semScripts(html), leitores });
    }

    const enviados = await db.tx(async (t) => {
      const out = [];
      for (const it of itens) {
        const ant = await t.um(`SELECT id, versao FROM comissao_relatorios WHERE modulo_slug = $1 AND competencia = $2 AND chave = $3 AND substituido_em IS NULL
          ORDER BY id DESC LIMIT 1`, [slug, comp, it.chave]);
        if (ant) await t.q('UPDATE comissao_relatorios SET substituido_em = now() WHERE id = $1', [ant.id]);
        const { id } = await t.um(`INSERT INTO comissao_relatorios (modulo_slug, competencia, chave, usuario_id, nome, cargo, setor, valor, html, versao, enviado_por)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [slug, comp, it.chave, it.dono, it.nome, it.cargo, it.setor, it.valor, it.html, ant ? ant.versao + 1 : 1, req.usuario.id]);
        for (const [uid, motivo] of it.leitores) await t.q('INSERT INTO comissao_leitores (relatorio_id, usuario_id, motivo) VALUES ($1, $2, $3)', [id, uid, motivo]);
        out.push({ id, chave: it.chave, dono: it.dono, versao: ant ? ant.versao + 1 : 1, leitores: [...it.leitores.keys()] });
      }
      return out;
    });

    // avisos: a pessoa (sino + e-mail curto, sem valores) e, uma vez por envio, cada líder/diretor (só no sino)
    const rot = nomeComp(comp);
    for (const e of enviados) {
      await avisos.notificar([e.dono], {
        tipo: 'comissao', link: `#/comissoes/${e.id}`, email: b.avisar_email !== false, autor_id: req.usuario.id,
        titulo: e.versao > 1 ? `Seu demonstrativo de comissão de ${rot} foi atualizado` : `Seu demonstrativo de comissão de ${rot} está disponível`,
        texto: `Confira o demonstrativo de ${rot} em Minhas comissões, no portal, e clique em “Estou ciente”.`,
      });
    }
    const porLeitor = new Map();
    for (const e of enviados) for (const l of e.leitores) porLeitor.set(l, (porLeitor.get(l) || 0) + 1);
    for (const [l, n] of porLeitor) {
      await avisos.notificar([l], {
        tipo: 'comissao', link: '#/comissoes/equipe', email: false, autor_id: req.usuario.id,
        titulo: `Demonstrativos de comissão de ${rot}`, texto: `${n} demonstrativo(s) de comissão de ${rot} da sua equipe estão em Minhas comissões.`,
      });
    }
    await seg.auditar(req, 'comissao_enviada', slug, { competencia: comp, demonstrativos: enviados.length, reenvios: enviados.filter((e) => e.versao > 1).length });
    res.status(201).json({ enviados: enviados.map((e) => ({ id: e.id, chave: e.chave, versao: e.versao })) });
  });

  /* situação dos demonstrativos de uma competência (para a ferramenta) */
  r.get('/api/comissao/relatorios', async (req, res) => {
    const slug = String(req.query.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a ferramenta de Comissionamento vê esta lista.');
    const comp = String(req.query.competencia || '');
    if (!COMP_RE.test(comp)) return erro(res, 400, 'Competência inválida.');
    const { rows } = await db.q(`SELECT r.id, r.chave, r.usuario_id, u.nome AS usuario_nome, r.valor, r.versao, r.enviado_em, r.aberto_em, r.ciente_em,
        (SELECT COUNT(*)::int FROM comissao_leitores l WHERE l.relatorio_id = r.id) AS leitores
      FROM comissao_relatorios r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.modulo_slug = $1 AND r.competencia = $2 AND r.substituido_em IS NULL ORDER BY r.nome`, [slug, comp]);
    res.json({ relatorios: rows.map((x) => ({ ...x, valor: Number(x.valor) })) });
  });

  const CAMPOS = `r.id, r.competencia, r.nome, r.cargo, r.setor, r.valor, r.versao, r.enviado_em, r.aberto_em, r.ciente_em`;
  const comValor = (rows) => rows.map((x) => ({ ...x, valor: Number(x.valor) }));

  /* os meus demonstrativos e os da equipe que eu acompanho */
  r.get('/api/comissao/meus', async (req, res) => {
    const u = req.usuario;
    const meus = comValor((await db.q(`SELECT ${CAMPOS} FROM comissao_relatorios r
      WHERE r.usuario_id = $1 AND r.substituido_em IS NULL ORDER BY r.competencia DESC, r.id DESC`, [u.id])).rows);
    const equipe = comValor((await db.q(`SELECT ${CAMPOS}, l.motivo FROM comissao_relatorios r JOIN comissao_leitores l ON l.relatorio_id = r.id
      WHERE l.usuario_id = $1 AND r.substituido_em IS NULL AND r.usuario_id <> $1 ORDER BY r.competencia DESC, r.setor, r.nome`, [u.id])).rows);
    res.json({ meus, equipe });
  });

  r.get('/api/comissao/resumo', async (req, res) => {
    const u = req.usuario;
    const a = await db.um(`SELECT COUNT(*)::int AS meus, COUNT(*) FILTER (WHERE ciente_em IS NULL)::int AS pendentes
      FROM comissao_relatorios WHERE usuario_id = $1 AND substituido_em IS NULL`, [u.id]);
    const e = await db.um(`SELECT COUNT(*)::int AS n FROM comissao_relatorios r JOIN comissao_leitores l ON l.relatorio_id = r.id
      WHERE l.usuario_id = $1 AND r.substituido_em IS NULL`, [u.id]);
    res.json({ meus: a.meus, pendentes: a.pendentes, equipe: e.n });
  });

  /* um demonstrativo: a pessoa, quem está na lista de leitores dele ou quem usa a ferramenta que o enviou */
  async function relatorioVisivel(req, res) {
    const rel = await db.um('SELECT * FROM comissao_relatorios WHERE id = $1', [Number(req.params.id) || 0]);
    let ok = false;
    if (rel) {
      ok = rel.usuario_id === req.usuario.id
        || !!(await db.um('SELECT 1 FROM comissao_leitores WHERE relatorio_id = $1 AND usuario_id = $2', [rel.id, req.usuario.id]))
        || (await podeEnviar(req.usuario, rel.modulo_slug));
    }
    if (!ok) { erro(res, 404, 'Demonstrativo não encontrado.'); return null; }
    return rel;
  }

  r.get('/api/comissao/relatorios/:id', async (req, res) => {
    const rel = await relatorioVisivel(req, res);
    if (!rel) return;
    const { html, ...info } = rel;
    res.set('Cache-Control', 'private, no-store');
    res.json({ relatorio: { ...info, valor: Number(info.valor), meu: rel.usuario_id === req.usuario.id, substituido: !!rel.substituido_em } });
  });

  r.get('/api/comissao/relatorios/:id/ver', async (req, res) => {
    const rel = await relatorioVisivel(req, res);
    if (!rel) return;
    if (rel.usuario_id === req.usuario.id && !rel.aberto_em) {
      await db.q('UPDATE comissao_relatorios SET aberto_em = now() WHERE id = $1 AND aberto_em IS NULL', [rel.id]);
    }
    res.set('Content-Security-Policy', CSP_RELATORIO);
    res.set('Cache-Control', 'private, no-store');
    res.type('html').send(semScripts(rel.html));
  });

  r.post('/api/comissao/relatorios/:id/ciente', async (req, res) => {
    const rel = await relatorioVisivel(req, res);
    if (!rel) return;
    if (rel.usuario_id !== req.usuario.id) return erro(res, 403, 'Só a própria pessoa confirma o demonstrativo.');
    if (rel.substituido_em) return erro(res, 409, 'Este demonstrativo foi atualizado. Abra a versão nova.');
    await db.q('UPDATE comissao_relatorios SET ciente_em = COALESCE(ciente_em, now()), aberto_em = COALESCE(aberto_em, now()) WHERE id = $1', [rel.id]);
    await seg.auditar(req, 'comissao_ciente', rel.modulo_slug, { competencia: rel.competencia, relatorio: rel.id });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasComissao };
