'use strict';
/*
 * Motor de regras da Análise de Crédito (Política v1.2.x + decisões do setor).
 * Código puro e determinístico: recebe o formulário do executivo, os dados extraídos dos PDFs, os campos do analista
 * e a política; devolve janela, composição, receitas, inadimplência, faixa, preço, indicadores, status, alertas e a lista
 * da Assertiva. A IA só extrai e redige; nada aqui chama a IA nem o banco. A decisão formal é do analista.
 *
 * Valores em dinheiro são somados em centavos (inteiros) e devolvidos em reais. Percentuais são comparados com a faixa
 * pelo valor calculado; o arredondamento a 2 casas é só para exibir (fmtPct).
 *
 * Entrada (campos ausentes = não informado):
 *  formulario: { razao_social, cnpj, sem_cnpj (condomínio ainda sem CNPJ, ex.: entrega de construtora), uf, cidade, tipo_contratacao: 'nova'|'portabilidade', garantidora_atual,
 *    executivo: { nome, uf, boleto }, uh_total, taxa_ordinaria, dia_vencimento,
 *    desconto_pontualidade: { tipo: 'nenhum'|'percentual'|'valor', valor },
 *    agua_gas: { total_mensal, por_unidade, compoe_boleto }, fundo_reserva_compoe_ordinaria,
 *    taxas_extras: [{ descricao, valor_por_uh, inicio: 'AAAA-MM', fim: 'AAAA-MM', ata }], custo_boleto_atual,
 *    sindico: { tipo: 'profissional'|'condomino', isencao: 'nao'|'integral'|'parcial', percentual },
 *    outros_isentos: [{ cargo, percentual }], uh_isentas_informadas }
 *  convencao: { presente, registro: 'RI'|'cartorio'|'RTD'|'nenhum', cartorio, matricula, uh, foro, multa_pct, clausula_restritiva }
 *  relatorio: { presente, data_emissao: 'AAAA-MM-DD', tem_competencia, tem_nomes, ocr_confianca (0–1), periodo_inicio: 'AAAA-MM',
 *    unidades: [{ unidade, titular, documento, tipo_pessoa: 'PF'|'PJ', espolio, flag: 'acordo'|'juridico',
 *      lancamentos: [{ competencia, vencimento, tipo, valor }] }] }
 *    tipo do lançamento: ordinaria | extra | agua_gas | acordo | multa | juros | correcao | honorarios | fundo_reserva | outro
 *  analista: { espolios: [{ unidade, nome }], retomadas: [{ unidade, banco }], abandonos: [{ unidade, motivo }],
 *    assertiva: { unidade: { resultado: 'espolio'|'nao_espolio', em } } — resultado da consulta de cada candidato; espólio sai do escopo
 *    condicao_estrutural, ressalvas: [{ texto, justificativa }], ajustes: { campo: { valor, justificativa } } }
 *    ajustes aceitos: janela (lista de competências), uh_total, taxa_ordinaria, dia_vencimento, uh_isentas, taxa_adm, boleto
 */
const { POLITICA_PADRAO } = require('./politica');

const EPS = 1e-9;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const STATUS = {
  aprovada: 'APROVADA', ressalvas: 'APROVADA COM RESSALVAS', reprovada: 'REPROVADA', pendente: 'PENDENTE',
};
const TIPOS_PRINCIPAL = new Set(['ordinaria', 'extra', 'agua_gas', 'fundo_reserva']);

/* ---------- utilitários ---------- */
const cent = (v) => Math.round(Number(v || 0) * 100);
const reais = (c) => Math.round(c) / 100;
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(2).replace('.', ',')}%`);
const fmtBRL = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* "06/2026", "10/06/2026", "2026-06", "2026-06-10" → "2026-06" */
function normalizarCompetencia(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return null;
}
/* "10/06/2026" ou "2026-06-10" → "2026-06-10" */
function normalizarData(s) {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const partes = (d) => d.split('-').map(Number);
const diaJuliano = (d) => { const [a, m, dd] = partes(d); return Date.UTC(a, m - 1, dd) / 86400000; };
const diasEntre = (de, ate) => diaJuliano(ate) - diaJuliano(de);
function somarMeses(comp, n) {
  const [a, m] = partes(comp);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function somarDias(d, n) {
  const [a, m, dd] = partes(d);
  return new Date(Date.UTC(a, m - 1, dd + n)).toISOString().slice(0, 10);
}
/* vencimento de uma competência pelo dia do vencimento (dia 31 em fevereiro → último dia do mês) */
function vencimentoPeloDia(comp, dia) {
  const [a, m] = partes(comp);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${comp}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, '0')}`;
}
const rotuloMes = (comp) => { const [a, m] = partes(comp); return `${MESES[m - 1]}/${a}`; };
const rotuloMesLongo = (comp) => { const [a, m] = partes(comp); return `${MESES_LONGOS[m - 1]}/${a}`; };
/* "abr/mai/jun 2026" (ou "nov/2025, dez/2025, jan/2026" quando cruza o ano) */
function textoJanela(comps) {
  const anos = new Set(comps.map((c) => c.slice(0, 4)));
  if (anos.size === 1) return `${comps.map((c) => MESES[partes(c)[1] - 1]).join('/')} ${[...anos][0]}`;
  return comps.map(rotuloMes).join(', ');
}
function moda(valores) {
  const n = new Map();
  for (const v of valores) n.set(v, (n.get(v) || 0) + 1);
  let melhor = null, qtd = 0;
  for (const [v, q] of n) if (q > qtd) { melhor = v; qtd = q; }
  return melhor;
}

/* ---------- regras isoladas (usadas pelo motor e pelos testes) ---------- */

/* primeira faixa cujo teto ≥ inadimplência (teto inclusivo); acima da última → null */
function faixaPara(inad, politica = POLITICA_PADRAO) {
  if (inad === null || inad === undefined || !Number.isFinite(inad)) return null;
  for (let i = 0; i < politica.faixas.length; i++) {
    const f = politica.faixas[i];
    if (inad <= f.ate + EPS) return { indice: i, ate: f.ate, taxa_adm: f.taxa_adm };
  }
  return null;
}

/* boleto: o do cadastro do executivo > o da UF do condomínio > o da UF do executivo > o padrão */
function boletoPara({ uf, executivo } = {}, politica = POLITICA_PADRAO) {
  const porUf = politica.boleto_por_uf || {};
  const ufC = String(uf || '').toUpperCase();
  const ufE = String(executivo?.uf || '').toUpperCase();
  if (num(executivo?.boleto) !== null) return { valor: Number(executivo.boleto), origem: 'executivo' };
  if (porUf[ufC] !== undefined) return { valor: porUf[ufC], origem: `uf:${ufC}` };
  if (porUf[ufE] !== undefined) return { valor: porUf[ufE], origem: `uf_executivo:${ufE}` };
  return { valor: politica.boleto_padrao, origem: 'padrao' };
}

/* passou o prazo do vencimento na emissão do relatório? (padrão: MAIS de 10 dias) */
function competenciaMadura(emissao, vencimento, politica = POLITICA_PADRAO) {
  const d = diasEntre(vencimento, emissao);
  return politica.dias_inclusivo ? d >= politica.dias_apos_vencimento : d > politica.dias_apos_vencimento;
}

/* meses-base: os N meses fechados mais recentes antes do mês de hoje cuja competência já "amadureceu" na emissão.
   Olha meses_coleta meses; se descartar algum, a janela recua. */
function janelaBase({ hoje, emissao, vencimentoDe }, politica = POLITICA_PADRAO) {
  const mesAtual = hoje.slice(0, 7);
  const meses = [], descartadas = [];
  for (let i = 1; i <= politica.meses_coleta && meses.length < politica.meses_base; i++) {
    const comp = somarMeses(mesAtual, -i);
    const venc = vencimentoDe(comp);
    if (emissao && competenciaMadura(emissao, venc, politica)) meses.push({ competencia: comp, vencimento: venc });
    else descartadas.push({ competencia: comp, vencimento: venc, motivo: emissao ? 'vencimento_recente' : 'sem_emissao' });
  }
  meses.sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
  return { meses, descartadas, suficiente: meses.length === politica.meses_base };
}

/* unidades isentas: síndico profissional não tem isenção; parcial conta a fração (50% + 50% = 1 unidade) */
function unidadesIsentas(form) {
  const s = form.sindico || {};
  let total = 0;
  const notas = [];
  if (s.tipo === 'profissional') {
    if (s.isencao && s.isencao !== 'nao') notas.push('síndico profissional não tem isenção: isenção informada desconsiderada');
  } else if (s.isencao === 'integral') total += 1;
  else if (s.isencao === 'parcial') total += (num(s.percentual) || 0) / 100;
  for (const o of form.outros_isentos || []) total += (num(o.percentual) ?? 100) / 100;
  return { total: Math.round(total * 10000) / 10000, notas };
}

const ehPJ = (u) => {
  if (u.tipo_pessoa) return u.tipo_pessoa === 'PJ';
  const d = String(u.documento || '').replace(/\D/g, '');
  if (d.length === 14) return true;
  if (d.length === 11) return false;
  return /\b(ltda|s\/?a|eireli|me|epp|construtora|incorporadora|empreendimentos|imobiliaria|participacoes)\b/.test(semAcento(u.titular));
};

/* ---------- o motor ---------- */
function analisar(entrada, politica = POLITICA_PADRAO, opcoes = {}) {
  const P = politica;
  const hoje = normalizarData(opcoes.hoje || new Date());
  const f = entrada.formulario || {};
  const conv = entrada.convencao && entrada.convencao.presente !== false ? entrada.convencao : null;
  const rel = entrada.relatorio && entrada.relatorio.presente !== false ? entrada.relatorio : null;
  const an = entrada.analista || {};
  const uf = String(f.uf || '').toUpperCase();

  const pendencias = [], ressalvas = [], reprovacoes = [], alertas = [], divergencias = [], observacoes = [], ajustesAplicados = [];
  const alerta = (codigo, nivel, mensagem, dados) => alertas.push({ codigo, nivel, mensagem, ...(dados ? { dados } : {}) });

  /* ajustes do analista: só valem com justificativa; ficam nas observações sem dizer quem ajustou */
  const ajustes = {};
  for (const [campo, a] of Object.entries(an.ajustes || {})) {
    if (!a || a.valor === undefined || a.valor === null || a.valor === '') continue;
    if (!String(a.justificativa || '').trim()) {
      alerta('ajuste_sem_justificativa', 'atencao', `Ajuste em "${campo}" sem justificativa: não foi aplicado.`);
      continue;
    }
    ajustes[campo] = a;
  }
  const ajustar = (campo, valor, descricao) => {
    const a = ajustes[campo];
    if (!a) return valor;
    ajustesAplicados.push({ campo, de: valor, para: a.valor, justificativa: a.justificativa });
    observacoes.push(`${descricao} ajustado na análise (${a.justificativa.trim()}).`);
    return a.valor;
  };

  /* ---------- dados do relatório por unidade ---------- */
  const unidades = (rel?.unidades || []).map((u) => ({
    ...u,
    id: String(u.unidade || '').trim(),
    lancamentos: (u.lancamentos || []).map((l) => ({
      ...l,
      competencia: normalizarCompetencia(l.competencia) || normalizarCompetencia(l.vencimento),
      vencimento: normalizarData(l.vencimento),
      tipo: l.tipo || 'outro',
      c: cent(l.valor),
    })).filter((l) => l.competencia),
  }));
  const ordinarias = unidades.flatMap((u) => u.lancamentos.filter((l) => l.tipo === 'ordinaria'));

  /* ---------- hierarquia de fontes ---------- */
  const divergir = (campo, valores, usado, fonte) => divergencias.push({ campo, valores, usado, fonte });

  // nº de UH: convenção (padrão §8.5) ou formulário
  const uhForm = num(f.uh_total), uhConv = num(conv?.uh);
  let uhTotal, uhFonte;
  if (P.uh_fonte === 'convencao' && uhConv !== null) { uhTotal = uhConv; uhFonte = 'convencao'; } else if (uhForm !== null) { uhTotal = uhForm; uhFonte = 'formulario'; } else { uhTotal = uhConv; uhFonte = uhConv !== null ? 'convencao' : null; }
  if (uhForm !== null && uhConv !== null && uhForm !== uhConv) divergir('uh_total', { formulario: uhForm, convencao: uhConv }, uhTotal, uhFonte);
  uhTotal = num(ajustar('uh_total', uhTotal, 'Número de unidades'));

  // taxa ordinária e vencimento: formulário prevalece
  let ordinaria = num(f.taxa_ordinaria);
  // a taxa do relatório é a das 3 competências mais recentes (a vigente), não a mais comum de todo o histórico
  const recentes = [...new Set(ordinarias.map((l) => l.competencia))].sort().slice(-3);
  const ordRecentes = ordinarias.filter((l) => recentes.includes(l.competencia));
  const ordRel = ordRecentes.length ? moda(ordRecentes.map((l) => l.c)) : null;
  if (ordinaria !== null && ordRel !== null && Math.abs(cent(ordinaria) - ordRel) > 1) divergir('taxa_ordinaria', { formulario: ordinaria, relatorio: reais(ordRel) }, ordinaria, 'formulario');
  ordinaria = num(ajustar('taxa_ordinaria', ordinaria, 'Valor da taxa ordinária'));

  let diaVenc = num(f.dia_vencimento);
  const diasRel = ordinarias.filter((l) => l.vencimento).map((l) => partes(l.vencimento)[2]);
  const diaRel = diasRel.length ? moda(diasRel) : null;
  if (diaVenc !== null && diaRel !== null && diaVenc !== diaRel) divergir('dia_vencimento', { formulario: diaVenc, relatorio: diaRel }, diaVenc, 'formulario');
  diaVenc = num(ajustar('dia_vencimento', diaVenc, 'Dia do vencimento'));

  // isenções
  const ise = unidadesIsentas(f);
  ise.notas.forEach((n) => observacoes.push(`${n[0].toUpperCase()}${n.slice(1)}.`));
  let uhIsentas = ise.total;
  const iseInf = num(f.uh_isentas_informadas);
  if (iseInf !== null && Math.abs(iseInf - uhIsentas) > EPS) divergir('uh_isentas', { formulario_total: iseInf, formulario_detalhe: uhIsentas }, uhIsentas, 'formulario');
  uhIsentas = num(ajustar('uh_isentas', uhIsentas, 'Número de unidades isentas'));

  if (uhTotal === null) pendencias.push({ codigo: 'dado_ausente', campo: 'uh_total', mensagem: 'Informar a quantidade de unidades.' });
  if (ordinaria === null) pendencias.push({ codigo: 'dado_ausente', campo: 'taxa_ordinaria', mensagem: 'Informar o valor da taxa ordinária.' });
  if (diaVenc === null) pendencias.push({ codigo: 'dado_ausente', campo: 'dia_vencimento', mensagem: 'Informar o dia do vencimento.' });

  /* ---------- verificação documental ---------- */
  let emissao = rel ? normalizarData(rel.data_emissao) : null;
  if (!rel) pendencias.push({ codigo: 'relatorio_ausente', mensagem: 'Anexar o relatório de contas a receber / inadimplência detalhado por competência.' });
  else {
    if (rel.tem_competencia === false) pendencias.push({ codigo: 'relatorio_sem_competencia', mensagem: 'O relatório traz só o total por devedor: enviar o relatório detalhado por mês de competência.' });
    if (!emissao) pendencias.push({ codigo: 'relatorio_sem_emissao', mensagem: 'O relatório não mostra a data de emissão: enviar o relatório com a data de emissão.' });
    else if (emissao < somarDias(somarMeses(hoje.slice(0, 7), -P.relatorio_validade_meses) + hoje.slice(7), 0)) {
      pendencias.push({ codigo: 'relatorio_desatualizado', mensagem: `Relatório emitido em ${emissao.split('-').reverse().join('/')}, há mais de ${P.relatorio_validade_meses} meses: enviar o relatório atualizado.` });
    }
    if (num(rel.ocr_confianca) !== null && rel.ocr_confianca < 0.8) alerta('ocr_baixa_confianca', 'atencao', 'Relatório escaneado com leitura de baixa confiança: conferir os valores com o PDF.');
    if (rel.tem_nomes === false) ressalvas.push({ codigo: 'relatorio_sem_nomes', texto: 'O relatório não identifica os devedores: a consulta Assertiva não é possível e a MyBlue não absorve espólio não identificado.' });
  }
  if (!conv) ressalvas.push({ codigo: 'convencao_ausente', texto: 'Convenção não apresentada: entregar antes da assinatura do contrato.' });
  else {
    const reg = conv.registro;
    const valeGenerico = reg === 'cartorio' && P.registro_generico_ufs.includes(uf);
    if (reg !== 'RI' && !valeGenerico) {
      ressalvas.push({ codigo: 'convencao_sem_registro_ri', texto: reg === 'RTD'
        ? 'Convenção registrada só em Títulos e Documentos (RTD), sem registro no Cartório de Registro de Imóveis: regularizar em até 90 dias.'
        : 'Convenção sem registro no Cartório de Registro de Imóveis: regularizar em até 90 dias.' });
    }
    if (num(conv.multa_pct) !== null && conv.multa_pct > P.multa_maxima_pct + EPS) alerta('multa_acima_limite', 'atencao', `Multa convencional de ${String(conv.multa_pct).replace('.', ',')}%, acima do limite de 2% (CC art. 1.336, §1º).`);
    if (conv.foro && f.cidade && !semAcento(conv.foro).includes(semAcento(f.cidade))) alerta('foro', 'atencao', `Foro eleito na convenção (${conv.foro}) diferente da cidade do condomínio.`);
    if (conv.clausula_restritiva) alerta('clausula_restritiva', 'atencao', `Convenção com cláusula que limita garantidora ou empresa de cobrança${typeof conv.clausula_restritiva === 'string' ? `: ${conv.clausula_restritiva}` : ''}.`);
  }
  if (f.sem_cnpj) alerta('sem_cnpj', 'atencao', 'Condomínio ainda sem CNPJ: regularizar em até 90 dias da primeira arrecadação; até lá, o repasse vai para a conta da administradora.');
  if (f.tipo_contratacao === 'portabilidade') alerta('portabilidade', 'info', `Portabilidade${f.garantidora_atual ? ` (garantidora atual: ${f.garantidora_atual})` : ''}: alinhar a data de desligamento e as ações jurídicas em curso.`);

  /* ---------- janela de meses-base ---------- */
  const vencRel = new Map();
  for (const l of ordinarias) if (l.vencimento && (!vencRel.has(l.competencia) || l.vencimento < vencRel.get(l.competencia))) vencRel.set(l.competencia, l.vencimento);
  const vencimentoDe = (comp) => vencRel.get(comp) || vencimentoPeloDia(comp, diaVenc || 1);
  let janela = janelaBase({ hoje, emissao, vencimentoDe }, P);
  if (ajustes.janela && Array.isArray(ajustes.janela.valor)) {
    const comps = ajustes.janela.valor.map(normalizarCompetencia).filter(Boolean).sort();
    ajustar('janela', janela.meses.map((m) => m.competencia), 'Período de meses-base');
    janela = { meses: comps.map((c) => ({ competencia: c, vencimento: vencimentoDe(c) })), descartadas: [], suficiente: comps.length > 0, ajustada: true };
  }
  const comps = janela.meses.map((m) => m.competencia);
  if (rel && emissao && !janela.suficiente) {
    pendencias.push({ codigo: 'relatorio_anterior_janela', mensagem: `A posição do relatório é anterior aos ${P.meses_base} meses-base exigidos hoje: enviar o relatório atualizado.` });
  }
  const periodoIni = rel ? normalizarCompetencia(rel.periodo_inicio) : null;
  if (periodoIni && comps.some((c) => c < periodoIni)) pendencias.push({ codigo: 'competencia_faltante', mensagem: `O relatório começa em ${rotuloMes(periodoIni)} e não cobre toda a janela (${textoJanela(comps)}).` });
  if (comps.length) {
    let txt = `Inadimplência apurada sobre ${textoJanela(comps)}`;
    if (janela.descartadas.length && !janela.ajustada) txt += ` (${janela.descartadas.map((d) => rotuloMes(d.competencia)).join(', ')} fora da base: vencimento com ${P.dias_inclusivo ? 'menos de' : 'até'} ${P.dias_apos_vencimento} dias na emissão do relatório)`;
    observacoes.push(`${txt}.`);
  }

  /* ---------- escopo: isentas, espólios, retomadas ---------- */
  const exclusoes = new Map();
  const excluir = (id, motivo, detalhe, origem) => { if (id && !exclusoes.has(id)) exclusoes.set(id, { unidade: id, motivo, detalhe: detalhe || '', origem }); };
  for (const u of unidades) if (u.espolio || /\besp[oó]lio\b/i.test(u.titular || '')) excluir(u.id, 'espolio', u.titular, 'relatorio');
  // consulta Assertiva registrada pelo analista: espólio confirmado não entra na garantia
  const consultas = an.assertiva && typeof an.assertiva === 'object' ? an.assertiva : {};
  const espolioAssertiva = new Set();
  for (const u of unidades) {
    if (consultas[u.id]?.resultado !== 'espolio' || exclusoes.has(u.id)) continue;
    excluir(u.id, 'espolio', `confirmado na consulta Assertiva${u.titular ? ` — titular ${u.titular}` : ''}`, 'analista');
    espolioAssertiva.add(u.id);
  }
  for (const e of an.espolios || []) excluir(String(e.unidade).trim(), 'espolio', e.nome, 'analista');
  for (const r of an.retomadas || []) excluir(String(r.unidade).trim(), 'retomada', r.banco, 'analista');
  for (const a of an.abandonos || []) excluir(String(a.unidade).trim(), 'abandono', a.motivo, 'analista');
  const porId = new Map(unidades.map((u) => [u.id, u]));
  for (const ex of exclusoes.values()) {
    const u = porId.get(ex.unidade);
    ex.debito = reais((u?.lancamentos || []).filter((l) => TIPOS_PRINCIPAL.has(l.tipo) && l.tipo !== 'fundo_reserva').reduce((s, l) => s + l.c, 0));
    if (ex.motivo === 'espolio') ex.encaminhamento = 'Fora do escopo; débito cobrado do inventário.';
  }
  const uhEscopo = uhTotal === null ? null : Math.round((uhTotal - (uhIsentas || 0) - exclusoes.size) * 10000) / 10000;

  /* ---------- valores por unidade ---------- */
  // sem limite na política (padrão): a taxa extra vigente entra inteira
  const limiteExtra = num(P.extra_limite_pct) === null ? Infinity : ordinaria === null ? 0 : cent(ordinaria) * P.extra_limite_pct / 100;
  const extras = (f.taxas_extras || []).map((x) => ({ ...x, c: cent(x.valor_por_uh), inicio: normalizarCompetencia(x.inicio), fim: normalizarCompetencia(x.fim) }));
  const vigentes = (comp) => extras.filter((x) => (!x.inicio || x.inicio <= comp) && (!x.fim || x.fim >= comp));
  const extraValida = (comp) => {
    const soma = vigentes(comp).reduce((s, x) => s + x.c, 0);
    if (soma <= limiteExtra + EPS) return soma;
    return P.extra_acima_limite === 'limitar' ? Math.floor(limiteExtra) : 0;
  };
  const mesAtual = hoje.slice(0, 7);
  const extraAtual = extraValida(mesAtual);
  const somaExtraAtual = vigentes(mesAtual).reduce((s, x) => s + x.c, 0);
  if (somaExtraAtual > limiteExtra + EPS) {
    alerta('extra_acima_limite', 'atencao', `Taxa extra de ${fmtBRL(reais(somaExtraAtual))} por unidade passa de ${P.extra_limite_pct}% da ordinária: ${P.extra_acima_limite === 'limitar' ? `entra só até ${fmtBRL(reais(Math.floor(limiteExtra)))}` : 'fica fora da base'}.`);
  }
  const avisoExtra = ordinaria === null ? Infinity : cent(ordinaria) * P.extra_aviso_pct / 100;
  if (somaExtraAtual > avisoExtra + EPS && somaExtraAtual <= limiteExtra + EPS) {
    const pct = (somaExtraAtual / cent(ordinaria) * 100).toFixed(1).replace('.', ',');
    alerta('extra_acima_aviso', 'atencao', `Taxa extra de ${fmtBRL(reais(somaExtraAtual))} por unidade (${pct}% da ordinária) passa de ${P.extra_aviso_pct}% da ordinária: entra inteira na análise; conferir a ata e a permanência da taxa.`);
  }
  for (const x of vigentes(mesAtual)) {
    if (!x.ata) alerta('extra_sem_ata', 'atencao', `Taxa extra "${x.descricao || 'sem descrição'}" sem ata de aprovação anexada.`);
    if (x.fim) observacoes.push(`Taxa extra "${x.descricao || 'sem descrição'}" de ${fmtBRL(reais(x.c))} por unidade vigente até ${rotuloMes(x.fim)}.`);
  }
  const ag = f.agua_gas || {};
  const aguaUH = ag.compoe_boleto ? cent(num(ag.por_unidade) ?? ((num(ag.total_mensal) || 0) / (uhTotal || 1))) : 0;
  const valorPorUH = ordinaria === null ? null : cent(ordinaria) + extraAtual + aguaUH;

  /* ---------- receitas ---------- */
  let receitaBruta = null, desconto = 0, receitaLiquida = null;
  if (valorPorUH !== null && uhEscopo !== null) {
    receitaBruta = Math.round(uhEscopo * valorPorUH);
    const d = f.desconto_pontualidade || {};
    if (d.tipo === 'percentual' && num(d.valor)) desconto = Math.round(uhEscopo * cent(ordinaria) * d.valor / 100);
    else if (d.tipo === 'valor' && num(d.valor)) desconto = Math.round(uhEscopo * cent(d.valor));
    receitaLiquida = receitaBruta - desconto;
  }

  /* ---------- numerador mês a mês ---------- */
  const extraNoRelSemForm = new Set();
  const porMes = comps.map((comp) => {
    let total = 0;
    const porUnidade = [];
    for (const u of unidades) {
      if (exclusoes.has(u.id) || u.flag === 'acordo') continue;
      const ls = u.lancamentos.filter((l) => l.competencia === comp);
      let ord = 0, ext = 0, agua = 0, fundo = 0;
      for (const l of ls) {
        if (l.tipo === 'ordinaria') ord += l.c;
        else if (l.tipo === 'extra') ext += l.c;
        else if (l.tipo === 'agua_gas') agua += l.c;
        else if (l.tipo === 'fundo_reserva') fundo += l.c;
      }
      const limite = extraValida(comp);
      if (ext > 0 && limite === 0 && !vigentes(comp).length) extraNoRelSemForm.add(comp);
      const v = ord + Math.min(ext, limite) + (ag.compoe_boleto ? agua : 0) + (f.fundo_reserva_compoe_ordinaria ? fundo : 0);
      if (v > 0) { total += v; porUnidade.push({ unidade: u.id, valor: v }); }
    }
    return { competencia: comp, vencimento: janela.meses.find((m) => m.competencia === comp).vencimento, total, porUnidade };
  });
  if (extraNoRelSemForm.size) divergir('taxa_extra', { relatorio: [...extraNoRelSemForm].map(rotuloMes) }, 'fora da base', 'formulario');

  const podeApurar = receitaBruta > 0 && comps.length > 0 && rel && rel.tem_competencia !== false;
  // política: mês-base sem inadimplência sai da média (soma dos meses com débito ÷ quantos são); nenhum mês com débito → 0%
  const zerado = (m) => P.media_sem_meses_zerados && m.total === 0;
  const meses = porMes.map((m) => ({
    competencia: m.competencia, rotulo: rotuloMesLongo(m.competencia), vencimento: m.vencimento,
    inadimplentes: m.porUnidade.length, valor: reais(m.total), pct: podeApurar ? m.total / receitaBruta * 100 : null,
    ...(zerado(m) ? { fora_da_media: true } : {}),
  }));
  const naMedia = porMes.filter((m) => !zerado(m));
  const inadMedia = !podeApurar ? null : naMedia.length ? naMedia.reduce((s, m) => s + m.total / receitaBruta * 100, 0) / naMedia.length : 0;
  const inadMediaC = !podeApurar ? null : naMedia.length ? Math.round(naMedia.reduce((s, m) => s + m.total, 0) / naMedia.length) : 0;
  if (podeApurar && naMedia.length < porMes.length) {
    observacoes.push(naMedia.length
      ? `Média sobre ${naMedia.length === 1 ? '1 mês considerado' : `${naMedia.length} meses considerados`} (${textoJanela(naMedia.map((m) => m.competencia))}).`
      : 'Nenhuma inadimplência nos meses-base.');
  }

  /* ---------- alertas de perfil da dívida ---------- */
  if (podeApurar) {
    const divida = new Map();
    for (const m of porMes) for (const p of m.porUnidade) divida.set(p.unidade, (divida.get(p.unidade) || 0) + p.valor);
    const total = [...divida.values()].reduce((s, v) => s + v, 0);
    const ranking = [...divida.entries()].sort((a, b) => b[1] - a[1]).map(([unidade, v]) => ({ unidade, pct: v / total * 100 }));
    if (total > 0) {
      let k = 0, acum = 0;
      for (let i = 0; i < Math.min(3, ranking.length); i++) { acum += ranking[i].pct; if (acum >= P.concentracao_top3_pct - EPS) { k = i + 1; break; } }
      if (!k && ranking[0].pct >= P.concentracao_unidade_pct - EPS) k = 1;
      if (k) {
        const top = ranking.slice(0, k);
        const soma = top.reduce((s, r) => s + r.pct, 0);
        alerta('concentracao', 'atencao', `${k === 1 ? '1 unidade concentra' : `${k} unidades concentram`} ${soma.toFixed(1).replace('.', ',')}% da inadimplência da base (${top.map((r) => `${r.unidade} ${fmtPct(r.pct)}`).join('; ')}).`, { unidades: top, pct: soma });
      }
    }
    const tend = meses.filter((m) => !m.fora_da_media); // só os meses considerados na média
    if (tend.length >= 2 && tend.every((m, i) => i === 0 || m.pct > tend[i - 1].pct + EPS)) {
      alerta('tendencia_ascendente', 'atencao', `Inadimplência em alta nos meses-base (${tend.map((m) => fmtPct(m.pct)).join(' → ')}).`);
    }
  }

  /* ---------- precificação ---------- */
  const faixa = faixaPara(inadMedia, P);
  const boletoTab = boletoPara({ uf, executivo: f.executivo }, P);
  let taxaAdm = faixa ? faixa.taxa_adm : null;
  let boleto = boletoTab.valor;
  for (const [campo, tabela, nome] of [['taxa_adm', taxaAdm, 'Taxa de administração'], ['boleto', boleto, 'Valor do boleto']]) {
    const a = ajustes[campo];
    if (!a || tabela === null) continue;
    const v = num(a.valor);
    if (v === null || v < tabela - EPS) { alerta('ajuste_abaixo_tabela', 'atencao', `${nome} proposta abaixo da tabela: os valores da tabela são mínimos, ajuste não aplicado.`); continue; }
    if (campo === 'taxa_adm') taxaAdm = num(ajustar(campo, tabela, nome)); else boleto = num(ajustar(campo, tabela, nome));
    if (v > tabela + EPS) ressalvas.push({ codigo: `${campo}_acima_tabela`, texto: `${nome} acima da tabela (${campo === 'taxa_adm' ? fmtPct(v) : fmtBRL(v)}; tabela ${campo === 'taxa_adm' ? fmtPct(tabela) : fmtBRL(tabela)}): ${a.justificativa.trim()}.` });
  }

  /* ---------- indicadores ---------- */
  let indicadores = null, comparativo = null;
  if (taxaAdm !== null && receitaLiquida !== null && inadMediaC !== null) {
    const recMyBlue = Math.round(receitaLiquida * taxaAdm / 100) + Math.round(uhEscopo * cent(boleto));
    const exposicao = inadMediaC - recMyBlue;
    indicadores = { receita_myblue: reais(recMyBlue), valor_antecipado: reais(receitaLiquida - recMyBlue), exposicao: reais(exposicao) };
    const custoAtual = num(f.custo_boleto_atual) ?? P.custo_boleto_mercado;
    const boletosSem = Math.round(uhEscopo * cent(custoAtual));
    const recebeSem = receitaLiquida - inadMediaC - boletosSem;
    const recebeCom = receitaLiquida - recMyBlue;
    comparativo = {
      sem_myblue: { arrecadacao: reais(receitaLiquida), inadimplencia: reais(inadMediaC), boletos: reais(boletosSem), custo_boleto: custoAtual, custo_boleto_informado: num(f.custo_boleto_atual) !== null, recebimento: reais(recebeSem) },
      com_myblue: { arrecadacao: reais(receitaLiquida), inadimplencia: 0, taxa_adm: reais(Math.round(receitaLiquida * taxaAdm / 100)), boletos: reais(Math.round(uhEscopo * cent(boleto))), recebimento: reais(recebeCom) },
      ganho_mensal: reais(recebeCom - recebeSem), ganho_anual: reais((recebeCom - recebeSem) * 12),
    };
  }

  /* ---------- status ---------- */
  if (receitaLiquida !== null && receitaLiquida < cent(P.receita_minima)) reprovacoes.push({ codigo: 'receita_minima', texto: `Receita líquida de ${fmtBRL(reais(receitaLiquida))}, abaixo do mínimo de ${fmtBRL(P.receita_minima)}.` });
  if (inadMedia !== null && inadMedia > P.inad_reprovacao + EPS) reprovacoes.push({ codigo: 'inadimplencia', texto: `Inadimplência média de ${fmtPct(inadMedia)}, acima do limite de ${fmtPct(P.inad_reprovacao)}.` });
  if (indicadores && indicadores.exposicao > P.exposicao_maxima + EPS && inadMedia > P.exposicao_inad_minima + EPS) {
    reprovacoes.push({ codigo: 'exposicao', texto: `Exposição mensal de ${fmtBRL(indicadores.exposicao)} (acima de ${fmtBRL(P.exposicao_maxima)}) com inadimplência acima de ${fmtPct(P.exposicao_inad_minima)}.` });
  }
  if (String(an.condicao_estrutural || '').trim()) reprovacoes.push({ codigo: 'estrutural', texto: String(an.condicao_estrutural).trim() });

  const diretoria = inadMedia !== null && inadMedia > P.inad_diretoria + EPS && inadMedia <= P.inad_reprovacao + EPS;
  if (diretoria) {
    ressalvas.unshift({ codigo: 'diretoria', texto: `Inadimplência de ${fmtPct(inadMedia)}, entre ${fmtPct(P.inad_diretoria)} e ${fmtPct(P.inad_reprovacao)}: exige chancela da diretoria (CEO e Diretor Comercial).` });
    alerta('diretoria', 'critico', 'Inadimplência acima de 35%: enviar à diretoria antes de liberar o retorno.');
  }
  for (const r of an.ressalvas || []) {
    if (String(r.texto || '').trim() && String(r.justificativa || '').trim()) ressalvas.push({ codigo: 'analista', texto: r.texto.trim(), justificativa: r.justificativa.trim() });
    else if (String(r.texto || '').trim()) alerta('ressalva_sem_justificativa', 'atencao', `Ressalva "${r.texto.trim()}" sem justificativa operacional: não incluída.`);
  }

  let codigo = 'aprovada';
  if (reprovacoes.length) codigo = 'reprovada';
  else if (pendencias.length) codigo = 'pendente';
  else if (ressalvas.length) codigo = 'ressalvas';

  /* ---------- desconto de pontualidade (observação obrigatória) ---------- */
  const temDesconto = ['percentual', 'valor'].includes(f.desconto_pontualidade?.tipo) && num(f.desconto_pontualidade.valor) > 0;
  let notaDesconto;
  if (temDesconto) notaDesconto = 'O desconto de pontualidade deve ser mantido durante todo o contrato; reduzir ou retirar o desconto exige nova análise.';
  else if (inadMedia !== null && inadMedia > P.inad_reprovacao + EPS) notaDesconto = 'A implementação do desconto de pontualidade é condição obrigatória.';
  else if (inadMedia !== null && inadMedia > P.desconto_impreterivel_acima + EPS) notaDesconto = 'Recomenda-se, de forma impreterível, implementar desconto de pontualidade.';
  else notaDesconto = 'Recomenda-se implementar desconto de pontualidade para estimular o pagamento em dia.';
  observacoes.push(notaDesconto);

  /* ---------- Assertiva (candidatos a espólio) ---------- */
  const assertiva = { indicada: false, inviavel: rel?.tem_nomes === false, criterio: `${P.assertiva_min_taxas} ou mais taxas ordinárias ${P.assertiva_criterio === 'consecutivas' ? 'consecutivas ' : ''}em aberto`, candidatos: [] };
  if (!assertiva.inviavel) {
    const titulares = new Map();
    for (const u of unidades) { const t = semAcento(u.titular); if (t) titulares.set(t, (titulares.get(t) || 0) + 1); }
    for (const u of unidades) {
      if ((exclusoes.has(u.id) && !espolioAssertiva.has(u.id)) || ehPJ(u)) continue;
      const abertas = [...new Set(u.lancamentos.filter((l) => l.tipo === 'ordinaria' && l.c > 0).map((l) => l.competencia))].sort();
      if (!abertas.length) continue;
      let maiorSeq = 1, seq = 1;
      for (let i = 1; i < abertas.length; i++) { seq = somarMeses(abertas[i - 1], 1) === abertas[i] ? seq + 1 : 1; maiorSeq = Math.max(maiorSeq, seq); }
      const qtd = P.assertiva_criterio === 'consecutivas' ? maiorSeq : abertas.length;
      if (qtd < P.assertiva_min_taxas) continue;
      // cessação abrupta: as taxas em aberto formam um bloco único, sem pagamento no meio, até a última competência
      const cessacao = maiorSeq === abertas.length;
      assertiva.candidatos.push({
        unidade: u.id, titular: u.titular || '', documento: u.documento || '', taxas_em_aberto: abertas.length, consecutivas: maiorSeq,
        desde: abertas[0], ate: abertas[abertas.length - 1], cessacao_abrupta: cessacao,
        unidade_unica: (titulares.get(semAcento(u.titular)) || 0) === 1,
        consulta: ['espolio', 'nao_espolio'].includes(consultas[u.id]?.resultado) ? { resultado: consultas[u.id].resultado, em: consultas[u.id].em || null } : null,
      });
    }
    assertiva.candidatos.sort((a, b) => b.taxas_em_aberto - a.taxas_em_aberto || (a.desde < b.desde ? -1 : 1));
    assertiva.indicada = assertiva.candidatos.length > 0;
  }
  // o analista registra o resultado de cada consulta; sem isso o retorno não é liberado
  assertiva.pendentes = assertiva.candidatos.filter((x) => !x.consulta).map((x) => x.unidade);
  assertiva.espolios = assertiva.candidatos.filter((x) => x.consulta?.resultado === 'espolio').map((x) => x.unidade);
  const nCand = assertiva.candidatos.length;
  const unid = (n) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`;
  assertiva.texto = assertiva.inviavel
    ? 'Consulta Assertiva inviável: o relatório não identifica os devedores.'
    : !assertiva.indicada
      ? `Nenhuma pessoa física com ${assertiva.criterio}: consulta Assertiva não indicada.`
      : assertiva.pendentes.length
        ? `Consulta Assertiva indicada para ${unid(nCand)} com ${assertiva.criterio}${nCand - assertiva.pendentes.length ? ` (${nCand - assertiva.pendentes.length} já consultadas)` : ''}.`
        : assertiva.espolios.length
          ? `Consulta Assertiva feita em ${unid(nCand)} com ${assertiva.criterio}: ${assertiva.espolios.length === 1 ? '1 espólio confirmado, fora' : `${assertiva.espolios.length} espólios confirmados, fora`} da garantia (${assertiva.espolios.join(', ')}).`
          : `Consulta Assertiva feita em ${unid(nCand)} com ${assertiva.criterio}: nenhum espólio.`;

  return {
    politica_versao: P.versao,
    hoje,
    status: { codigo, rotulo: STATUS[codigo], motivos: codigo === 'reprovada' ? reprovacoes : codigo === 'pendente' ? pendencias : codigo === 'ressalvas' ? ressalvas : [] },
    pendencias, ressalvas, reprovacoes, alertas, divergencias, observacoes, ajustes: ajustesAplicados,
    janela: { meses: janela.meses, descartadas: janela.descartadas, texto: comps.length ? textoJanela(comps) : '', ajustada: !!janela.ajustada },
    escopo: { uh_total: uhTotal, uh_fonte: uhFonte, uh_isentas: uhIsentas, exclusoes: [...exclusoes.values()], uh_escopo: uhEscopo },
    valores: {
      taxa_ordinaria: ordinaria, extra_por_uh: reais(extraAtual), agua_gas_por_uh: reais(aguaUH), valor_por_uh: valorPorUH === null ? null : reais(valorPorUH),
      receita_bruta: receitaBruta === null ? null : reais(receitaBruta), desconto: reais(desconto), receita_liquida: receitaLiquida === null ? null : reais(receitaLiquida),
    },
    meses, inad_media: inadMedia, inad_media_rs: inadMediaC === null ? null : reais(inadMediaC),
    precificacao: codigo === 'pendente' || taxaAdm === null ? null : {
      faixa: faixa && { ate: faixa.ate, taxa_adm: faixa.taxa_adm }, taxa_adm: taxaAdm, boleto, boleto_tabela: boletoTab.valor, boleto_origem: boletoTab.origem,
    },
    indicadores: codigo === 'pendente' ? null : indicadores,
    comparativo: codigo === 'pendente' ? null : comparativo,
    assertiva,
    diretoria,
    prazo_horas: diretoria ? P.sla_horas_diretoria : P.sla_horas,
    validade_ate: somarDias(hoje, P.validade_dias),
  };
}

module.exports = {
  analisar, faixaPara, boletoPara, janelaBase, competenciaMadura, unidadesIsentas,
  normalizarCompetencia, normalizarData, textoJanela, fmtPct, fmtBRL, STATUS,
};
