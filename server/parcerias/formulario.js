'use strict';
/*
 * Solicitação de Contrato Parceria: as regras do formulário (o antigo "Solicitação de Contrato Parceria – MyBlue" do
 * Microsoft Forms), o que vai à diretoria, as condições registradas no contrato assinado e o cadastro do parceiro na
 * base de comissão (ferramenta Prestação de Contas — Comissão de Parceiros, coleção "partners").
 *
 * Comissões (padrão da MyBlue):
 *  - recorrência: 10% ou 5%;
 *  - venda: 50% da 1ª taxa administrativa.
 * O comercial pode pedir outro percentual: vai à diretoria antes da minuta. Não aprovado, vale o padrão.
 */
const { cnpjValido } = require('../implantacao');
const { cpfValido } = require('../implantacoes/formulario');

const RECORRENCIA = ['10', '5'];
const VENDA = ['50'];
const PADRAO = { recorrencia: 'recorrência de 10% ou 5%', venda: 'venda de 50% da 1ª taxa administrativa' };

const texto = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const digitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(v));
const cnpjOk = (v) => { const d = digitos(v); return d.length === 14 && cnpjValido(d); };
const pct = (v) => (v == null ? '' : `${String(Math.round(v * 100) / 100).replace('.', ',')}%`);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/* o formulário como vem da tela, limpo */
function normalizar(b) {
  const f = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const sn = (v) => (v === 'sim' || v === 'nao' ? v : '');
  return {
    empresa: texto(f.empresa, 200),
    cnpj: texto(f.cnpj, 20),
    representante_nome: texto(f.representante_nome, 200),
    representante_cpf: texto(f.representante_cpf, 20),
    representante_email: texto(f.representante_email, 200),
    financeiro_nome: texto(f.financeiro_nome, 200),
    financeiro_telefone: texto(f.financeiro_telefone, 30),
    email_prestacao: texto(f.email_prestacao, 200),
    recorrencia: sn(f.recorrencia),
    recorrencia_pct: [...RECORRENCIA, 'outro'].includes(String(f.recorrencia_pct)) ? String(f.recorrencia_pct) : '',
    recorrencia_outro: num(f.recorrencia_outro),
    venda: sn(f.venda),
    venda_pct: [...VENDA, 'outro'].includes(String(f.venda_pct)) ? String(f.venda_pct) : '',
    venda_outro: num(f.venda_outro),
    outras: texto(f.outras, 4000),
  };
}

/* o percentual pedido de cada comissão (null = sem comissão ou não escolhido) */
function pedido(f) {
  const rec = f.recorrencia !== 'sim' ? null : f.recorrencia_pct === 'outro' ? f.recorrencia_outro : num(f.recorrencia_pct);
  const ven = f.venda !== 'sim' ? null : f.venda_pct === 'outro' ? f.venda_outro : num(f.venda_pct);
  return { recorrencia: rec, venda: ven };
}

/* o que falta para enviar: { campo, msg } (o campo fica em vermelho na tela) */
function faltasCampos(f) {
  const out = [];
  const exige = (ok, campo, msg) => { if (!ok) out.push({ campo, msg }); };
  exige(f.empresa, 'empresa', 'Informar o nome da empresa.');
  exige(cnpjOk(f.cnpj), 'cnpj', f.cnpj ? 'O CNPJ da empresa não é válido.' : 'Informar o CNPJ da empresa.');
  exige(f.representante_nome, 'representante_nome', 'Informar o nome do representante legal.');
  exige(cpfValido(f.representante_cpf), 'representante_cpf', f.representante_cpf ? 'O CPF do representante legal não é válido.' : 'Informar o CPF do representante legal.');
  exige(emailOk(f.representante_email), 'representante_email', f.representante_email ? 'O e-mail do representante legal não é válido.' : 'Informar o e-mail do representante legal.');
  exige(f.financeiro_nome, 'financeiro_nome', 'Informar o nome do responsável financeiro.');
  const tel = digitos(f.financeiro_telefone);
  exige(tel.length >= 10 && tel.length <= 13, 'financeiro_telefone', f.financeiro_telefone ? 'O telefone do responsável financeiro precisa ter DDD.' : 'Informar o telefone do responsável financeiro.');
  exige(emailOk(f.email_prestacao), 'email_prestacao', f.email_prestacao ? 'O e-mail para a prestação de contas não é válido.' : 'Informar o e-mail para envio da prestação de contas.');
  exige(f.recorrencia, 'recorrencia', 'Dizer se tem comissão de recorrência.');
  if (f.recorrencia === 'sim') {
    exige(f.recorrencia_pct, 'recorrencia_pct', 'Escolher o percentual da comissão de recorrência.');
    if (f.recorrencia_pct === 'outro') exige(f.recorrencia_outro > 0 && f.recorrencia_outro <= 100, 'recorrencia_outro', 'Informar o percentual de recorrência pedido (de 0 a 100%).');
  }
  exige(f.venda, 'venda', 'Dizer se tem comissão de venda.');
  if (f.venda === 'sim') {
    exige(f.venda_pct, 'venda_pct', 'Escolher o percentual da comissão de venda.');
    if (f.venda_pct === 'outro') exige(f.venda_outro > 0 && f.venda_outro <= 100, 'venda_outro', 'Informar o percentual de venda pedido (de 0 a 100% da 1ª taxa administrativa).');
  }
  return out;
}

/* o que depende da diretoria: percentual fora do padrão */
function itensDiretoria(f) {
  const out = [];
  if (f.recorrencia === 'sim' && f.recorrencia_pct === 'outro' && f.recorrencia_outro > 0) out.push(`Comissão de recorrência de ${pct(f.recorrencia_outro)} (padrão: 10% ou 5%).`);
  if (f.venda === 'sim' && f.venda_pct === 'outro' && f.venda_outro > 0) out.push(`Comissão de venda de ${pct(f.venda_outro)} da 1ª taxa administrativa (padrão: 50%).`);
  return out;
}

/* avisos na tela (não impedem o envio) */
function avisos(f) {
  const out = [];
  if (f.recorrencia === 'nao' && f.venda === 'nao') out.push('Sem comissão de recorrência e sem comissão de venda: o contrato de parceria fica sem comissão.');
  if (itensDiretoria(f).length) out.push('Percentual fora do padrão: a diretoria decide antes da minuta. Não aprovado, o contrato segue o padrão.');
  return out;
}

/* condições do contrato assinado: partem do pedido e da decisão da diretoria; a advogada corrige o que mudou */
function fechadoInicial(c) {
  const f = c.formulario || {};
  const p = pedido(f);
  const d = c.diretoria || {};
  const recusado = d.decidido_em && !d.aprovado;
  const rec = f.recorrencia !== 'sim' ? null : recusado && f.recorrencia_pct === 'outro' ? null : p.recorrencia;
  const ven = f.venda !== 'sim' ? null : recusado && f.venda_pct === 'outro' ? 50 : p.venda;
  return {
    recorrencia: f.recorrencia === 'sim', recorrencia_pct: rec,
    venda: f.venda === 'sim', venda_pct: ven,
    inicio: '', prazo_meses: null,
    representante_nome: f.representante_nome || '', representante_email: f.representante_email || '',
    financeiro_nome: f.financeiro_nome || '', financeiro_telefone: f.financeiro_telefone || '', email_prestacao: f.email_prestacao || '',
    observacoes: '',
  };
}
function normalizarFechado(b) {
  const x = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  return {
    recorrencia: !!x.recorrencia, recorrencia_pct: x.recorrencia ? num(x.recorrencia_pct) : null,
    venda: !!x.venda, venda_pct: x.venda ? num(x.venda_pct) : null,
    inicio: /^\d{4}-\d{2}-\d{2}$/.test(String(x.inicio || '')) ? String(x.inicio) : '',
    prazo_meses: num(x.prazo_meses),
    representante_nome: texto(x.representante_nome, 200), representante_email: texto(x.representante_email, 200),
    financeiro_nome: texto(x.financeiro_nome, 200), financeiro_telefone: texto(x.financeiro_telefone, 30), email_prestacao: texto(x.email_prestacao, 200),
    observacoes: texto(x.observacoes, 2000),
  };
}
function faltasFechado(x) {
  const out = [];
  if (x.recorrencia && !(x.recorrencia_pct > 0 && x.recorrencia_pct <= 100)) out.push('Informar o percentual da comissão de recorrência.');
  if (x.venda && !(x.venda_pct > 0 && x.venda_pct <= 100)) out.push('Informar o percentual da comissão de venda.');
  if (!x.inicio) out.push('Informar o início da vigência.');
  if (!emailOk(x.email_prestacao)) out.push('Informar o e-mail da prestação de contas.');
  return out;
}
/* o que mudou do pedido para o contrato assinado */
function diferencasFechado(f, x) {
  const p = pedido(f);
  const out = [];
  if ((p.recorrencia || null) !== (x.recorrencia ? x.recorrencia_pct : null)) out.push({ rotulo: 'Recorrência', pedido: p.recorrencia ? pct(p.recorrencia) : 'sem', fechado: x.recorrencia ? pct(x.recorrencia_pct) : 'sem' });
  if ((p.venda || null) !== (x.venda ? x.venda_pct : null)) out.push({ rotulo: 'Venda', pedido: p.venda ? pct(p.venda) : 'sem', fechado: x.venda ? pct(x.venda_pct) : 'sem' });
  if ((f.email_prestacao || '') !== x.email_prestacao) out.push({ rotulo: 'E-mail da prestação de contas', pedido: f.email_prestacao || '—', fechado: x.email_prestacao || '—' });
  return out;
}
const ROTULOS = { recorrencia_pct: 'Recorrência', venda_pct: 'Venda', inicio: 'Início da vigência', prazo_meses: 'Prazo (meses)', representante_nome: 'Representante legal',
  representante_email: 'E-mail do representante', financeiro_nome: 'Responsável financeiro', financeiro_telefone: 'Telefone do financeiro', email_prestacao: 'E-mail da prestação de contas', observacoes: 'Observações' };
function mudancasFechado(antes, depois) {
  const a = antes || {};
  const mostra = (k, v) => (v == null || v === '' ? '—' : /_pct$/.test(k) ? pct(v) : String(v));
  return Object.keys(ROTULOS).filter((k) => String(a[k] == null ? '' : a[k]) !== String(depois[k] == null ? '' : depois[k]))
    .map((k) => ({ rotulo: ROTULOS[k], antes: mostra(k, a[k]), depois: mostra(k, depois[k]) }));
}

/* categorias de comissão da ferramenta, pelo contrato: só venda (a indicação é paga uma vez), só recorrência ou as duas.
   As outras categorias que o parceiro já tinha (ex.: "condicao") ficam. */
const CATEGORIAS_COMISSAO = ['recorrencia', 'venda', 'somentevenda'];
function categoriasDoContrato(x, atuais) {
  let t = atuais;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = []; } }
  const outras = (Array.isArray(t) ? t : []).filter((c) => !CATEGORIAS_COMISSAO.includes(c));
  const rec = !!(x.recorrencia && x.recorrencia_pct > 0);
  const ven = !!(x.venda && x.venda_pct > 0);
  const daComissao = rec && ven ? ['recorrencia', 'venda'] : rec ? ['recorrencia'] : ven ? ['somentevenda'] : [];
  return JSON.stringify([...daComissao, ...outras]);
}

/* o registro do parceiro na base de comissão (o que a ferramenta lê: id, nome, uf, categorias e, no cadastro novo, as
   condições de cálculo; o resto vai junto para consulta). Parceiro que já estava na base mantém as condições de cálculo
   dele (tarifa, boletos, encargos…): só as categorias e os dados do contrato são atualizados. */
function registroParceiro(c, existente) {
  const f = c.formulario || {};
  const x = c.fechado || {};
  const base = existente || {};
  const rec = x.recorrencia ? x.recorrencia_pct : 0;
  const ven = x.venda ? x.venda_pct : 0;
  const condicoesNovo = existente ? {} : {
    rate: rec || 0, venda: ven ? 'primeiro' : 'nenhuma', vendaPct: ven || 50, vendaBase: 'tsr',
    tarifaNaBase: true, encNaBase: true, boletoModo: '', boletoPiso: 0, obs: '',
  };
  return {
    ...base,
    ...condicoesNovo,
    tags: categoriasDoContrato(x, base.tags),
    id: base.id || `p-${digitos(f.cnpj) || normal(f.empresa)}`,
    nome: base.nome || f.empresa,
    uf: base.uf || '',
    cnpj: f.cnpj,
    representante: x.representante_nome || f.representante_nome,
    email: x.representante_email || f.representante_email,
    responsavelFinanceiro: x.financeiro_nome || f.financeiro_nome,
    telefoneFinanceiro: x.financeiro_telefone || f.financeiro_telefone,
    emailPrestacao: x.email_prestacao || f.email_prestacao,
    comissaoRecorrencia: x.recorrencia ? x.recorrencia_pct : 0,
    comissaoVenda: x.venda ? x.venda_pct : 0,
    contrato: c.protocolo,
    vigencia: x.inicio || '',
  };
}
/* o parceiro já está na base? pelo CNPJ e, sem CNPJ lá, pelo nome */
function acharNaBase(base, c) {
  const f = c.formulario || {};
  const cnpj = digitos(f.cnpj);
  return (base || []).find((p) => p && cnpj && digitos(p.cnpj) === cnpj)
    || (base || []).find((p) => p && !digitos(p.cnpj) && normal(p.nome) && normal(p.nome) === normal(f.empresa)) || null;
}

module.exports = { RECORRENCIA, VENDA, PADRAO, normalizar, pedido, faltasCampos, itensDiretoria, avisos, fechadoInicial, normalizarFechado, faltasFechado,
  diferencasFechado, mudancasFechado, registroParceiro, categoriasDoContrato, acharNaBase, cnpjOk, emailOk, digitos, pct };
