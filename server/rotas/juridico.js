'use strict';
/*
 * Demandas Jurídicas: tudo o que se pede ao Jurídico (aditivo, rescisão, análise de contrato de fornecedor, parecer…),
 * no lugar da planilha "Acompanhamento — Atividades Jurídicas".
 *  - Qualquer pessoa do portal abre uma demanda e acompanha as suas (Minhas demandas); o Jurídico também lança pelos outros.
 *  - O prazo é o do tipo de atividade, em horas úteis: cada 8h é um dia útil (como na planilha), contado a partir do dia
 *    seguinte à solicitação, sem fins de semana e feriados (FERIADOS do expediente). A Tabela de prazos é editável.
 *  - SLA: entregue até o prazo = dentro; depois = fora. Sem entrega e com o prazo vencido, a demanda aparece como atrasada
 *    (não é um status que alguém marca). Ao passar para Aguardando assinaturas ou Concluído, a data da entrega é registrada.
 *  - Os pedidos da Solicitação de Contrato entram na lista e nos indicadores sozinhos, no tipo marcado na Tabela de prazos,
 *    com o prazo dela (72h úteis) e a primeira minuta como entrega. Não se lançam de novo aqui.
 *  - Avisos (sino e e-mail): demanda nova para o Jurídico; mudança de situação e comentário para quem pediu; no dia do prazo
 *    e quando passa do prazo, para quem é responsável (ou para o Jurídico, se ninguém foi escolhido).
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - Jurídico: quem é do setor Jurídico ou tem a permissão "Elaborar as minutas de contrato" (Configurações → Acessos →
 *    Solicitação de Contrato); conduz todas as demandas e edita a Tabela de prazos;
 *  - diretoria: quem chancela análises de crédito; vê todas e os indicadores;
 *  - importar a planilha: a administração e a coordenação/supervisão do Jurídico;
 *  - administração: tudo.
 */
const express = require('express');
const I = require('../juridico/importacao');
const { lerPlanilha } = require('../planilha');
const { criarXlsx } = require('../xlsx');

const STATUS = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_retorno: 'Aguardando retorno', aguardando_assinaturas: 'Aguardando assinaturas',
  concluido: 'Concluído', contrato_perdido: 'Contrato perdido' };
const FECHADOS = ['concluido', 'contrato_perdido'];
const ENTREGA_AO_MUDAR = ['aguardando_assinaturas', 'concluido']; // mudou para estes sem data de entrega: entregue hoje
const AVISA_EMAIL = ['aguardando_retorno', 'concluido']; // situações que pedem algo de quem pediu (ou fecham o pedido)
const SETOR_JURIDICO = 'Jurídico';
const PERMISSAO = 'contratos.elaborar';
const HORAS_CONTRATO = 72; // Solicitação de Contrato: minuta em 72h úteis
// situação da solicitação de contrato, nos termos da planilha
const ETAPA_STATUS = { fila: 'pendente', em_elaboracao: 'em_andamento', pendencia: 'aguardando_retorno', minuta_enviada: 'aguardando_retorno',
  para_assinar: 'aguardando_assinaturas', em_assinatura: 'aguardando_assinaturas', conferencia: 'aguardando_assinaturas', assinado: 'concluido', cancelada: 'contrato_perdido' };

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const dataBr = (d) => (d ? d.split('-').reverse().join('/') : '');
const ehDia = (s) => !!I.dia(s) && I.dia(s) === s;

/* quem conduz as demandas: o setor Jurídico e quem elabora os contratos (ninguém: a administração) */
async function equipeJuridica(db, regras) {
  const doSetor = (await db.q(`SELECT sm.usuario_id FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
    WHERE s.nome = $1 AND u.ativo`, [SETOR_JURIDICO])).rows.map((x) => x.usuario_id);
  const ids = [...new Set([...doSetor, ...(await regras.pessoasCom(PERMISSAO))])];
  return ids.length ? ids : (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
}

/* Rotina (roda a cada poucos minutos, só no expediente): no dia do prazo e quando passa dele, avisa uma vez quem é
 * responsável (ou o Jurídico). Demanda importada já vencida não avisa (é histórico). */
function criarRotinasJuridico({ db, avisos, regras, expediente }) {
  async function executar(agora = new Date()) {
    const feito = { vence_hoje: 0, atrasadas: 0 };
    const m = expediente.momento(agora);
    if (!m.noExpediente) return feito;
    let equipe = null;
    const para = async (d) => (d.responsavel_id ? [d.responsavel_id] : (equipe ||= await equipeJuridica(db, regras)));
    const abertas = `SELECT d.id, d.numero, d.cliente, d.responsavel_id, d.prazo::text AS prazo, t.nome AS tipo FROM juridico_demandas d JOIN juridico_tipos t ON t.id = d.tipo_id
      WHERE d.entregue_em IS NULL AND d.status NOT IN ('concluido','contrato_perdido')`;
    for (const d of (await db.q(`${abertas} AND d.prazo = $1::date AND d.aviso_vence_em IS NULL`, [m.dia])).rows) {
      await avisos.notificar(await para(d), { tipo: 'juridico', link: `#/demandas-juridicas/${d.id}`, email: true,
        titulo: `Vence hoje · demanda #${d.numero} · ${d.tipo}`, texto: `${d.tipo}${d.cliente ? ' · ' + d.cliente : ''}: o prazo de entrega é hoje.` });
      await db.q('UPDATE juridico_demandas SET aviso_vence_em = $2 WHERE id = $1', [d.id, m.dia]);
      feito.vence_hoje++;
    }
    for (const d of (await db.q(`${abertas} AND d.prazo < $1::date AND d.aviso_atraso_em IS NULL`, [m.dia])).rows) {
      await avisos.notificar(await para(d), { tipo: 'juridico', link: `#/demandas-juridicas/${d.id}`, email: true,
        titulo: `Passou do prazo · demanda #${d.numero} · ${d.tipo}`, texto: `${d.tipo}${d.cliente ? ' · ' + d.cliente : ''}: o prazo era ${dataBr(d.prazo)} e a entrega ainda não foi registrada.` });
      await db.q('UPDATE juridico_demandas SET aviso_atraso_em = $2, aviso_vence_em = COALESCE(aviso_vence_em, $2) WHERE id = $1', [d.id, m.dia]);
      feito.atrasadas++;
    }
    return feito;
  }
  return { executar };
}

function rotasJuridico({ db, seg, avisos, regras, expediente }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  const jsonGrande = express.json({ limit: '25mb' });
  r.use('/api/juridico', seg.exigirLogin);
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });
  const evento = (t, id, usuarioId, tipo, detalhe) => t.q('INSERT INTO juridico_eventos (demanda_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [id, usuarioId, tipo, JSON.stringify(detalhe || {})]);
  const prazoDe = (solicitada, horas) => I.somarDiasUteis(solicitada, I.diasDoPrazo(horas), expediente.ehDiaUtil);
  const link = (id) => `#/demandas-juridicas/${id}`;

  /* ---------- quem é a pessoa nas Demandas Jurídicas ---------- */
  async function perfil(u) {
    const admin = u.papel === 'admin';
    const doSetor = !!(await db.um(`SELECT 1 AS ok FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE s.nome = $1 AND sm.usuario_id = $2`, [SETOR_JURIDICO, u.id]));
    const juridico = admin || doSetor || (await regras.pode(u, PERMISSAO));
    const diretoria = admin || (await regras.pode(u, 'credito.diretoria'));
    const gerencia = admin || (doSetor && ['coordenador', 'supervisor'].includes(u.papel)) || (await regras.gerenciaveis(u)).has(PERMISSAO);
    return { admin, juridico, diretoria, gerencia, ve_tudo: juridico || diretoria };
  }
  const setorDe = async (uid) => (uid ? ((await db.um(`SELECT s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id
    WHERE sm.usuario_id = $1 ORDER BY sm.lider DESC, s.ordem, s.nome LIMIT 1`, [uid])) || {}).nome || '' : '');
  const ufDe = async (uid) => (uid ? ((await db.um('SELECT uf FROM executivos WHERE usuario_id = $1 AND ativo', [uid])) || {}).uf || '' : '');
  const tipos = async () => (await db.q('SELECT id, nome, horas, ativo, ordem, contratos FROM juridico_tipos ORDER BY ordem, nome')).rows;
  async function condominioDe(cliente) {
    const c = texto(cliente, 200);
    if (!c) return null;
    const x = await db.um('SELECT id FROM condominios WHERE lower(nome) = lower($1) OR lower(razao_social) = lower($1) ORDER BY id LIMIT 1', [c]);
    return x ? x.id : null;
  }

  /* ---------- as demandas (lançadas aqui e pedidas pela Solicitação de Contrato), no mesmo formato ---------- */
  // vis: 'minhas' (pedidas ou lançadas pela pessoa), 'todas', ou { id } (uma demanda lançada aqui)
  async function demandas(p, u, vis) {
    const hoje = diaBrasilia();
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const onde = vis === 'minhas' ? `WHERE (d.solicitante_id = ${v(u.id)} OR d.criado_por = $1)` : vis && vis.id ? `WHERE d.id = ${v(vis.id)}` : '';
    const manuais = (await db.q(`SELECT d.id, d.numero, d.status, d.tipo_id, t.nome AS tipo, d.solicitante_id, d.solicitante_nome, d.setor, d.uf, d.cliente, d.condominio_id,
        d.objeto, d.observacoes, d.responsavel_id, ur.nome AS responsavel_nome, d.solicitada_em::text AS solicitada_em, d.horas, d.prazo::text AS prazo,
        d.entregue_em::text AS entregue_em, d.importacao_id, d.criado_por, d.criado_em, d.atualizado_em
      FROM juridico_demandas d JOIN juridico_tipos t ON t.id = d.tipo_id LEFT JOIN usuarios ur ON ur.id = d.responsavel_id ${onde}`, args)).rows
      .map((d) => ({ ...d, origem: 'demanda', ref: String(d.numero) }));
    const tipoCt = (await db.um('SELECT id, nome FROM juridico_tipos WHERE contratos ORDER BY id LIMIT 1')) || { id: null, nome: 'Contrato (Solicitação de Contrato)' };
    const args2 = [];
    if (vis && vis.id) return marcar(manuais, hoje);
    const onde2 = vis === 'minhas' ? `AND (c.solicitante_id = $1 OR e.usuario_id = $1)` : '';
    if (vis === 'minhas') args2.push(u.id);
    const contratos = (await db.q(`SELECT c.id, c.protocolo, c.etapa, c.condominio, c.uf, c.enviado_em, c.prazo, c.solicitante_id, us.nome AS solicitante_nome,
        c.responsavel_id, ur.nome AS responsavel_nome, c.atualizado_em,
        (SELECT MIN(ev.criado_em) FROM contrato_eventos ev WHERE ev.contrato_id = c.id AND ev.tipo = 'minuta_enviada') AS primeira_minuta_em,
        (SELECT s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = c.solicitante_id ORDER BY sm.lider DESC, s.ordem LIMIT 1) AS setor
      FROM contratos c LEFT JOIN executivos e ON e.id = c.executivo_id LEFT JOIN usuarios us ON us.id = c.solicitante_id LEFT JOIN usuarios ur ON ur.id = c.responsavel_id
      WHERE c.etapa <> 'rascunho' AND c.enviado_em IS NOT NULL ${onde2}`, args2)).rows
      .map((c) => ({ id: `ct-${c.id}`, contrato_id: c.id, origem: 'contrato', ref: c.protocolo, numero: null, status: ETAPA_STATUS[c.etapa] || 'pendente', etapa: c.etapa,
        tipo_id: tipoCt.id, tipo: tipoCt.nome, solicitante_id: c.solicitante_id, solicitante_nome: c.solicitante_nome || '', setor: c.setor || '', uf: c.uf || '',
        cliente: c.condominio || '', objeto: `Solicitação de Contrato ${c.protocolo}`, observacoes: '', responsavel_id: c.responsavel_id, responsavel_nome: c.responsavel_nome,
        solicitada_em: diaBrasilia(c.enviado_em), horas: HORAS_CONTRATO, prazo: c.prazo ? diaBrasilia(c.prazo) : null,
        entregue_em: c.primeira_minuta_em ? diaBrasilia(c.primeira_minuta_em) : null, atualizado_em: c.atualizado_em }));
    return marcar([...manuais, ...contratos], hoje)
      .sort((a, b) => (b.solicitada_em || '').localeCompare(a.solicitada_em || '') || String(b.ref).localeCompare(String(a.ref), 'pt-BR', { numeric: true }));
  }
  /* atrasada (sem entrega e o prazo passou), vence hoje e o SLA de quem já foi entregue */
  function marcar(lista, hoje) {
    return lista.map((d) => {
      const fechada = FECHADOS.includes(d.status);
      const atrasada = !d.entregue_em && !fechada && !!d.prazo && d.prazo < hoje;
      const sla = d.entregue_em && d.prazo ? (d.entregue_em <= d.prazo ? 'dentro' : 'fora') : null;
      return { ...d, atrasada, vence_hoje: !d.entregue_em && !fechada && d.prazo === hoje, sla };
    });
  }
  function filtrar(lista, q) {
    const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const busca = sem(texto(q.q, 100));
    return lista.filter((d) => (!busca || sem([d.ref, d.tipo, d.solicitante_nome, d.cliente, d.objeto, d.observacoes, d.setor].join(' ')).includes(busca))
      && (!q.status || (q.status === 'atrasada' ? d.atrasada : q.status === 'abertas' ? !FECHADOS.includes(d.status) : d.status === q.status))
      && (!q.tipo || String(d.tipo_id) === String(q.tipo))
      && (!q.setor || d.setor === q.setor)
      && (!q.origem || d.origem === q.origem)
      && (!q.ano || (d.solicitada_em || '').startsWith(String(q.ano))));
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

  const podeVer = (p, u, d) => p.ve_tudo || d.solicitante_id === u.id || d.criado_por === u.id;
  async function carregar(req, res) {
    const p = await perfil(req.usuario);
    const [d] = await demandas(p, req.usuario, { id: Number(req.params.id) || 0 });
    if (!d || !podeVer(p, req.usuario, d)) { erro(res, 404, 'Demanda não encontrada.'); return null; }
    return { d, p };
  }
  const podeExcluir = (p, u, d) => p.juridico || (d.criado_por === u.id && d.status === 'pendente');

  /* ===================== perfil, contadores e listas do formulário ===================== */
  r.get('/api/juridico/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: true, juridico: p.juridico, ve_tudo: p.ve_tudo };
    const hoje = diaBrasilia();
    if (p.juridico) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes,
        COUNT(*) FILTER (WHERE entregue_em IS NULL AND status NOT IN ('concluido','contrato_perdido') AND prazo < $1::date)::int AS atrasadas FROM juridico_demandas`, [hoje]));
    }
    out.retorno = (await db.um("SELECT COUNT(*)::int AS n FROM juridico_demandas WHERE status = 'aguardando_retorno' AND solicitante_id = $1", [req.usuario.id])).n;
    res.json(out);
  });

  r.get('/api/juridico/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    const u = req.usuario;
    const equipe = p.juridico ? await equipeJuridica(db, regras) : [];
    res.json({
      perfil: p, status: STATUS, hoje: diaBrasilia(), horas_contrato: HORAS_CONTRATO,
      tipos: (await tipos()).map((t) => ({ ...t, dias: I.diasDoPrazo(t.horas) })),
      eu: { id: u.id, nome: u.nome, setor: await setorDe(u.id), uf: await ufDe(u.id) },
      // o Jurídico lança pelos outros: escolhe a pessoa (o setor e a UF vêm dela) e quem fica responsável
      pessoas: p.juridico ? (await db.q(`SELECT u.id, u.nome, (SELECT s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = u.id
          ORDER BY sm.lider DESC, s.ordem, s.nome LIMIT 1) AS setor, COALESCE((SELECT e.uf FROM executivos e WHERE e.usuario_id = u.id AND e.ativo LIMIT 1), '') AS uf
        FROM usuarios u WHERE u.ativo ORDER BY u.nome`)).rows.map((x) => ({ ...x, setor: x.setor || '' })) : [],
      equipe: equipe.length ? (await db.q('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[]) AND ativo ORDER BY nome', [equipe])).rows : [],
      condominios: (await db.q("SELECT nome FROM condominios WHERE situacao <> 'INATIVO' ORDER BY nome")).rows.map((x) => x.nome),
    });
  });

  /* ===================== listagem ===================== */
  r.get('/api/juridico/demandas', async (req, res) => {
    const p = await perfil(req.usuario);
    const vis = req.query.vis === 'todas' ? 'todas' : 'minhas';
    if (vis === 'todas' && !p.ve_tudo) return erro(res, 403, 'A lista completa é do Jurídico e da diretoria.');
    const todas = await demandas(p, req.usuario, vis);
    const mes = diaBrasilia().slice(0, 7);
    const conta = (f) => todas.filter(f).length;
    const entreguesMes = todas.filter((d) => (d.entregue_em || '').startsWith(mes));
    const contadores = {
      pendente: conta((d) => d.status === 'pendente'), em_andamento: conta((d) => d.status === 'em_andamento'),
      aguardando_retorno: conta((d) => d.status === 'aguardando_retorno'), aguardando_assinaturas: conta((d) => d.status === 'aguardando_assinaturas'),
      atrasadas: conta((d) => d.atrasada), vence_hoje: conta((d) => d.vence_hoje), entregues_mes: entreguesMes.length,
      sla_mes: pct(entreguesMes.filter((d) => d.sla === 'dentro').length, entreguesMes.length),
    };
    const lista = filtrar(todas, req.query);
    res.json({ demandas: lista, contadores, total: todas.length,
      setores: [...new Set(todas.map((d) => d.setor).filter(Boolean))].sort(), anos: [...new Set(todas.map((d) => Number((d.solicitada_em || '').slice(0, 4))).filter(Boolean))].sort() });
  });

  /* a lista (com os filtros da tela) em planilha */
  r.get('/api/juridico/demandas.xlsx', async (req, res) => {
    const p = await perfil(req.usuario);
    const vis = req.query.vis === 'todas' && p.ve_tudo ? 'todas' : 'minhas';
    const lista = filtrar(await demandas(p, req.usuario, vis), req.query);
    const cab = ['#', 'Atividade', 'Solicitante', 'Cliente', 'Setor', 'Estado', 'Objeto da demanda', 'Data da Solicitação', 'Prazo de Entrega', 'Data da Entrega',
      'Status', 'Observações', 'SLA', 'Responsável', 'Origem'];
    const linhas = lista.map((d) => [d.origem === 'demanda' ? d.numero : d.ref, d.tipo, d.solicitante_nome, d.cliente, d.setor, d.uf, d.objeto, dataBr(d.solicitada_em),
      dataBr(d.prazo), dataBr(d.entregue_em), STATUS[d.status] + (d.atrasada ? ' (atrasada)' : ''), d.observacoes,
      d.sla === 'dentro' ? 'Dentro do SLA' : d.sla === 'fora' ? 'Fora do SLA' : '', d.responsavel_nome || '', d.origem === 'contrato' ? 'Solicitação de Contrato' : 'Demandas Jurídicas']);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="Demandas Juridicas ${diaBrasilia()}.xlsx"`);
    res.send(criarXlsx([{ titulo: 'Demandas Jurídicas', cab, linhas }]));
  });

  /* ===================== indicadores: % dentro do SLA por atividade e mês (pela data da entrega) ===================== */
  r.get('/api/juridico/indicadores', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.ve_tudo) return erro(res, 403, 'Os indicadores são do Jurídico e da diretoria.');
    const todas = await demandas(p, req.usuario, 'todas');
    const anoAtual = Number(diaBrasilia().slice(0, 4));
    const anos = [...new Set([anoAtual, ...todas.map((d) => Number((d.entregue_em || d.solicitada_em || '').slice(0, 4))).filter(Boolean)])].sort();
    const ano = anos.includes(Number(req.query.ano)) ? Number(req.query.ano) : anoAtual;
    const doAno = todas.filter((d) => d.sla && d.entregue_em.startsWith(String(ano)));
    const celula = (l) => ({ dentro: l.filter((d) => d.sla === 'dentro').length, total: l.length, pct: pct(l.filter((d) => d.sla === 'dentro').length, l.length) });
    const porMes = (l) => Array.from({ length: 12 }, (_, k) => celula(l.filter((d) => Number(d.entregue_em.slice(5, 7)) === k + 1)));
    const ordem = new Map((await tipos()).map((t, k) => [t.nome, k]));
    const nomes = [...new Set(doAno.map((d) => d.tipo))].sort((a, b) => (ordem.has(a) ? ordem.get(a) : 999) - (ordem.has(b) ? ordem.get(b) : 999) || a.localeCompare(b));
    const setores = [...new Set(todas.map((d) => d.setor || 'Sem setor'))].sort();
    const solicitadasAno = todas.filter((d) => (d.solicitada_em || '').startsWith(String(ano)));
    res.json({
      ano, anos,
      tipos: nomes.map((n) => { const l = doAno.filter((d) => d.tipo === n); return { nome: n, meses: porMes(l), total: celula(l) }; }),
      total: { meses: porMes(doAno), total: celula(doAno) },
      setores: setores.map((s) => {
        const l = todas.filter((d) => (d.setor || 'Sem setor') === s);
        return { nome: s, solicitadas: l.filter((d) => (d.solicitada_em || '').startsWith(String(ano))).length, sla: celula(l.filter((d) => d.sla && d.entregue_em.startsWith(String(ano)))),
          abertas: l.filter((d) => !FECHADOS.includes(d.status)).length };
      }).filter((s) => s.solicitadas || s.sla.total || s.abertas),
      resumo: { solicitadas: solicitadasAno.length, entregues: doAno.length, dentro: doAno.filter((d) => d.sla === 'dentro').length, pct: celula(doAno).pct,
        abertas: todas.filter((d) => !FECHADOS.includes(d.status)).length, atrasadas: todas.filter((d) => d.atrasada).length,
        perdidos: solicitadasAno.filter((d) => d.status === 'contrato_perdido').length },
    });
  });

  /* ===================== uma demanda ===================== */
  r.get('/api/juridico/demandas/:id', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { d, p } = x;
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM juridico_eventos ev LEFT JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.demanda_id = $1 ORDER BY ev.id`, [d.id])).rows;
    res.json({ demanda: d, eventos, pode: { editar: p.juridico, comentar: true, excluir: podeExcluir(p, req.usuario, d) } });
  });

  /* nova demanda: quem não é do Jurídico pede em nome próprio, com a data de hoje */
  r.post('/api/juridico/demandas', json, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const b = req.body || {};
    const tipo = await db.um('SELECT id, nome, horas FROM juridico_tipos WHERE id = $1 AND ativo', [Number(b.tipo_id) || 0]);
    if (!tipo) return erro(res, 400, 'Escolha o tipo de atividade.');
    const cliente = texto(b.cliente, 200);
    if (!cliente) return erro(res, 400, 'Informe o cliente.');
    const hoje = diaBrasilia();
    let solicitanteId = u.id, solicitanteNome = u.nome, solicitada = hoje, responsavel = null, status = 'pendente', entregue = null;
    if (p.juridico) {
      if (b.solicitante_id) {
        const s = await db.um('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo', [Number(b.solicitante_id) || 0]);
        if (!s) return erro(res, 400, 'Solicitante não encontrado.');
        solicitanteId = s.id; solicitanteNome = s.nome;
      } else if (texto(b.solicitante_nome, 120)) { solicitanteId = null; solicitanteNome = texto(b.solicitante_nome, 120); }
      if (b.solicitada_em) { if (!ehDia(b.solicitada_em)) return erro(res, 400, 'Data da solicitação inválida.'); solicitada = b.solicitada_em; }
      if (solicitada > hoje) return erro(res, 400, 'A data da solicitação não pode ser no futuro.');
      if (b.responsavel_id) {
        if (!(await equipeJuridica(db, regras)).includes(Number(b.responsavel_id))) return erro(res, 400, 'O responsável precisa ser do Jurídico.');
        responsavel = Number(b.responsavel_id);
      }
      if (b.status && STATUS[b.status]) status = b.status;
      if (b.entregue_em) { if (!ehDia(b.entregue_em)) return erro(res, 400, 'Data da entrega inválida.'); entregue = b.entregue_em; }
      if (!entregue && ENTREGA_AO_MUDAR.includes(status)) entregue = hoje;
    }
    const setor = texto(p.juridico && b.setor !== undefined ? b.setor : '', 80) || (await setorDe(solicitanteId));
    const uf = texto(b.uf, 10).toUpperCase() || (await ufDe(solicitanteId));
    const prazo = prazoDe(solicitada, tipo.horas);
    const condominio = await condominioDe(cliente);
    const novo = await db.tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(7240514)');
      const { n } = await t.um('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM juridico_demandas');
      const d = await t.um(`INSERT INTO juridico_demandas (numero, tipo_id, status, solicitante_id, solicitante_nome, setor, uf, cliente, condominio_id, objeto, observacoes,
          responsavel_id, solicitada_em, horas, prazo, entregue_em, criado_por, aviso_vence_em, aviso_atraso_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18) RETURNING id, numero`,
      [n, tipo.id, status, solicitanteId, solicitanteNome, setor, uf, cliente, condominio, texto(b.objeto, 2000), texto(b.observacoes, 2000), responsavel, solicitada,
        tipo.horas, prazo, entregue, u.id, prazo < hoje ? hoje : null]); // lançada com o prazo já vencido: não avisa o atraso (já se sabe)
      await evento(t, d.id, u.id, 'criada', { status, tipo: tipo.nome });
      return d;
    });
    const titulo = `Demanda #${novo.numero} · ${tipo.nome} · ${cliente}`;
    if (!p.juridico) {
      await avisos.notificar(await equipeJuridica(db, regras), { tipo: 'juridico', link: link(novo.id), email: true, autor_id: u.id,
        titulo: `Nova demanda para o Jurídico · ${tipo.nome}`, texto: `${u.nome} pediu: ${tipo.nome} · ${cliente}${b.objeto ? ' — ' + texto(b.objeto, 200) : ''}. Prazo: ${dataBr(prazo)}.`,
        detalhes: { linhas: [['Demanda', `#${novo.numero}`], ['Atividade', tipo.nome], ['Cliente', cliente], ['Solicitante', u.nome], ['Prazo de entrega', dataBr(prazo)]],
          pre: texto(b.objeto, 1500) || null, botao: 'Abrir a demanda' } });
    } else {
      if (solicitanteId && solicitanteId !== u.id) {
        await avisos.notificar([solicitanteId], { tipo: 'juridico', link: link(novo.id), autor_id: u.id, titulo: `O Jurídico registrou seu pedido · ${titulo}`,
          texto: `Prazo de entrega: ${dataBr(prazo)}.` });
      }
      if (responsavel && responsavel !== u.id) {
        await avisos.notificar([responsavel], { tipo: 'juridico', link: link(novo.id), email: true, autor_id: u.id, titulo: `Demanda com você · ${titulo}`,
          texto: `${u.nome} deixou com você. Prazo de entrega: ${dataBr(prazo)}.` });
      }
    }
    await seg.auditar(req, 'juridico_demanda_criada', null, { id: novo.id, numero: novo.numero, tipo: tipo.nome });
    res.status(201).json({ ok: true, id: novo.id, numero: novo.numero, prazo });
  });

  /* o Jurídico conduz: situação, entrega, responsável e os dados do pedido */
  r.patch('/api/juridico/demandas/:id', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { d, p } = x;
    const u = req.usuario;
    if (!p.juridico) return erro(res, 403, 'Só o Jurídico altera a demanda. Use o comentário para responder.');
    const b = req.body || {};
    const hoje = diaBrasilia();
    const novo = { tipo_id: d.tipo_id, status: d.status, solicitante_id: d.solicitante_id, solicitante_nome: d.solicitante_nome, setor: d.setor, uf: d.uf,
      cliente: d.cliente, objeto: d.objeto, observacoes: d.observacoes, responsavel_id: d.responsavel_id, solicitada_em: d.solicitada_em, entregue_em: d.entregue_em,
      horas: d.horas, prazo: d.prazo };
    let tipo = null;
    if (b.tipo_id !== undefined && Number(b.tipo_id) !== d.tipo_id) {
      tipo = await db.um('SELECT id, nome, horas FROM juridico_tipos WHERE id = $1', [Number(b.tipo_id) || 0]);
      if (!tipo) return erro(res, 400, 'Tipo de atividade não encontrado.');
      novo.tipo_id = tipo.id;
    }
    if (b.status !== undefined) { if (!STATUS[b.status]) return erro(res, 400, 'Situação inválida.'); novo.status = b.status; }
    if (b.solicitante_id !== undefined || b.solicitante_nome !== undefined) {
      if (b.solicitante_id) {
        const s = await db.um('SELECT id, nome FROM usuarios WHERE id = $1', [Number(b.solicitante_id) || 0]);
        if (!s) return erro(res, 400, 'Solicitante não encontrado.');
        novo.solicitante_id = s.id; novo.solicitante_nome = s.nome;
      } else {
        const nome = texto(b.solicitante_nome, 120);
        if (!nome) return erro(res, 400, 'Informe o solicitante.');
        novo.solicitante_id = null; novo.solicitante_nome = nome;
      }
    }
    for (const [k, max] of [['setor', 80], ['objeto', 2000], ['observacoes', 2000]]) if (b[k] !== undefined) novo[k] = texto(b[k], max);
    if (b.uf !== undefined) novo.uf = texto(b.uf, 10).toUpperCase();
    if (b.cliente !== undefined) { novo.cliente = texto(b.cliente, 200); if (!novo.cliente) return erro(res, 400, 'Informe o cliente.'); }
    if (b.responsavel_id !== undefined) {
      if (b.responsavel_id && !(await equipeJuridica(db, regras)).includes(Number(b.responsavel_id)) && Number(b.responsavel_id) !== d.responsavel_id) return erro(res, 400, 'O responsável precisa ser do Jurídico.');
      novo.responsavel_id = b.responsavel_id ? Number(b.responsavel_id) : null;
    }
    if (b.solicitada_em !== undefined) {
      if (!ehDia(b.solicitada_em) || b.solicitada_em > hoje) return erro(res, 400, 'Data da solicitação inválida.');
      novo.solicitada_em = b.solicitada_em;
    }
    if (b.entregue_em !== undefined) {
      if (b.entregue_em && !ehDia(b.entregue_em)) return erro(res, 400, 'Data da entrega inválida.');
      novo.entregue_em = b.entregue_em || null;
    }
    if (novo.entregue_em && novo.entregue_em < novo.solicitada_em) return erro(res, 400, 'A entrega não pode ser antes da solicitação.');
    if (novo.status !== d.status && ENTREGA_AO_MUDAR.includes(novo.status) && !novo.entregue_em) novo.entregue_em = hoje;
    // prazo: muda com o tipo ou com a data da solicitação (pelo prazo do tipo hoje)
    if (tipo || novo.solicitada_em !== d.solicitada_em) {
      const t = tipo || (await db.um('SELECT horas FROM juridico_tipos WHERE id = $1', [novo.tipo_id]));
      novo.horas = t.horas;
      novo.prazo = prazoDe(novo.solicitada_em, t.horas);
    }
    const mudou = Object.keys(novo).filter((k) => String(novo[k] ?? '') !== String(d[k] ?? ''));
    if (!mudou.length) return res.json({ ok: true, mudou: [] });
    const condominio = novo.cliente !== d.cliente ? await condominioDe(novo.cliente) : d.condominio_id;
    await db.tx(async (t) => {
      await t.q(`UPDATE juridico_demandas SET tipo_id = $2, status = $3, solicitante_id = $4, solicitante_nome = $5, setor = $6, uf = $7, cliente = $8, objeto = $9,
          observacoes = $10, responsavel_id = $11, solicitada_em = $12, entregue_em = $13, horas = $14, prazo = $15, condominio_id = $16, atualizado_em = now(),
          aviso_vence_em = CASE WHEN $15::date <> prazo THEN NULL ELSE aviso_vence_em END, aviso_atraso_em = CASE WHEN $15::date <> prazo THEN NULL ELSE aviso_atraso_em END
        WHERE id = $1`, [d.id, novo.tipo_id, novo.status, novo.solicitante_id, novo.solicitante_nome, novo.setor, novo.uf, novo.cliente, novo.objeto, novo.observacoes,
        novo.responsavel_id, novo.solicitada_em, novo.entregue_em, novo.horas, novo.prazo, condominio]);
      const de = {}, para = {};
      for (const k of mudou) { de[k] = d[k] ?? null; para[k] = novo[k] ?? null; }
      if (tipo) { de.tipo = d.tipo; para.tipo = tipo.nome; }
      await evento(t, d.id, u.id, novo.status !== d.status ? 'status' : 'editada', { de, para });
    });
    const titulo = `#${d.numero} · ${tipo ? tipo.nome : d.tipo} · ${novo.cliente}`;
    if (novo.status !== d.status && novo.solicitante_id) {
      await avisos.notificar([novo.solicitante_id], { tipo: 'juridico', link: link(d.id), email: AVISA_EMAIL.includes(novo.status), autor_id: u.id,
        titulo: `${STATUS[novo.status]} · demanda ${titulo}`,
        texto: novo.status === 'aguardando_retorno' ? `O Jurídico aguarda o seu retorno. ${novo.observacoes ? 'Observações: ' + texto(novo.observacoes, 300) : 'Responda pelo comentário da demanda.'}`
          : `${u.nome} mudou a situação de ${STATUS[d.status]} para ${STATUS[novo.status]}.`,
        detalhes: { linhas: [['Demanda', `#${d.numero}`], ['Atividade', tipo ? tipo.nome : d.tipo], ['Cliente', novo.cliente], ['Situação', STATUS[novo.status]],
          ['Entrega', novo.entregue_em ? dataBr(novo.entregue_em) : null]], botao: 'Abrir a demanda' } });
    }
    if (novo.responsavel_id && novo.responsavel_id !== d.responsavel_id && novo.responsavel_id !== u.id) {
      await avisos.notificar([novo.responsavel_id], { tipo: 'juridico', link: link(d.id), email: true, autor_id: u.id, titulo: `Demanda com você · ${titulo}`,
        texto: `${u.nome} deixou com você. Prazo de entrega: ${dataBr(novo.prazo)}.` });
    }
    res.json({ ok: true, mudou, prazo: novo.prazo, entregue_em: novo.entregue_em });
  });

  /* comentário: quem pediu responde ao Jurídico (e o Jurídico a quem pediu) */
  r.post('/api/juridico/demandas/:id/comentario', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { d, p } = x;
    const t = texto((req.body || {}).texto, 3000);
    if (!t) return erro(res, 400, 'Escreva o comentário.');
    await evento(db, d.id, req.usuario.id, 'comentario', { texto: t });
    await db.q('UPDATE juridico_demandas SET atualizado_em = now() WHERE id = $1', [d.id]);
    const para = p.juridico && d.solicitante_id !== req.usuario.id ? [d.solicitante_id, d.responsavel_id]
      : d.responsavel_id ? [d.responsavel_id] : await equipeJuridica(db, regras);
    await avisos.notificar(para.filter(Boolean), { tipo: 'juridico', link: link(d.id), email: true, autor_id: req.usuario.id,
      titulo: `Comentário na demanda #${d.numero} · ${d.tipo} · ${d.cliente}`, texto: `${req.usuario.nome}: ${texto(t, 300)}`,
      detalhes: { linhas: [['Demanda', `#${d.numero}`], ['Atividade', d.tipo], ['Cliente', d.cliente]], pre: t, botao: 'Abrir a demanda' } });
    res.status(201).json({ ok: true });
  });

  r.delete('/api/juridico/demandas/:id', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { d, p } = x;
    if (!podeExcluir(p, req.usuario, d)) return erro(res, 403, 'Só o Jurídico exclui a demanda (quem pediu exclui enquanto ela está pendente).');
    await db.q('DELETE FROM juridico_demandas WHERE id = $1', [d.id]);
    await seg.auditar(req, 'juridico_demanda_excluida', null, { id: d.id, numero: d.numero, tipo: d.tipo, cliente: d.cliente });
    res.json({ ok: true });
  });

  /* ===================== Tabela de prazos ===================== */
  // o prazo novo vale para as demandas ainda não entregues desse tipo (as entregues guardam o SLA que tiveram)
  r.put('/api/juridico/tipos', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.juridico) return erro(res, 403, 'A Tabela de prazos é do Jurídico.');
    const b = req.body || {};
    const lista = Array.isArray(b.tipos) ? b.tipos : [];
    const atuais = new Map((await tipos()).map((t) => [t.id, t]));
    const nomes = new Set();
    for (const t of lista) {
      const nome = texto(t.nome, 80);
      const horas = Math.round(Number(t.horas));
      if (!nome) return erro(res, 400, 'Todo tipo precisa de nome.');
      if (!(horas > 0 && horas <= 2000)) return erro(res, 400, `Prazo inválido em "${nome}" (horas úteis, maior que zero).`);
      if (nomes.has(nome.toLowerCase())) return erro(res, 400, `"${nome}" está repetido.`);
      if (t.id && !atuais.has(Number(t.id))) return erro(res, 400, 'Tipo não encontrado.');
      nomes.add(nome.toLowerCase());
    }
    const contratosId = b.contratos_id ? Number(b.contratos_id) : null;
    let recalculadas = 0;
    await db.tx(async (t) => {
      const ids = [];
      for (const [k, x] of lista.entries()) {
        const nome = texto(x.nome, 80), horas = Math.round(Number(x.horas)), ativo = x.ativo !== false;
        if (x.id) {
          const antes = atuais.get(Number(x.id));
          await t.q('UPDATE juridico_tipos SET nome = $2, horas = $3, ativo = $4, ordem = $5, atualizado_por = $6, atualizado_em = now() WHERE id = $1',
            [antes.id, nome, horas, ativo, k, req.usuario.id]);
          ids.push(antes.id);
          if (antes.horas !== horas) {
            for (const d of (await t.q("SELECT id, solicitada_em::text AS s FROM juridico_demandas WHERE tipo_id = $1 AND entregue_em IS NULL AND status NOT IN ('concluido','contrato_perdido')", [antes.id])).rows) {
              await t.q('UPDATE juridico_demandas SET horas = $2, prazo = $3, aviso_vence_em = NULL, aviso_atraso_em = NULL, atualizado_em = now() WHERE id = $1', [d.id, horas, prazoDe(d.s, horas)]);
              recalculadas++;
            }
          }
        } else {
          const novo = await t.um(`INSERT INTO juridico_tipos (nome, horas, ativo, ordem, atualizado_por) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (nome) DO UPDATE SET horas = excluded.horas, ativo = excluded.ativo, ordem = excluded.ordem RETURNING id`, [nome, horas, ativo, k, req.usuario.id]);
          ids.push(novo.id);
        }
      }
      await t.q('UPDATE juridico_tipos SET contratos = (id = $1)', [contratosId && ids.includes(contratosId) ? contratosId : 0]);
    });
    await seg.auditar(req, 'juridico_prazos', null, { tipos: lista.map((x) => ({ nome: texto(x.nome, 80), horas: Number(x.horas), ativo: x.ativo !== false })), contratos_id: contratosId, recalculadas });
    res.json({ ok: true, recalculadas, tipos: await tipos() });
  });

  /* ===================== importar a planilha (uma vez; dá para desfazer) ===================== */
  async function podeImportar(req, res) {
    const p = await perfil(req.usuario);
    if (!p.gerencia) { erro(res, 403, 'Só a administração e a coordenação do Jurídico importam a planilha.'); return false; }
    return true;
  }
  async function conferir(b) {
    const buf = Buffer.from(String(b.arquivo || ''), 'base64');
    if (!buf.length) throw new Error('Envie a planilha (.xlsx).');
    return I.conferir(lerPlanilha(buf), {
      usuarios: (await db.q('SELECT id, nome FROM usuarios ORDER BY ativo DESC, id')).rows,
      tipos: await tipos(),
      contratos: (await db.q("SELECT id, protocolo, condominio, enviado_em FROM contratos WHERE etapa <> 'rascunho' AND enviado_em IS NOT NULL")).rows
        .map((c) => ({ id: c.id, protocolo: c.protocolo, condominio: c.condominio, dia: diaBrasilia(c.enviado_em) })),
      demandas: (await db.q('SELECT d.numero, t.nome AS tipo, d.cliente, d.solicitada_em::text AS solicitada_em FROM juridico_demandas d JOIN juridico_tipos t ON t.id = d.tipo_id')).rows,
      ehDiaUtil: expediente.ehDiaUtil,
    });
  }
  const loteAtivo = () => db.um('SELECT id, criado_em FROM juridico_importacoes WHERE desfeita_em IS NULL ORDER BY id DESC LIMIT 1');

  r.post('/api/juridico/importacao/previa', jsonGrande, async (req, res) => {
    if (!(await podeImportar(req, res))) return;
    let plano;
    try { plano = await conferir(req.body || {}); } catch (e) { return erro(res, 400, e.message); }
    res.json({ ...plano, lote_ativo: await loteAtivo() });
  });

  r.post('/api/juridico/importacao', jsonGrande, async (req, res) => {
    if (!(await podeImportar(req, res))) return;
    if (await loteAtivo()) return erro(res, 409, 'Já existe uma importação ativa. Para importar de novo, desfaça a anterior.');
    const b = req.body || {};
    let plano;
    try { plano = await conferir(b); } catch (e) { return erro(res, 400, e.message); }
    const incluir = new Set((Array.isArray(b.incluir) ? b.incluir : []).map(Number));
    const entra = plano.itens.filter((x) => ['pronta', 'aviso'].includes(x.situacao) || (x.situacao === 'duplicada' && incluir.has(x.linha)));
    if (!entra.length) return erro(res, 400, 'Nenhuma demanda para importar.');
    const hoje = diaBrasilia();
    const condominios = (await db.q('SELECT id, nome, razao_social FROM condominios')).rows;
    const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const condPorNome = new Map();
    for (const c of condominios) for (const n of [c.razao_social, c.nome]) if (n && !condPorNome.has(sem(n))) condPorNome.set(sem(n), c.id);
    const setores = new Map();
    const lote = await db.tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(7240514)');
      // tipos novos da Tabela de prazos; o primeiro "garantia" recebe os pedidos da Solicitação de Contrato, se nenhum recebe ainda
      const ordem = (await t.um('SELECT COALESCE(MAX(ordem), -1) AS n FROM juridico_tipos')).n;
      for (const [k, x] of plano.tipos.filter((y) => y.novo).entries()) {
        await t.q('INSERT INTO juridico_tipos (nome, horas, ordem, atualizado_por) VALUES ($1, $2, $3, $4) ON CONFLICT (nome) DO NOTHING', [x.nome, x.horas, ordem + 1 + k, req.usuario.id]);
      }
      if (!(await t.um('SELECT 1 AS ok FROM juridico_tipos WHERE contratos'))) {
        await t.q("UPDATE juridico_tipos SET contratos = TRUE WHERE id = (SELECT id FROM juridico_tipos WHERE nome ILIKE '%garantia%' ORDER BY ordem, id LIMIT 1)");
      }
      const tipoId = new Map((await t.q('SELECT id, nome FROM juridico_tipos')).rows.map((x) => [x.nome, x.id]));
      // números: os da planilha, se estiverem livres; senão, depois do último
      const usados = new Set((await t.q('SELECT numero FROM juridico_demandas')).rows.map((x) => x.numero));
      const manterNumeros = entra.every((x) => x.numero) && new Set(entra.map((x) => x.numero)).size === entra.length && !entra.some((x) => usados.has(x.numero));
      let proximo = Math.max(0, ...usados) + 1;
      const { id } = await t.um('INSERT INTO juridico_importacoes (criado_por, resumo) VALUES ($1, $2::jsonb) RETURNING id',
        [req.usuario.id, JSON.stringify({ ...plano.resumo, importadas: entra.length, numeros_da_planilha: manterNumeros })]);
      for (const x of entra) {
        if (x.solicitante_id && !x.setor && !setores.has(x.solicitante_id)) setores.set(x.solicitante_id, await setorDe(x.solicitante_id));
        const d = await t.um(`INSERT INTO juridico_demandas (numero, tipo_id, status, solicitante_id, solicitante_nome, setor, uf, cliente, condominio_id, objeto, observacoes,
            solicitada_em, horas, prazo, entregue_em, aviso_vence_em, aviso_atraso_em, importacao_id, linha_planilha, criado_por)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, $18, $19) RETURNING id`,
        [manterNumeros ? x.numero : proximo++, tipoId.get(x.tipo), x.status, x.solicitante_id, x.solicitante_nome, x.setor || setores.get(x.solicitante_id) || '', x.uf,
          x.cliente, condPorNome.get(sem(x.cliente)) || null, x.objeto, x.observacoes, x.solicitada_em, x.horas, x.prazo, x.entregue_em || null,
          x.prazo <= hoje ? hoje : null, id, x.linha, req.usuario.id]); // histórico: o que já venceu não gera aviso
        await evento(t, d.id, req.usuario.id, 'importada', { lote: id, linha: x.linha, avisos: x.avisos });
      }
      return id;
    });
    await seg.auditar(req, 'juridico_importacao', null, { lote, importadas: entra.length });
    res.status(201).json({ ok: true, lote, importadas: entra.length, fora: plano.itens.length - entra.length });
  });

  r.get('/api/juridico/importacao', async (req, res) => {
    if (!(await podeImportar(req, res))) return;
    const { rows } = await db.q(`SELECT l.id, l.criado_em, l.resumo, l.desfeita_em, u.nome AS criado_por_nome, ud.nome AS desfeita_por_nome,
        (SELECT COUNT(*)::int FROM juridico_demandas d WHERE d.importacao_id = l.id) AS ativas
      FROM juridico_importacoes l LEFT JOIN usuarios u ON u.id = l.criado_por LEFT JOIN usuarios ud ON ud.id = l.desfeita_por ORDER BY l.id DESC`);
    res.json({ lotes: rows });
  });

  /* desfazer: apaga o que o lote criou e ninguém mexeu depois; o que já foi editado ou comentado fica */
  r.post('/api/juridico/importacao/:id/desfazer', json, async (req, res) => {
    if (!(await podeImportar(req, res))) return;
    const lote = await db.um('SELECT * FROM juridico_importacoes WHERE id = $1 AND desfeita_em IS NULL', [Number(req.params.id) || 0]);
    if (!lote) return erro(res, 404, 'Importação não encontrada (ou já desfeita).');
    const mexidas = (await db.q(`SELECT d.id, d.numero, d.cliente FROM juridico_demandas d WHERE d.importacao_id = $1
      AND EXISTS (SELECT 1 FROM juridico_eventos ev WHERE ev.demanda_id = d.id AND ev.tipo <> 'importada')`, [lote.id])).rows;
    const apagadas = await db.tx(async (t) => {
      const n = (await t.q('DELETE FROM juridico_demandas WHERE importacao_id = $1 AND NOT (id = ANY($2::int[])) RETURNING id', [lote.id, mexidas.map((x) => x.id)])).rows.length;
      await t.q('UPDATE juridico_importacoes SET desfeita_em = now(), desfeita_por = $2 WHERE id = $1', [lote.id, req.usuario.id]);
      return n;
    });
    await seg.auditar(req, 'juridico_importacao_desfeita', null, { lote: lote.id, apagadas, mantidas: mexidas.length });
    res.json({ ok: true, apagadas, mantidas: mexidas });
  });

  return r;
}

module.exports = { rotasJuridico, criarRotinasJuridico, STATUS };
