'use strict';
/*
 * Acompanhamento da implantação (substitui as telas calculadas da planilha): % concluído, faixas, mês vigente,
 * metas de onboarding e de documentação, antecipações e o painel. Funções puras: a rota
 * (server/rotas/implantacoes-acompanhamento.js) lê o banco e chama estas.
 *
 * Regras (decididas com a operação):
 *  - % concluído = etapas feitas ÷ 5 (concluída ou na Carteira = 100%). "Síndico MyBlue" conta como onboarding feito.
 *  - Onboarding: em até onboarding_dias (30) depois do 1º vencimento, que o setor informa na etapa Emissão de boletos
 *    (até lá vale a previsão: o primeiro dia de vencimento do formulário a partir do início do contrato). Síndico MyBlue = batida; "A marcar" entra na carteira com o prazo correndo.
 *  - Documentação: os documentos da meta em até documentacao_dias (60) depois da data da documentação (envio do formulário).
 *  - Meta da carteira (90%): atingida com as batidas; em andamento se batidas + as que ainda estão no prazo chegam lá.
 *  - Ano e mês contados pela data de início do contrato; o mês vigente vira no dia virada_dia (25).
 *  - Metas só para envios a partir da data-marco. Os parâmetros valem a partir de uma data (histórico).
 *  - Prazos em dias úteis (server/implantacoes/prazos.js): concluir em concluir_dias (3) depois de assumir; ficha de
 *    repasse em ficha_dias (5) da conclusão até o envio ao Crédito.
 *  - Pós-implantação (server/implantacoes/pos.js), para as assumidas a partir de pos_marco: espólios em espolio_dias (2)
 *    depois de assumir; levantamento de pendências em pendencias_dias (1) depois de emitir os boletos; 1ª prestação de
 *    contas em prestacao_dias (5) depois do repasse (1º dia útil depois do 1º vencimento).
 */
const F = require('./formulario');

const PADRAO = Object.freeze({
  onboarding_dias: 30, documentacao_dias: 60, meta_pct: 90, virada_dia: 25, marco: '2026-07-01', concluir_dias: 3, ficha_dias: 5,
  espolio_dias: 2, pendencias_dias: 1, prestacao_dias: 5, pos_marco: '2026-10-27',
  docs_meta: ['convencao', 'ata_eleicao', 'ata_orcamento', 'procuracao'],
});
const LIMITES = { onboarding_dias: [1, 365, 'Prazo do onboarding'], documentacao_dias: [1, 365, 'Prazo da documentação'], meta_pct: [1, 100, 'Meta da carteira'], virada_dia: [1, 28, 'Dia da virada do mês'],
  concluir_dias: [1, 30, 'Prazo para concluir (dias úteis)'], ficha_dias: [1, 30, 'Prazo da ficha de transição (dias úteis)'],
  espolio_dias: [1, 30, 'Prazo dos espólios (dias úteis)'], pendencias_dias: [1, 30, 'Prazo do levantamento de pendências (dias úteis)'],
  prestacao_dias: [1, 30, 'Prazo da 1ª prestação de contas (dias úteis)'] };
const ETAPAS = ['documentacao', 'vouch', 'onboarding', 'boletos', 'envio'];
const ETAPA_NOME = { documentacao: 'Documentação', vouch: 'Vouch', onboarding: 'Onboarding', boletos: 'Emissão de boletos', envio: 'Envio dos boletos' };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- datas (sempre texto AAAA-MM-DD, no fuso de São Paulo) ---------- */
const diaSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const utc = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const somarDias = (s, n) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const valida = (s) => DATA.test(String(s || '')) && !Number.isNaN(utc(s)) && new Date(utc(s)).toISOString().slice(0, 10) === s;

/* previsão do 1º vencimento: o primeiro dia de vencimento do formulário a partir do início do contrato */
function primeiroVencimento(f, inicio) {
  const dia = Number(f.dia_vencimento);
  if (!(dia >= 1 && dia <= 31)) return inicio;
  const noMes = (a, m) => { const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate(); return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`; };
  let a = Number(inicio.slice(0, 4));
  let m = Number(inicio.slice(5, 7));
  let d = noMes(a, m);
  if (d < inicio) { m++; if (m > 12) { m = 1; a++; } d = noMes(a, m); }
  return d;
}

/* data do onboarding: AAAA-MM-DD, ou o texto livre antigo ("16/09, às 11h", "16/09/2026") com o ano do contrato */
function dataOnboarding(texto, anoRef) {
  const t = String(texto || '').trim();
  if (valida(t.slice(0, 10))) return t.slice(0, 10);
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t);
  if (!m) return null;
  let ano = m[3] ? Number(m[3]) : Number(anoRef);
  if (ano < 100) ano += 2000;
  const s = `${ano}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return valida(s) ? s : null;
}

/* ---------- parâmetros ---------- */
function normalizarParametros(v) {
  v = v && typeof v === 'object' ? v : {};
  const erros = [];
  const out = {};
  for (const [k, [min, max, nome]] of Object.entries(LIMITES)) {
    const n = Number(v[k] === undefined ? PADRAO[k] : v[k]);
    if (!Number.isInteger(n) || n < min || n > max) erros.push(`${nome}: um número inteiro de ${min} a ${max}.`);
    out[k] = n;
  }
  out.marco = String(v.marco === undefined ? PADRAO.marco : v.marco);
  if (!valida(out.marco)) erros.push('Data-marco inválida.');
  out.pos_marco = String(v.pos_marco === undefined ? PADRAO.pos_marco : v.pos_marco);
  if (!valida(out.pos_marco)) erros.push('Data de início do pós-implantação inválida.');
  const docs = Array.isArray(v.docs_meta) ? v.docs_meta : PADRAO.docs_meta;
  out.docs_meta = [...new Set(docs.map(String))].filter((t) => F.DOCUMENTOS[t] && !['analise_credito', 'contrato', 'outro'].includes(t));
  if (!out.docs_meta.length) erros.push('Marque ao menos um documento da meta.');
  return { valores: out, erros };
}
/* a regra que valia num dia: o registro mais recente com vale_desde até esse dia (antes do primeiro, a da planilha) */
function parametrosEm(historico, dia) {
  let p = null;
  for (const h of historico || []) if (h.vale_desde <= dia && (!p || h.vale_desde > p.vale_desde || (h.vale_desde === p.vale_desde && h.id > p.id))) p = h;
  return p ? normalizarParametros(p.valores).valores : { ...PADRAO, docs_meta: [...PADRAO.docs_meta] };
}

/* ---------- % concluído e faixas ---------- */
function etapasFeitas(i) {
  if (['concluida', 'na_carteira'].includes(i.etapa)) return Object.fromEntries(ETAPAS.map((k) => [k, true]));
  const e = F.normalizarEtapas(i.etapas);
  return { documentacao: e.documentacao.feito, vouch: !!e.vouch.id, onboarding: ['realizado', 'sindico_myblue'].includes(e.onboarding.situacao), boletos: e.boletos.feito, envio: !!e.envio.forma };
}
const percentual = (feitas) => ETAPAS.filter((k) => feitas[k]).length * 20;
function faixa(pct, feitas) {
  if (pct >= 100) return 'concluida';
  if (pct === 80 && !feitas.onboarding) return 'so_onboarding';
  if (pct >= 60) return 'alta';
  if (pct >= 40) return 'media';
  return 'baixa';
}
/* do dia da virada em diante, a tela já mostra o mês seguinte */
function mesVigente(hoje, viradaDia) {
  const [a, m, d] = hoje.split('-').map(Number);
  if (d < viradaDia) return hoje.slice(0, 7);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/* ---------- metas ---------- */
function statusOnboarding(i, vencimento, enviado, p, hoje, anoRef) {
  const o = F.normalizarEtapas(i.etapas).onboarding;
  const limite = somarDias(vencimento, p.onboarding_dias);
  const data = dataOnboarding(o.data, anoRef);
  let status;
  if (o.situacao === 'sindico_myblue') status = 'batida';
  // importada das planilhas com "REALIZADO" sem data: conta como batida (o Controle não registrava a data)
  else if (o.situacao === 'realizado') status = !data ? (i.importacao_id ? 'batida' : 'sem_data') : data <= limite ? 'batida' : 'nao_batida';
  else if (hoje > limite) status = 'nao_batida';
  else if (o.situacao === 'marcado') status = data && data > limite ? 'apos_prazo' : 'agendado';
  else status = 'a_marcar';
  return {
    situacao: o.situacao, data, hora: o.hora, por: o.por, primeiro_vencimento: vencimento, limite, status,
    faltam: diasEntre(hoje, limite), dias: o.situacao === 'realizado' && data ? diasEntre(vencimento, data) : null,
  };
}
function statusDocumentacao(i, enviado, datas, p, hoje) {
  const limite = somarDias(enviado, p.documentacao_dias);
  const docs = p.docs_meta.map((t) => ({ tipo: t, nome: (F.DOCUMENTOS[t] || {}).nome || t, em: datas[t] || null }));
  const falta = docs.filter((d) => !d.em);
  const completou = falta.length ? null : docs.map((d) => d.em).sort().pop();
  const manual = i.meta_doc_manual && ['bateu', 'faltou'].includes(i.meta_doc_manual.resultado) ? i.meta_doc_manual : null;
  let status;
  if (manual) status = manual.resultado === 'bateu' ? 'batida' : 'nao_batida';
  else if (completou) status = completou <= limite ? 'batida' : 'nao_batida';
  else status = hoje > limite ? 'nao_batida' : 'pendente';
  // o executivo só responde pelo que não é da equipe de Implantação (a procuração é dela)
  const doExecutivo = falta.filter((d) => !(F.DOCUMENTOS[d.tipo] || {}).setor).map((d) => d.nome);
  return { limite, docs, falta: falta.map((d) => d.nome), falta_executivo: doExecutivo, completou, status, manual, faltam: diasEntre(hoje, limite) };
}

/*
 * Uma linha por implantação enviada (fora rascunho, diretoria e canceladas):
 *   i: a implantação com executivo_nome e responsavel_nome; datas: { tipo: primeiro envio (AAAA-MM-DD) } dos documentos.
 */
function linha(i, datas, historico, hoje) {
  const f = i.formulario || {};
  const enviado = diaSP(i.enviado_em);
  const inicio = valida(f.inicio_contrato) ? f.inicio_contrato : enviado;
  const p = parametrosEm(historico, enviado);
  const informado = F.normalizarEtapas(i.etapas).boletos.primeiro_vencimento;
  // o setor informa na etapa Emissão de boletos; senão vale a data do formulário; senão, a prevista pelo dia de vencimento
  const doFormulario = valida(f.primeiro_vencimento) ? f.primeiro_vencimento : '';
  const vencimento = informado || doFormulario || primeiroVencimento(f, inicio);
  const feitas = etapasFeitas(i);
  const pct = percentual(feitas);
  const naMeta = enviado >= p.marco;
  return {
    id: i.id, protocolo: i.protocolo, condominio: f.nome || i.condominio || '', uf: f.uf || i.uf || '', origem: i.origem, etapa: i.etapa,
    importada: !!i.importacao_id, numero: i.numero_planilha || null,
    executivo_id: i.executivo_id, executivo_nome: i.executivo_nome || '', responsavel_id: i.responsavel_id, responsavel_nome: i.responsavel_nome || '',
    enviado, inicio, mes: inicio.slice(0, 7), dia_vencimento: Number(f.dia_vencimento) || null, primeiro_vencimento: vencimento, vencimento_previsto: !informado && !doFormulario, uh_total: Number(f.uh_total) || null,
    feitas, pct, faixa: faixa(pct, feitas), na_meta: naMeta,
    onboarding: statusOnboarding(i, vencimento, enviado, p, hoje, inicio.slice(0, 4)),
    documentacao: statusDocumentacao(i, enviado, datas || {}, p, hoje),
    antecipacao: f.antecipacao === 'sim' ? { valor: Number(f.antecipacao_valor) || 0, data: f.antecipacao_data || '', prazo: f.antecipacao_prazo || '' } : null,
  };
}

/* ---------- resumos ---------- */
const media = (l) => (l.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : 0);
function situacaoMeta(batidas, noPrazo, total, meta) {
  if (!total) return null;
  if ((batidas * 100) / total >= meta) return 'atingida';
  return ((batidas + noPrazo) * 100) / total >= meta ? 'andamento' : 'abaixo';
}
function ranking(base, chave, nome) {
  const m = new Map();
  for (const l of base) {
    const k = l[chave] || '';
    if (!m.has(k)) m.set(k, { nome: l[nome] || (chave === 'responsavel_id' ? 'Sem analista' : 'Sem informação'), contratos: 0, pcts: [] });
    m.get(k).contratos++;
    m.get(k).pcts.push(l.pct);
  }
  return [...m.values()].map((x) => ({ nome: x.nome, contratos: x.contratos, pct_medio: media(x.pcts) })).sort((a, b) => b.contratos - a.contratos || a.nome.localeCompare(b.nome));
}

/* painel: filtros { ano, mes (1-12), analista (id), executivo (id) }; o gráfico do ano ignora o filtro de mês */
function painel(linhas, { ano, mes, analista, executivo } = {}) {
  const doAno = linhas.filter((l) => l.inicio.slice(0, 4) === String(ano) && (!analista || l.responsavel_id === analista) && (!executivo || l.executivo_id === executivo));
  const base = mes ? doAno.filter((l) => Number(l.inicio.slice(5, 7)) === mes) : doAno;
  const porEtapa = ETAPAS.map((k) => ({ etapa: k, nome: ETAPA_NOME[k], pct: base.length ? Math.round((base.filter((l) => l.feitas[k]).length * 100) / base.length) : 0 }));
  const mensal = Array.from({ length: 12 }, (_, n) => {
    const doMes = doAno.filter((l) => Number(l.inicio.slice(5, 7)) === n + 1);
    return { mes: n + 1, contratos: doMes.length, concluidos: doMes.filter((l) => l.pct === 100).length };
  });
  const maior = mensal.reduce((a, b) => (b.contratos > a.contratos ? b : a), mensal[0]);
  return {
    total: base.length, pct_medio: media(base.map((l) => l.pct)),
    concluidos: base.filter((l) => l.pct === 100).length, andamento: base.filter((l) => l.pct > 0 && l.pct < 100).length, nao_iniciados: base.filter((l) => l.pct === 0).length,
    por_etapa: porEtapa, gargalo: base.length ? porEtapa.reduce((a, b) => (b.pct < a.pct ? b : a)) : null,
    mensal, mes_mais: maior.contratos ? maior : null,
    por_uf: ranking(base, 'uf', 'uf').slice(0, 5), por_executivo: ranking(base, 'executivo_id', 'executivo_nome').slice(0, 5), por_analista: ranking(base, 'responsavel_id', 'responsavel_nome'),
    abertos: base.filter((l) => l.pct < 100).sort((a, b) => a.pct - b.pct || a.inicio.localeCompare(b.inicio)).slice(0, 30)
      .map((l) => ({ id: l.id, condominio: l.condominio, inicio: l.inicio, etapa: l.etapa, responsavel_nome: l.responsavel_nome, feitas: l.feitas, pct: l.pct, faixa: l.faixa })),
  };
}

/* meta de onboarding, por analista (quem é responsável pela implantação) */
function resumoOnboarding(linhas, meta) {
  const m = new Map();
  for (const l of linhas.filter((x) => x.na_meta && x.responsavel_id)) {
    if (!m.has(l.responsavel_id)) m.set(l.responsavel_id, { id: l.responsavel_id, nome: l.responsavel_nome, carteira: 0, batidas: 0, no_prazo: 0, agendadas: 0, nao_batidas: 0, sem_data: 0, dias: [] });
    const a = m.get(l.responsavel_id);
    const s = l.onboarding.status;
    a.carteira++;
    if (s === 'batida') a.batidas++;
    else if (s === 'agendado' || s === 'a_marcar') { a.no_prazo++; if (s === 'agendado') a.agendadas++; }
    else if (s === 'sem_data') a.sem_data++;
    else a.nao_batidas++;
    if (l.onboarding.dias != null) a.dias.push(l.onboarding.dias);
  }
  return [...m.values()].map(({ dias, ...a }) => ({
    ...a, pct: a.carteira ? Math.round((a.batidas * 100) / a.carteira) : 0, pct_com_prazo: a.carteira ? Math.round(((a.batidas + a.no_prazo) * 100) / a.carteira) : 0,
    situacao: situacaoMeta(a.batidas, a.no_prazo, a.carteira, meta), prazo_medio: dias.length ? media(dias) : null,
  })).sort((a, b) => a.nome.localeCompare(b.nome));
}

function resumoDocumentacao(linhas, meta) {
  const base = linhas.filter((x) => x.na_meta);
  const c = { total: base.length, batidas: 0, pendentes: 0, nao_batidas: 0 };
  const faltando = new Map();
  let recebidos = 0;
  let previstos = 0;
  for (const l of base) {
    const d = l.documentacao;
    if (d.status === 'batida') c.batidas++;
    else if (d.status === 'pendente') c.pendentes++;
    else c.nao_batidas++;
    previstos += d.docs.length;
    recebidos += d.docs.filter((x) => x.em).length;
    if (d.status !== 'batida') for (const n of d.falta) faltando.set(n, (faltando.get(n) || 0) + 1);
  }
  return {
    ...c, pct: c.total ? Math.round((c.batidas * 100) / c.total) : 0, situacao: situacaoMeta(c.batidas, c.pendentes, c.total, meta),
    recebidos_pct: previstos ? Math.round((recebidos * 100) / previstos) : 0,
    mais_pendentes: [...faltando.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n),
  };
}

module.exports = {
  PADRAO, ETAPAS, ETAPA_NOME, diaSP, somarDias, diasEntre, primeiroVencimento, dataOnboarding, normalizarParametros, parametrosEm,
  etapasFeitas, percentual, faixa, mesVigente, statusOnboarding, statusDocumentacao, linha, painel, resumoOnboarding, resumoDocumentacao,
};
