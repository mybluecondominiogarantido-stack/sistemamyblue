'use strict';
/*
 * Formulário de Implantação: o que vem da análise, o que falta para enviar, o que pode chegar depois
 * (vira alerta ao executivo) e o que ficou diferente da análise (comparativo para o setor e o gestor).
 * Funções puras: as rotas (server/rotas/implantacoes.js) leem o banco e chamam estas.
 *
 * Campos do formulário (JSON plano, guardado em implantacoes.formulario):
 *   condomínio  nome, cnpj, sem_cnpj, uf, cidade, uh_total, dia_vencimento, entrega, construtora, construtora_contato
 *   síndico     sindico_tipo (condomino|profissional), sindico_isencao (nao|integral|parcial), sindico_isencao_pct,
 *               sindico_nome, sindico_cpf, sindico_email, sindico_telefone
 *   condições   taxa_adm, boleto, taxa_ordinaria, desconto_tipo (nenhum|percentual|valor), desconto_valor, desconto_ate_dia,
 *               inicio_contrato (AAAA-MM-DD), honorarios (%), garantias [], garantia_outra, taxas_extras [{descricao, valor_por_uh, inicio, fim}]
 *   parceria    parceria (sim|nao), parceiros [{id, nome}] — o percentual é do setor Parceiros
 *   cashback    cashback (nao|5|10|outro), cashback_pct, cashback_receitas []
 *   antecipação antecipacao (sim|nao), antecipacao_valor, antecipacao_data, antecipacao_prazo
 *   contatos    administradora, administracao_interna, consultor_nome, consultor_telefone, consultor_email,
 *               contatos [{nome, funcao, telefone, email}], observacoes
 */
const { cnpjValido } = require('../implantacao');

const DOCUMENTOS = {
  convencao: { nome: 'Convenção do condomínio', obrigatorio: true },
  cadastro_moradores: { nome: 'Cadastro de moradores atualizado (Excel)', obrigatorio: true },
  ata_eleicao: { nome: 'Ata de eleição do síndico', obrigatorio: true },
  ata_orcamento: { nome: 'Ata de previsão orçamentária', obrigatorio: true },
  analise_credito: { nome: 'Análise de Crédito' },
  documento_sindico: { nome: 'RG/CPF ou CNH do síndico', pendente: true },
  conta_bancaria: { nome: 'Conta bancária', pendente: true },
  comprovante_endereco: { nome: 'Comprovante de endereço do síndico', pendente: true },
  modelo_boleto: { nome: 'Modelo do boleto anterior', pendente: true },
  outro: { nome: 'Outro documento' },
};
const GARANTIAS = ['Taxa ordinária', 'Taxa extraordinária', 'Água', 'Gás', 'Fundo de reserva', 'Fundo de obras'];
const RECEITAS_CASHBACK = ['Taxa administrativa', 'Juros', 'Multa', 'Honorários', 'Tarifa bancária'];

const texto = (v) => String(v == null ? '' : v).trim();
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const digitos = (v) => texto(v).replace(/\D/g, '');

function cpfValido(v) {
  const d = digitos(v);
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
const cnpjOk = (v) => { const d = digitos(v); return d.length >= 11 && d.length <= 14 && cnpjValido(d.padStart(14, '0')); };
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(v));

/* formulário e referência (para o comparativo) a partir de uma análise do portal */
function daAnalise(a) {
  const f = a.formulario || {};
  const s = f.sindico || {};
  const d = f.desconto_pontualidade || {};
  const comum = {
    uh_total: num(f.uh_total), taxa_ordinaria: num(f.taxa_ordinaria), dia_vencimento: num(f.dia_vencimento),
    desconto_tipo: ['percentual', 'valor'].includes(d.tipo) ? d.tipo : 'nenhum', desconto_valor: num(d.valor),
    sindico_tipo: s.tipo || '', sindico_isencao: s.isencao || 'nao', administradora: texto(f.administradora),
    taxa_adm: num(a.taxa_adm), boleto: num(a.boleto),
  };
  return {
    formulario: {
      ...comum, nome: texto(f.razao_social || a.condominio), cnpj: texto(f.cnpj || a.cnpj), uf: texto(f.uf || a.uf).toUpperCase(), cidade: texto(f.cidade || a.cidade),
      sindico_isencao_pct: num(s.percentual), entrega: false,
      taxas_extras: (f.taxas_extras || []).map((x) => ({ descricao: texto(x.descricao), valor_por_uh: num(x.valor_por_uh), inicio: texto(x.inicio), fim: texto(x.fim) })),
    },
    referencia: { ...comum, protocolo: a.protocolo, resultado: a.resultado },
  };
}

/* o que falta para enviar ao setor (bloqueia o envio) */
function faltas(f, { docs = new Set(), origem, executivoId } = {}) {
  const l = [];
  const exige = (cond, msg) => { if (!cond) l.push(msg); };
  exige(texto(f.nome), 'Informar o nome do condomínio.');
  if (f.sem_cnpj) exige(f.entrega || origem === 'entrega', 'Só condomínio de entrega pode seguir sem CNPJ.');
  else exige(cnpjOk(f.cnpj), 'Informar um CNPJ válido (condomínio de entrega sem CNPJ: marque "Ainda não tem CNPJ").');
  exige(/^[A-Z]{2}$/.test(texto(f.uf)), 'Informar o estado do contrato.');
  exige(num(f.uh_total) > 0, 'Informar o número de unidades.');
  exige(num(f.dia_vencimento) >= 1 && num(f.dia_vencimento) <= 31, 'Informar o dia do vencimento (1 a 31).');
  if (f.entrega) exige(texto(f.construtora), 'Informar a construtora (condomínio de entrega).');
  exige(['condomino', 'profissional'].includes(f.sindico_tipo), 'Informar o tipo de síndico.');
  exige(['nao', 'integral', 'parcial'].includes(f.sindico_isencao), 'Informar se o síndico é isento da taxa.');
  exige(texto(f.sindico_nome), 'Informar o nome do síndico.');
  exige(cpfValido(f.sindico_cpf), 'Informar um CPF do síndico válido.');
  exige(emailOk(f.sindico_email), 'Informar o e-mail do síndico ou do condomínio.');
  exige(digitos(f.sindico_telefone).length >= 10, 'Informar o telefone do síndico (com DDD).');
  exige(num(f.taxa_adm) > 0, 'Informar a taxa administrativa.');
  exige(num(f.boleto) > 0, 'Informar o valor do boleto.');
  if (['percentual', 'valor'].includes(f.desconto_tipo)) exige(num(f.desconto_valor) > 0, 'Informar o valor do desconto de pontualidade.');
  exige(/^\d{4}-\d{2}-\d{2}$/.test(texto(f.inicio_contrato)), 'Informar a data de início do contrato.');
  exige(num(f.honorarios) > 0, 'Informar o percentual de honorários de cobrança extrajudicial.');
  exige((f.garantias || []).length || texto(f.garantia_outra), 'Marcar o que será garantido.');
  exige(['sim', 'nao'].includes(f.parceria), 'Dizer se há contrato de parceria.');
  if (f.parceria === 'sim') exige((f.parceiros || []).some((p) => texto(p.nome)), 'Escolher o parceiro.');
  exige(['nao', '5', '10', 'outro'].includes(String(f.cashback || '')), 'Dizer se o contrato tem cashback.');
  if (f.cashback === 'outro') exige(num(f.cashback_pct) > 0, 'Informar o percentual do cashback.');
  if (['5', '10', 'outro'].includes(String(f.cashback))) exige((f.cashback_receitas || []).length, 'Marcar sobre quais receitas incide o cashback.');
  exige(['sim', 'nao'].includes(f.antecipacao), 'Dizer se foi negociada antecipação de valores.');
  if (f.antecipacao === 'sim') {
    exige(num(f.antecipacao_valor) > 0, 'Informar o valor da antecipação.');
    exige(/^\d{4}-\d{2}-\d{2}$/.test(texto(f.antecipacao_data)), 'Informar a data da antecipação.');
    exige(texto(f.antecipacao_prazo), 'Dizer se a antecipação é permanente ou até quando.');
  }
  exige(texto(f.administradora), f.administracao_interna ? 'Informar quem administra o condomínio (administração interna).' : 'Informar a administradora.');
  exige(texto(f.consultor_nome), 'Informar o consultor do condomínio.');
  exige(digitos(f.consultor_telefone).length >= 10 || emailOk(f.consultor_email), 'Informar o telefone ou o e-mail do consultor.');
  exige(executivoId, 'Escolher o executivo de negócios.');
  for (const [tipo, d] of Object.entries(DOCUMENTOS)) if (d.obrigatorio && !docs.has(tipo)) l.push(`Anexar: ${d.nome}.`);
  return l;
}

/* o que pode chegar depois do envio: vira alerta ao executivo até chegar */
function pendencias(f, docs = new Set()) {
  const l = Object.entries(DOCUMENTOS).filter(([tipo, d]) => d.pendente && !docs.has(tipo)).map(([, d]) => d.nome);
  if (f.sem_cnpj) l.unshift('CNPJ do condomínio');
  return l;
}

/* o que mudou em relação à análise (ou à aprovação da diretoria) */
function diferencas(f, ref) {
  if (!ref || ref.taxa_adm == null) return [];
  const l = [];
  const comparar = (campo, rotulo, a, b) => { if (a != null && b != null && Math.abs(Number(a) - Number(b)) > 0.0001) l.push({ campo, rotulo, valor: Number(a), analise: Number(b) }); };
  comparar('taxa_adm', 'Taxa administrativa (%)', num(f.taxa_adm), ref.taxa_adm);
  comparar('boleto', 'Valor do boleto (R$)', num(f.boleto), ref.boleto);
  comparar('uh_total', 'Nº de unidades', num(f.uh_total), ref.uh_total);
  comparar('taxa_ordinaria', 'Taxa ordinária (R$)', num(f.taxa_ordinaria), ref.taxa_ordinaria);
  comparar('dia_vencimento', 'Dia do vencimento', num(f.dia_vencimento), ref.dia_vencimento);
  const desc = (t, v) => (['percentual', 'valor'].includes(t) ? `${t === 'percentual' ? `${v}%` : `R$ ${v}`}` : 'não possui');
  if (ref.desconto_tipo && desc(f.desconto_tipo, num(f.desconto_valor)) !== desc(ref.desconto_tipo, ref.desconto_valor)) {
    l.push({ campo: 'desconto', rotulo: 'Desconto de pontualidade', valor: desc(f.desconto_tipo, num(f.desconto_valor)), analise: desc(ref.desconto_tipo, ref.desconto_valor) });
  }
  if (ref.sindico_isencao && f.sindico_isencao && f.sindico_isencao !== ref.sindico_isencao) l.push({ campo: 'sindico_isencao', rotulo: 'Isenção do síndico', valor: f.sindico_isencao, analise: ref.sindico_isencao });
  return l;
}

/* ---------- setor Implantação: as 5 etapas ----------
   etapas = { documentacao: { feito }, vouch: { id }, onboarding: { situacao, data }, boletos: { feito }, envio: { forma } } */
const ONBOARDING = { a_marcar: 'A marcar', marcado: 'Marcado', sindico_myblue: 'Síndico MyBlue', realizado: 'Realizado' };
const ENVIO = { email: 'Digital (e-mail)', fisico: 'Físico', ambos: 'Ambos' };
const ENVIO_CARTEIRA = { email: 'E-MAIL', fisico: 'IMPRESSO', ambos: 'IMPRESSO/E-MAIL' };

function normalizarEtapas(e) {
  e = e && typeof e === 'object' ? e : {};
  const o = e.onboarding || {};
  return {
    documentacao: { feito: !!(e.documentacao && e.documentacao.feito) },
    vouch: { id: texto(e.vouch && e.vouch.id).slice(0, 30) },
    onboarding: { situacao: ONBOARDING[o.situacao] ? o.situacao : 'a_marcar', data: texto(o.data).slice(0, 30) },
    boletos: { feito: !!(e.boletos && e.boletos.feito) },
    envio: { forma: ENVIO[e.envio && e.envio.forma] ? e.envio.forma : '' },
  };
}

/* o que falta para concluir a implantação */
function faltasEtapas(e) {
  e = normalizarEtapas(e);
  const l = [];
  if (!e.documentacao.feito) l.push('Conferir a documentação.');
  if (!e.vouch.id) l.push('Cadastrar no sistema (Vouch) e informar o ID.');
  if (!['realizado', 'sindico_myblue'].includes(e.onboarding.situacao)) l.push('Fazer o onboarding (ou marcar "Síndico MyBlue").');
  if (!e.boletos.feito) l.push('Emitir os boletos.');
  if (!e.envio.forma) l.push('Escolher o envio dos boletos (digital, físico ou ambos).');
  return l;
}

/* cadastro de moradores (Excel ou CSV): unidades e CPF/CNPJ de cada linha, para conferir com o formulário */
function conferirCadastro(linhas) {
  const norm = (s) => texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let cab = -1, colUn = -1, colDoc = -1;
  for (let i = 0; i < Math.min(linhas.length, 15) && cab < 0; i++) {
    const l = (linhas[i] || []).map(norm);
    const un = l.findIndex((c) => /^(unidade|unid|apto|apartamento|apt|casa|lote|sala|bloco\/?apto|uh)\b/.test(c));
    if (un >= 0) { cab = i; colUn = un; colDoc = l.findIndex((c) => /\b(cpf|cnpj|documento|cpf\/cnpj)\b/.test(c)); }
  }
  if (cab < 0) return { erro: 'Não achei a coluna de unidade no cadastro de moradores (ex.: Unidade, Apto, Casa).' };
  const unidades = new Set();
  const invalidos = [];
  let semDocumento = 0;
  for (let i = cab + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const un = texto(l[colUn]);
    if (!un) continue;
    unidades.add(un.toUpperCase());
    if (colDoc < 0) continue;
    const d = digitos(l[colDoc]);
    if (!d) semDocumento++;
    else if (!(d.length === 11 ? cpfValido(d) : cnpjOk(d))) invalidos.push(i + 1);
  }
  return { unidades: unidades.size, tem_documento: colDoc >= 0, documentos_invalidos: invalidos, sem_documento: semDocumento };
}

module.exports = { DOCUMENTOS, GARANTIAS, RECEITAS_CASHBACK, ONBOARDING, ENVIO, ENVIO_CARTEIRA, cpfValido, cnpjOk, daAnalise, faltas, pendencias, diferencas,
  normalizarEtapas, faltasEtapas, conferirCadastro };
