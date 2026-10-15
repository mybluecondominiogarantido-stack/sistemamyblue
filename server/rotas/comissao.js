'use strict';
/*
 * Demonstrativos de premiação ("Minhas Premiações").
 *
 * A ferramenta Gestão de Premiações (módulo com config.relatorios_comissao) envia, depois do mês aprovado,
 * o demonstrativo de cada pessoa. Quem vê cada demonstrativo:
 *   - a própria pessoa (dona do demonstrativo), que confirma com "Estou ciente";
 *   - os leitores enviados junto: líderes dela (supervisão, coordenação, gerência) e a diretoria;
 *   - quem abre a Gestão de Premiações (o gestor da comissão e a administração do portal, que abre todas).
 * Ninguém mais: nem a supervisão de tickets, nem coordenadores de outros setores, nem os colegas.
 * Reenviar cria uma nova versão; a anterior fica guardada e sai das listas.
 *
 * Planilhas do mês: a gestão pede a planilha de cada pessoa (Crédito, Cobrança, metas dos setores…) a quem
 * envia — normalmente o coordenador do setor, que recebe um aviso só com a lista da equipe. Ele envia os arquivos
 * em "Minhas Premiações"; quem pediu recebe o aviso no sino e importa na ferramenta. Quem envia nunca vê a
 * ferramenta, as regras ou valores.
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
const SO_LEITURA = '<style>@media print{html,body{display:none!important}}html,body{-webkit-user-select:none;user-select:none}</style>';
const semImpressao = (html) => (/<\/head>/i.test(html) ? html.replace(/<\/head>/i, SO_LEITURA + '</head>') : SO_LEITURA + html);
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
    if (!(await podeEnviar(req.usuario, req.query.modulo))) return erro(res, 403, 'Só quem usa a Gestão de Premiações vê esta lista.');
    const { rows } = await db.q(`SELECT u.id, u.nome, u.email, u.papel, COALESCE(string_agg(s.nome, ', ' ORDER BY s.ordem), '') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id LEFT JOIN setores s ON s.id = sm.setor_id
      WHERE u.ativo GROUP BY u.id ORDER BY u.nome`);
    res.json({ usuarios: rows });
  });

  /* envio (ou reenvio) dos demonstrativos de uma competência */
  r.post('/api/comissao/relatorios', json, async (req, res) => {
    const b = req.body || {};
    const slug = String(b.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a Gestão de Premiações envia demonstrativos.');
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
        tipo: 'comissao', link: `#/premiacoes/${e.id}`, email: b.avisar_email !== false, autor_id: req.usuario.id,
        titulo: e.versao > 1 ? `Seu demonstrativo de premiação de ${rot} foi atualizado` : `Seu demonstrativo de premiação de ${rot} está disponível`,
        texto: `Confira o demonstrativo de ${rot} em Minhas Premiações, no portal, e clique em “Estou ciente”.`,
      });
    }
    const porLeitor = new Map();
    for (const e of enviados) for (const l of e.leitores) porLeitor.set(l, (porLeitor.get(l) || 0) + 1);
    for (const [l, n] of porLeitor) {
      await avisos.notificar([l], {
        tipo: 'comissao', link: '#/premiacoes/equipe', email: false, autor_id: req.usuario.id,
        titulo: `Demonstrativos de premiação de ${rot}`, texto: `${n} demonstrativo(s) de comissão de ${rot} da sua equipe estão em Minhas Premiações.`,
      });
    }
    await seg.auditar(req, 'comissao_enviada', slug, { competencia: comp, demonstrativos: enviados.length, reenvios: enviados.filter((e) => e.versao > 1).length });
    res.status(201).json({ enviados: enviados.map((e) => ({ id: e.id, chave: e.chave, versao: e.versao })) });
  });

  /* situação dos demonstrativos de uma competência (para a ferramenta) */
  r.get('/api/comissao/relatorios', async (req, res) => {
    const slug = String(req.query.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a Gestão de Premiações vê esta lista.');
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
    const pl = await db.um(`SELECT COUNT(*)::int AS n FROM comissao_planilhas WHERE usuario_id = $1 AND cancelado_em IS NULL AND enviado_em IS NULL`, [u.id]);
    res.json({ meus: a.meus, pendentes: a.pendentes, equipe: e.n, planilhas: pl.n });
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
    // em Minhas Premiações o demonstrativo é só para ler: impressão em branco e sem seleção de texto
    res.type('html').send(semImpressao(semScripts(rel.html)));
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

  /* ===================== planilhas do mês ===================== */
  const limiteArquivo = (cfg.limiteAnexoMb || 10) * 1024 * 1024;
  const corpoArquivo = express.raw({ type: () => true, limit: limiteArquivo });
  const EXT_PLANILHA = /\.(xlsx|xlsm|xls|csv)$/i;
  const CAMPOS_PLAN = `p.id, p.competencia, p.chave, p.usuario_id, p.tipo, p.titulo, p.nome, p.pedido_em, p.enviado_em, p.arquivo_nome, p.tamanho, p.importado_em`;

  /* a gestão pede as planilhas do mês (ou renova o pedido de quem já tinha) */
  r.post('/api/comissao/planilhas', json, async (req, res) => {
    const b = req.body || {};
    const slug = String(b.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a Gestão de Premiações pede planilhas.');
    const comp = String(b.competencia || '');
    if (!COMP_RE.test(comp)) return erro(res, 400, 'Competência inválida (use aaaa-mm).');
    const lista = Array.isArray(b.pedidos) ? b.pedidos : [];
    if (!lista.length) return erro(res, 400, 'Escolha quem deve enviar a planilha.');
    if (lista.length > 300) return erro(res, 400, 'No máximo 300 pedidos por vez.');
    const ativos = new Set((await db.q('SELECT id FROM usuarios WHERE ativo')).rows.map((x) => x.id));
    const itens = [];
    for (const x of lista) {
      const chave = texto(x.chave, 80), uid = Number(x.usuario_id);
      if (!chave) return erro(res, 400, 'Pedido sem identificação da pessoa.');
      if (!ativos.has(uid)) return erro(res, 400, `${texto(x.nome, 80) || chave}: usuário do portal inválido ou inativo.`);
      itens.push({ chave, uid, tipo: texto(x.tipo, 30), titulo: texto(x.titulo, 160) || 'Planilha de comissão', nome: texto(x.nome, 160) || chave });
    }
    const feitos = await db.tx(async (t) => {
      const out = [];
      for (const it of itens) {
        const ant = await t.um(`SELECT id FROM comissao_planilhas WHERE modulo_slug = $1 AND competencia = $2 AND chave = $3 AND cancelado_em IS NULL ORDER BY id DESC LIMIT 1`, [slug, comp, it.chave]);
        if (ant) {
          await t.q('UPDATE comissao_planilhas SET usuario_id = $2, tipo = $3, titulo = $4, nome = $5, pedido_por = $6 WHERE id = $1', [ant.id, it.uid, it.tipo, it.titulo, it.nome, req.usuario.id]);
          out.push({ id: ant.id, uid: it.uid, novo: false });
        } else {
          const { id } = await t.um(`INSERT INTO comissao_planilhas (modulo_slug, competencia, chave, usuario_id, tipo, titulo, nome, pedido_por)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [slug, comp, it.chave, it.uid, it.tipo, it.titulo, it.nome, req.usuario.id]);
          out.push({ id, uid: it.uid, novo: true });
        }
      }
      return out;
    });
    // um aviso por quem envia (normalmente o coordenador do setor, que manda as planilhas da equipe)
    const rot = nomeComp(comp);
    const porQuem = new Map();
    feitos.forEach((f, k) => { if (f.novo) porQuem.set(f.uid, (porQuem.get(f.uid) || []).concat(itens[k])); });
    for (const [uid, lista] of porQuem) {
      const nomes = lista.map((x) => x.nome);
      await avisos.notificar([uid], {
        tipo: 'comissao', link: '#/premiacoes/enviar', email: b.avisar_email !== false, autor_id: req.usuario.id,
        titulo: lista.length > 1 ? `Envie ${lista.length} planilhas de premiação de ${rot}` : `Envie a planilha de premiação de ${rot}`,
        texto: `A gestão de premiações pediu: ${lista.length > 1 ? nomes.join(', ') : `${lista[0].titulo}${lista[0].nome ? ' (' + lista[0].nome + ')' : ''}`}. Envie em Minhas Premiações, no portal.`,
      });
    }
    await seg.auditar(req, 'comissao_planilhas_pedidas', slug, { competencia: comp, pedidos: feitos.length });
    res.status(201).json({ pedidos: feitos.map((f) => ({ id: f.id, novo: f.novo })) });
  });

  /* situação dos pedidos de uma competência (para a ferramenta) */
  r.get('/api/comissao/planilhas', async (req, res) => {
    const slug = String(req.query.modulo || '');
    if (!(await podeEnviar(req.usuario, slug))) return erro(res, 403, 'Só quem usa a Gestão de Premiações vê os pedidos.');
    const comp = String(req.query.competencia || '');
    if (!COMP_RE.test(comp)) return erro(res, 400, 'Competência inválida.');
    const { rows } = await db.q(`SELECT ${CAMPOS_PLAN}, u.nome AS usuario_nome FROM comissao_planilhas p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.modulo_slug = $1 AND p.competencia = $2 AND p.cancelado_em IS NULL ORDER BY p.nome`, [slug, comp]);
    res.json({ planilhas: rows });
  });

  async function pedidoDaGestao(req, res) {
    const p = await db.um('SELECT * FROM comissao_planilhas WHERE id = $1 AND cancelado_em IS NULL', [Number(req.params.id) || 0]);
    if (!p || !(await podeEnviar(req.usuario, p.modulo_slug))) { erro(res, 404, 'Pedido não encontrado.'); return null; }
    return p;
  }
  // o arquivo é sempre baixado (nunca aberto no navegador)
  r.get('/api/comissao/planilhas/:id/arquivo', async (req, res) => {
    const p = await pedidoDaGestao(req, res);
    if (!p) return;
    if (!p.arquivo) return erro(res, 404, 'A pessoa ainda não enviou a planilha.');
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(p.arquivo_nome || 'planilha.xlsx')}`);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'private, no-store');
    res.send(p.arquivo);
  });
  r.post('/api/comissao/planilhas/:id/importado', async (req, res) => {
    const p = await pedidoDaGestao(req, res);
    if (!p) return;
    if (!p.enviado_em) return erro(res, 409, 'A pessoa ainda não enviou a planilha.');
    await db.q('UPDATE comissao_planilhas SET importado_em = now(), importado_por = $2 WHERE id = $1', [p.id, req.usuario.id]);
    res.json({ ok: true });
  });
  r.delete('/api/comissao/planilhas/:id', async (req, res) => {
    const p = await pedidoDaGestao(req, res);
    if (!p) return;
    await db.q('UPDATE comissao_planilhas SET cancelado_em = now() WHERE id = $1', [p.id]);
    res.json({ ok: true });
  });

  /* a pessoa: os pedidos dela e o envio do arquivo */
  r.get('/api/comissao/minhas-planilhas', async (req, res) => {
    const { rows } = await db.q(`SELECT p.id, p.competencia, p.tipo, p.titulo, p.nome, p.pedido_em, p.enviado_em, p.arquivo_nome, p.tamanho, p.importado_em
      FROM comissao_planilhas p WHERE p.usuario_id = $1 AND p.cancelado_em IS NULL ORDER BY p.competencia DESC, p.id DESC LIMIT 24`, [req.usuario.id]);
    res.json({ planilhas: rows });
  });
  r.post('/api/comissao/minhas-planilhas/:id', corpoArquivo, async (req, res) => {
    const p = await db.um('SELECT * FROM comissao_planilhas WHERE id = $1 AND cancelado_em IS NULL', [Number(req.params.id) || 0]);
    if (!p || p.usuario_id !== req.usuario.id) return erro(res, 404, 'Pedido não encontrado.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'planilha.xlsx';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || nome)); } catch { /* mantém padrão */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200);
    if (!EXT_PLANILHA.test(nome)) return erro(res, 400, 'Envie a planilha em Excel (.xlsx ou .xls) ou CSV.');
    const reenvio = !!p.enviado_em;
    await db.q(`UPDATE comissao_planilhas SET arquivo = $2, arquivo_nome = $3, arquivo_tipo = $4, tamanho = $5, enviado_em = now(), importado_em = NULL, importado_por = NULL WHERE id = $1`,
      [p.id, buf, nome, String(req.headers['content-type'] || 'application/octet-stream').slice(0, 120), buf.length]);
    // aviso no sino para quem pediu (e, se ninguém pediu, para quem usa a ferramenta não há como saber: fica na lista)
    if (p.pedido_por && p.pedido_por !== req.usuario.id) {
      await avisos.notificar([p.pedido_por], {
        tipo: 'comissao', link: `#/m/${p.modulo_slug}`, email: false, autor_id: req.usuario.id,
        titulo: `${req.usuario.nome} ${reenvio ? 'enviou de novo' : 'enviou'} a planilha${p.nome && p.nome !== req.usuario.nome ? ' de ' + p.nome : ''} (${nomeComp(p.competencia)})`,
        texto: `${p.titulo}: ${nome}. Abra a Gestão de Premiações → Planilhas do mês para importar e conferir.`,
      });
    }
    await seg.auditar(req, 'comissao_planilha_enviada', p.modulo_slug, { competencia: p.competencia, pedido: p.id, reenvio });
    res.status(201).json({ ok: true, enviado_em: new Date().toISOString() });
  });

  return r;
}

module.exports = { rotasComissao };
