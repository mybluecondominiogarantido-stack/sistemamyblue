'use strict';
/*
 * Acompanhamento da implantação: painel, mês vigente, metas de onboarding e de documentação, antecipações e os
 * parâmetros das metas (com histórico). As regras estão em server/implantacoes/metas.js.
 *
 * Quem vê: setor Implantação, coordenação, diretoria e administração. Parâmetros e a meta de documentação marcada à mão:
 * coordenação e administração. Cobrar documentos (só ao executivo): o setor, a coordenação e a administração.
 */
const M = require('../implantacoes/metas');
const F = require('../implantacoes/formulario');

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const ABERTAS = "i.enviado_em IS NOT NULL AND i.etapa NOT IN ('rascunho','diretoria','cancelada')";
const DIAS_LEMBRETE_DOC = 3;

async function historicoParametros(db) {
  return (await db.q(`SELECT p.id, p.valores, to_char(p.vale_desde, 'YYYY-MM-DD') AS vale_desde, p.alterado_em, u.nome AS alterado_por_nome
    FROM implantacao_parametros p LEFT JOIN usuarios u ON u.id = p.alterado_por ORDER BY p.vale_desde, p.id`)).rows;
}

/* as implantações enviadas (uma ou todas), já com o cálculo das metas */
async function carregarLinhas(db, { id = null, hoje = M.diaSP(Date.now()), historico = null } = {}) {
  historico = historico || await historicoParametros(db);
  const filtro = id ? ` AND i.id = ${Number(id) || 0}` : '';
  const { rows } = await db.q(`SELECT i.id, i.protocolo, i.condominio, i.uf, i.origem, i.etapa, i.executivo_id, i.responsavel_id, i.solicitante_id,
      i.formulario, i.etapas, i.enviado_em, i.meta_doc_manual, i.cobranca_doc_em, i.lembrete_doc_em, e.nome AS executivo_nome, u.nome AS responsavel_nome
    FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios u ON u.id = i.responsavel_id
    WHERE ${ABERTAS}${filtro} ORDER BY i.enviado_em`);
  const datas = {};
  for (const d of (await db.q(`SELECT d.implantacao_id, d.tipo, MIN(d.enviado_em) AS em FROM implantacao_documentos d
      JOIN implantacoes i ON i.id = d.implantacao_id WHERE ${ABERTAS}${filtro} GROUP BY d.implantacao_id, d.tipo`)).rows) {
    (datas[d.implantacao_id] = datas[d.implantacao_id] || {})[d.tipo] = M.diaSP(d.em);
  }
  return rows.map((i) => ({ ...M.linha(i, datas[i.id], historico, hoje), cobranca_doc_em: i.cobranca_doc_em, _bruto: i }));
}

/* cobrança dos documentos da meta: só ao executivo (sem usuário no portal, a quem pediu a implantação) */
async function cobrarDocumentos(db, avisos, l, { autorId = null, lembrete = false } = {}) {
  const i = l._bruto;
  const ex = i.executivo_id ? await db.um('SELECT usuario_id FROM executivos WHERE id = $1', [i.executivo_id]) : null;
  const para = (ex && ex.usuario_id) || i.solicitante_id;
  if (!para) return false;
  const d = l.documentacao;
  const limite = d.limite.split('-').reverse().join('/');
  const recebidos = d.docs.filter((x) => x.em).map((x) => x.nome);
  await avisos.notificar([para], { link: `#/implantacao/${l.id}`, autor_id: autorId, tipo: 'implantacao', email: true,
    titulo: `${lembrete ? 'Faltam poucos dias · ' : ''}Documentos pendentes para implantação – ${l.condominio}`,
    texto: `Para concluir a implantação de ${l.condominio} (${l.protocolo}), ainda precisamos de: ${d.falta.join('; ')}.` +
      `${recebidos.length ? ` Já recebemos: ${recebidos.join('; ')}.` : ''} O prazo é ${limite}. Envie pelo portal, na implantação, em Documentos.` });
  return true;
}

function rotasAcompanhamento(r, { db, seg, avisos, perfil, erro, evento, json }) {
  const interno = (p) => p.admin || p.equipe || p.coordenacao || p.diretoria;

  r.get('/api/implantacoes/acompanhamento', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!interno(p)) return erro(res, 403, 'O acompanhamento é do setor Implantação, da coordenação e da diretoria.');
    const hoje = M.diaSP(Date.now());
    const historico = await historicoParametros(db);
    const atual = M.parametrosEm(historico, hoje);
    const linhas = (await carregarLinhas(db, { hoje, historico })).map(({ _bruto, ...l }) => l);
    const porIds = [...new Set(linhas.map((l) => l.onboarding.por).filter(Boolean))];
    const nomesPor = new Map(porIds.length ? (await db.q(`SELECT id, nome FROM usuarios WHERE id IN (${porIds.map(Number).join(',')})`)).rows.map((x) => [x.id, x.nome]) : []);
    for (const l of linhas) l.onboarding.por_nome = nomesPor.get(l.onboarding.por) || '';
    const q = req.query || {};
    const ano = Number(q.ano) || Number(hoje.slice(0, 4));
    const mes = Number(q.mes) >= 1 && Number(q.mes) <= 12 ? Number(q.mes) : null;
    const analista = Number(q.analista) || null;
    const executivo = Number(q.executivo) || null;
    const nomes = (chave, nome) => [...new Map(linhas.filter((l) => l[chave]).map((l) => [l[chave], { id: l[chave], nome: l[nome] }])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
    res.json({
      hoje, ano, parametros: atual, mes_vigente: M.mesVigente(hoje, atual.virada_dia),
      historico: historico.map((h) => ({ ...h, valores: M.normalizarParametros(h.valores).valores })).reverse(),
      documentos: Object.entries(F.DOCUMENTOS).filter(([t]) => !['analise_credito', 'contrato', 'outro'].includes(t)).map(([tipo, d]) => ({ tipo, nome: d.nome })),
      linhas, painel: M.painel(linhas, { ano, mes, analista, executivo }),
      onboarding: M.resumoOnboarding(linhas, atual.meta_pct), documentacao: M.resumoDocumentacao(linhas, atual.meta_pct),
      analistas: nomes('responsavel_id', 'responsavel_nome'), executivos: nomes('executivo_id', 'executivo_nome'),
      anos: [...new Set([ano, ...linhas.map((l) => Number(l.inicio.slice(0, 4)))])].sort(),
      pode: { parametros: !!(p.coordenacao || p.admin), marcar: !!(p.coordenacao || p.admin), cobrar: !!(p.equipe || p.coordenacao || p.admin) },
    });
  });

  r.post('/api/implantacoes/acompanhamento/parametros', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!(p.coordenacao || p.admin)) return erro(res, 403, 'Só a coordenação do setor Implantação e a administração alteram as metas.');
    const b = req.body || {};
    const { valores, erros } = M.normalizarParametros(b.valores);
    if (erros.length) return erro(res, 400, erros.join(' '));
    const vale = texto(b.vale_desde, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vale) || M.somarDias(vale, 0) !== vale) return erro(res, 400, 'Informe a data a partir da qual as regras valem.');
    const { id } = await db.um('INSERT INTO implantacao_parametros (valores, vale_desde, alterado_por) VALUES ($1::jsonb, $2, $3) RETURNING id', [JSON.stringify(valores), vale, req.usuario.id]);
    await seg.auditar(req, 'implantacao_parametros', null, { id, vale_desde: vale, valores });
    res.status(201).json({ ok: true, id });
  });

  r.post('/api/implantacoes/:id/meta-documentacao', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!(p.coordenacao || p.admin)) return erro(res, 403, 'Só a coordenação marca a meta de documentação à mão.');
    const i = await db.um('SELECT id FROM implantacoes WHERE id = $1', [Number(req.params.id) || 0]);
    if (!i) return erro(res, 404, 'Implantação não encontrada.');
    const b = req.body || {};
    const resultado = ['bateu', 'faltou'].includes(b.resultado) ? b.resultado : null;
    const motivo = texto(b.motivo, 500);
    if (resultado && !motivo) return erro(res, 400, 'Diga o motivo de marcar à mão.');
    const marca = resultado ? { resultado, motivo, por: req.usuario.id, por_nome: req.usuario.nome, em: new Date().toISOString() } : null;
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET meta_doc_manual = $2::jsonb WHERE id = $1', [i.id, marca ? JSON.stringify(marca) : null]);
      await evento(t, i.id, req.usuario.id, 'meta_documentacao', marca ? { resultado, motivo } : { resultado: 'calculo' });
    });
    res.json({ ok: true });
  });

  r.post('/api/implantacoes/:id/cobrar-documentos', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!(p.equipe || p.coordenacao || p.admin)) return erro(res, 403, 'Só o setor Implantação cobra os documentos.');
    const [l] = await carregarLinhas(db, { id: req.params.id });
    if (!l) return erro(res, 404, 'Implantação não encontrada (ou ainda não enviada ao setor).');
    if (!l.documentacao.falta.length || l.documentacao.manual) return erro(res, 409, 'Não há documento da meta para cobrar.');
    if (!await cobrarDocumentos(db, avisos, l, { autorId: req.usuario.id })) return erro(res, 409, 'O executivo não tem usuário no portal.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET cobranca_doc_em = now() WHERE id = $1', [l.id]);
      await evento(t, l.id, req.usuario.id, 'cobranca_documentos', { faltam: l.documentacao.falta });
    });
    res.json({ ok: true, faltam: l.documentacao.falta });
  });
}

/* lembrete automático ao executivo quando faltam até 3 dias para o limite dos documentos da meta (uma vez) */
async function lembretesDocumentacao(db, avisos, hoje = M.diaSP(Date.now())) {
  let n = 0;
  for (const l of await carregarLinhas(db, { hoje })) {
    const d = l.documentacao;
    if (!l.na_meta || d.status !== 'pendente' || d.faltam > DIAS_LEMBRETE_DOC || l._bruto.lembrete_doc_em) continue;
    if (await cobrarDocumentos(db, avisos, l, { lembrete: true })) n++;
    await db.q('UPDATE implantacoes SET lembrete_doc_em = now() WHERE id = $1', [l.id]);
  }
  return n;
}

module.exports = { rotasAcompanhamento, carregarLinhas, lembretesDocumentacao };
