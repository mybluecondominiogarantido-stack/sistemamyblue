'use strict';
/*
 * Solicitação de Contrato: o que vem da análise, o que falta para enviar ao Jurídico, os avisos do Manual do Contrato
 * (o que o comercial não pode prometer), o que precisa da diretoria e o que segue para a Implantação.
 * Funções puras: as rotas (server/rotas/contratos.js) leem o banco e chamam estas.
 *
 * Campos (JSON plano, guardado em contratos.formulario), na ordem do antigo formulário do Microsoft Forms:
 *   condomínio  nome, cnpj, sem_cnpj, sem_cnpj_ciente, uf, cidade, administradora
 *   síndico     sindico_nome, sindico_cpf, sindico_email, sindico_telefone
 *   condições   taxa_adm, boleto, desconto_tipo (nenhum|percentual|valor), desconto_valor,
 *               garantias [], garantia_outra, taxa_ordinaria, taxa_extra (R$ por unidade, somadas)
 *   cashback    cashback (nao|5|10|outro), cashback_pct, cashback_receitas [], cashback_receita_outra
 *   vigência    inicio_contrato (AAAA-MM-DD, início do contrato: o executivo informa, a advogada confirma o que foi fechado)
 *   vencimento  primeiro_vencimento (AAAA-MM-DD, o executivo informa; o dia dele é o dia_vencimento dos boletos), periodo_minimo (meses),
 *               fidelizacao (true = pedir a versão com fidelização fora da Paraíba)
 *   pedidos     pedidos [chave de server/contratos/clausulas.js], pedidos_detalhe { chave: texto }
 *   outras solicitações  minucias (opcional: qualquer outra tratativa ou observação)
 *
 * Condições fechadas (contratos.fechado), registradas pela advogada com o contrato assinado; vão para a Implantação:
 *   taxa_adm, boleto, desconto_tipo, desconto_valor, desconto_inicio, garantias [], garantia_outra, limite_extra (% da
 *   ordinária coberto), cashback, cashback_pct, cashback_receitas [], inicio_contrato, dia_vencimento, periodo_minimo,
 *   fidelizacao, foro, prazo_contestacao (dias), clausulas [{ chave, clausula, pedido, resultado (aceito|parcial|recusado), redacao }],
 *   observacoes
 */
const I = require('../implantacoes/formulario');
const C = require('./clausulas');

/* os documentos do síndico (atas, cadastros, RG…) são pedidos só na Implantação. Os "antigo" ficam para os arquivos que já
   tinham sido anexados: aparecem se existirem, mas não são mais pedidos nem aceitos. */
const DOCUMENTOS = {
  analise_credito: { nome: 'Análise de Crédito' },
  convencao: { nome: 'Convenção do condomínio', assinatura: true },
  ata_ago: { nome: 'Ata da assembleia que autorizou a contratação (sem CNPJ)' },
  minuta: { nome: 'Minuta do contrato', juridico: true },
  contrato_assinado: { nome: 'Contrato assinado' },
  outro: { nome: 'Outro documento' },
  regimento: { nome: 'Regimento interno', antigo: true },
  ata_eleicao: { nome: 'Ata de eleição do síndico', antigo: true },
  atas_taxas: { nome: 'Atas que estipularam as taxas (ordinárias e extras)', antigo: true },
  cadastro_proprietarios: { nome: 'Cadastro dos proprietários', antigo: true },
  cadastro_locatarios: { nome: 'Cadastro dos locatários', antigo: true },
  documento_sindico: { nome: 'RG e CPF do síndico', antigo: true },
  comprovante_endereco: { nome: 'Comprovante de endereço do síndico', antigo: true },
  procuracao: { nome: 'Procuração assinada', antigo: true },
};
/* sem a convenção o contrato não é assinado: a solicitação avisa, e a advogada é avisada antes de mandar assinar */
const AVISO_CONVENCAO = 'Sem a convenção do condomínio: o contrato não pode ser assinado sem ela. Anexe a convenção em Documentos (ou peça ao síndico) antes da assinatura.';
const AVISO_CONVENCAO_JURIDICO = 'A convenção do condomínio não foi enviada: peça ao executivo antes de mandar assinar.';
const GARANTIAS = ['Taxa ordinária', 'Taxa extraordinária', 'Água', 'Gás', 'Fundo de reserva', 'Fundo de obras', 'Locação de ambientes a condôminos'];
const RECEITAS_CASHBACK = I.RECEITAS_CASHBACK;
const LIMITE_EXTRA = 40; // % da ordinária coberto pela taxa administrativa normal (Cláusula 1ª, §2º)
const UF_FIDELIZACAO = ['PB'];

const texto = (v) => String(v == null ? '' : v).trim();
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const digitos = (v) => texto(v).replace(/\D/g, '');
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(v));
const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* formulário e referência (para o comparativo) a partir de uma análise do portal */
function daAnalise(a) {
  const f = a.formulario || {};
  const d = f.desconto_pontualidade || {};
  const extra = (f.taxas_extras || []).reduce((s, x) => s + (num(x.valor_por_uh) || 0), 0);
  const comum = { dia_vencimento: num(f.dia_vencimento), desconto_tipo: ['percentual', 'valor'].includes(d.tipo) ? d.tipo : 'nenhum', desconto_valor: num(d.valor),
    taxa_adm: num(a.taxa_adm), boleto: num(a.boleto), taxa_ordinaria: num(f.taxa_ordinaria) };
  return {
    formulario: { ...comum, nome: texto(f.razao_social || a.condominio), cnpj: texto(f.cnpj || a.cnpj), uf: texto(f.uf || a.uf).toUpperCase(), cidade: texto(f.cidade),
      administradora: texto(f.administradora), taxa_extra: extra || null },
    referencia: { ...comum, protocolo: a.protocolo, resultado: a.resultado },
  };
}

/* a partir do PDF de uma análise feita antes do portal (server/implantacoes/pdf.js) */
function doPdf(r) {
  const comum = { taxa_adm: r.taxa_adm, boleto: r.boleto, taxa_ordinaria: r.taxa_ordinaria, desconto_tipo: r.desconto_tipo || 'nenhum', desconto_valor: null };
  return {
    formulario: { ...comum, nome: texto(r.razao_social), cnpj: texto(r.cnpj), uf: texto(r.uf), cidade: texto(r.cidade) },
    referencia: { ...comum, desconto_tipo: r.desconto_tipo || null, dia_vencimento: null, protocolo: r.protocolo, resultado: r.resultado, data: r.data },
  };
}

const temCashback = (f) => ['5', '10', 'outro'].includes(String(f.cashback || ''));
const comFidelizacao = (f) => UF_FIDELIZACAO.includes(texto(f.uf).toUpperCase()) || !!f.fidelizacao;
const pctExtra = (f) => (num(f.taxa_extra) > 0 && num(f.taxa_ordinaria) > 0 ? (num(f.taxa_extra) / num(f.taxa_ordinaria)) * 100 : null);

/* o que falta para enviar ao Jurídico (bloqueia o envio), com o campo de cada falta para a tela marcar em vermelho */
function faltasCampos(f, { docs = new Set(), executivoId } = {}) {
  const l = [];
  const exige = (cond, campo, msg) => { if (!cond) l.push({ campo, msg }); };
  // vazio pede para informar; preenchido errado diz o que conferir
  const confere = (valor, ok, campo, vazio, errado) => exige(ok, campo, texto(valor) ? errado : vazio);
  exige(texto(f.nome), 'nome', 'Informar o nome do condomínio.');
  if (f.sem_cnpj) {
    exige(f.sem_cnpj_ciente, 'sem_cnpj_ciente', 'Marcar que o síndico está ciente dos 90 dias para regularizar o CNPJ.');
    exige(texto(f.administradora), 'administradora', 'Informar a administradora (sem CNPJ, o repasse vai para a conta dela).');
    exige(docs.has('ata_ago'), 'doc:ata_ago', `Anexar: ${DOCUMENTOS.ata_ago.nome}.`);
  } else confere(f.cnpj, I.cnpjOk(f.cnpj), 'cnpj', 'Informar o CNPJ do condomínio (sem CNPJ: marque "O condomínio ainda não tem CNPJ").', 'CNPJ inválido: confira os números.');
  exige(/^[A-Z]{2}$/.test(texto(f.uf)), 'uf', 'Informar o estado do condomínio.');
  exige(texto(f.sindico_nome), 'sindico_nome', 'Informar o nome do síndico.');
  const nCpf = digitos(f.sindico_cpf).length;
  confere(f.sindico_cpf, I.cpfValido(f.sindico_cpf), 'sindico_cpf', 'Informar o CPF do síndico.',
    nCpf !== 11 ? `CPF do síndico com ${nCpf} dígito(s): são 11.` : 'CPF do síndico inválido: confira os números.');
  confere(f.sindico_email, emailOk(f.sindico_email), 'sindico_email', 'Informar o e-mail do síndico ou do condomínio.', 'E-mail do síndico inválido: use o formato nome@dominio.com.br.');
  confere(f.sindico_telefone, digitos(f.sindico_telefone).length >= 10, 'sindico_telefone', 'Informar o telefone do síndico.', 'Telefone do síndico incompleto: informe com o DDD.');
  exige(num(f.taxa_adm) > 0, 'taxa_adm', 'Informar a taxa administrativa negociada.');
  exige(num(f.boleto) > 0, 'boleto', 'Informar o valor do boleto negociado.');
  exige(['nenhum', 'percentual', 'valor'].includes(f.desconto_tipo), 'desconto_tipo', 'Dizer se tem desconto de pontualidade.');
  if (['percentual', 'valor'].includes(f.desconto_tipo)) exige(num(f.desconto_valor) > 0, 'desconto_valor', 'Informar o valor ou o % do desconto de pontualidade.');
  exige((f.garantias || []).length || texto(f.garantia_outra), 'garantias', 'Marcar o que iremos garantir.');
  if ((f.garantias || []).includes('Taxa extraordinária')) exige(num(f.taxa_ordinaria) > 0, 'taxa_ordinaria', 'Informar a taxa ordinária (para conferir o limite da taxa extra).');
  exige(['nao', '5', '10', 'outro'].includes(String(f.cashback || '')), 'cashback', 'Dizer se foi concedido cashback.');
  if (f.cashback === 'outro') exige(num(f.cashback_pct) > 0, 'cashback_pct', 'Informar o percentual do cashback.');
  if (temCashback(f)) exige((f.cashback_receitas || []).length || texto(f.cashback_receita_outra), 'cashback_receitas', 'Marcar sobre quais receitas incide o cashback.');
  exige(dataOk(f.inicio_contrato), 'inicio_contrato', 'Informar a vigência (início do contrato).');
  exige(dataOk(f.primeiro_vencimento), 'primeiro_vencimento', 'Informar a data do primeiro vencimento.');
  for (const k of f.pedidos || []) if (!C.porChave.has(k)) l.push({ campo: 'pedidos', msg: 'Pedido de alteração desconhecido: desmarque e marque de novo.' });
  if ((f.pedidos || []).includes('foro_capital')) exige(texto((f.pedidos_detalhe || {}).foro_capital), 'pedidos', 'Dizer para qual foro (capital do estado de origem do contrato).');
  exige(executivoId, 'executivo_id', 'Escolher o executivo de negócios.');
  return l;
}
const faltas = (f, opcoes) => faltasCampos(f, opcoes).map((x) => x.msg);

const dataOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(texto(v));
/* o dia do primeiro vencimento é o dia de vencimento dos boletos */
const diaDe = (v) => (dataOk(v) ? Number(texto(v).slice(8, 10)) : null);
/* o que o executivo salva: o dia de vencimento sai da data do primeiro vencimento */
function completarPedido(f) {
  if (dataOk(f.primeiro_vencimento)) f.dia_vencimento = diaDe(f.primeiro_vencimento);
  return f;
}

/* o que só entra na minuta com a decisão da diretoria */
function itensDiretoria(f, origem) {
  const l = [];
  if (origem === 'entrega') l.push(`Condomínio de entrega, sem análise de crédito: ${fmt(num(f.taxa_adm) || 0)}% de taxa administrativa e boleto de R$ ${fmt(num(f.boleto) || 0)}.`);
  const p = pctExtra(f);
  if ((f.garantias || []).includes('Taxa extraordinária') && p != null && p > LIMITE_EXTRA) {
    l.push(`Taxa extra de R$ ${fmt(f.taxa_extra)} por unidade, ${fmt(p)}% da ordinária: acima de ${LIMITE_EXTRA}% exige aditivo com taxa própria.`);
  }
  for (const k of f.pedidos || []) {
    const c = C.porChave.get(k);
    if (c && c.diretoria) l.push(`${c.clausula}: ${c.pedido}${texto((f.pedidos_detalhe || {})[k]) ? ` (${texto(f.pedidos_detalhe[k])})` : ''}.`);
  }
  return l;
}

/* avisos do Manual do Contrato: o que o comercial confirma com o síndico (e o Jurídico vê) */
function avisos(f, { origem, diasAnalise, validadeProposta, semConvencao } = {}) {
  const l = [];
  if (semConvencao) l.push({ nivel: 'atencao', texto: AVISO_CONVENCAO });
  const g = f.garantias || [];
  const p = pctExtra(f);
  if (g.includes('Fundo de obras')) l.push({ nivel: 'atencao', texto: 'Fundo de obras não consta no contrato-modelo: confirme com o Jurídico antes de prometer ao síndico.' });
  if (texto(f.garantia_outra)) l.push({ nivel: 'atencao', texto: `"${texto(f.garantia_outra)}" está fora da lista do contrato: o Jurídico confirma se dá para garantir.` });
  if (g.includes('Taxa extraordinária') && p != null) {
    l.push(p > LIMITE_EXTRA ? { nivel: 'atencao', texto: `Taxa extra de ${fmt(p)}% da ordinária: acima de ${LIMITE_EXTRA}% não é cobertura automática; precisa de análise específica e aditivo (decisão da diretoria).` }
      : { nivel: 'info', texto: `Taxa extra de ${fmt(p)}% da ordinária: dentro dos ${LIMITE_EXTRA}% cobertos pela taxa administrativa normal.` });
  }
  if (g.length) l.push({ nivel: 'info', texto: 'Só é garantido o que está na convenção e no regimento e foi aprovado em assembleia. Multas por descumprimento do regimento e locação de ambientes a quem não é condômino não entram.' });
  if (f.desconto_tipo === 'nenhum') {
    l.push({ nivel: 'info', texto: 'Sem desconto de pontualidade: o contrato pede que o condomínio institua 10% em assembleia em até 30 dias da assinatura; senão, a taxa administrativa sobe 1 ponto. Retirar a sanção, não; adiar para o próximo orçamento, sim (marque em Objeções e Solicitações de modificação de contrato).' });
  }
  if (f.sem_cnpj) l.push({ nivel: 'atencao', texto: 'Sem CNPJ: o condomínio tem 90 dias da primeira arrecadação para regularizar, senão o repasse fica retido. Até lá, o repasse vai para a conta da administradora (formalizado por e-mail), nunca para a conta do síndico.' });
  if (temCashback(f)) l.push({ nivel: 'info', texto: 'Cashback e desconto de pontualidade mudam o texto que vai para assinatura: confira se foram mesmo negociados.' });
  l.push({ nivel: 'info', texto: comFidelizacao(f) ? `Cláusula 12ª na versão com fidelização${UF_FIDELIZACAO.includes(texto(f.uf).toUpperCase()) ? ' (contratos da Paraíba)' : ' (pedida na solicitação)'}: rescindir no período mínimo devolve à MyBlue o que ela adiantou.`
    : 'Cláusula 12ª na versão sem fidelização: rescisão com aviso de 90 dias no período mínimo e 60 dias depois.' });
  if (origem === 'entrega') l.push({ nivel: 'atencao', texto: 'Condomínio de entrega, sem análise de crédito: a diretoria aprova a taxa administrativa e o boleto antes da minuta.' });
  if (diasAnalise != null && validadeProposta && diasAnalise > validadeProposta) {
    l.push({ nivel: 'atencao', texto: `A proposta da análise vale ${validadeProposta} dias e a análise foi liberada há ${diasAnalise}: confira se as condições continuam valendo.` });
  }
  return l;
}


/* o que mudou em relação à análise (taxa, boleto, vencimento, desconto) */
const diferencas = (f, ref) => I.diferencas(f, ref);

/* ---------- condições fechadas (a advogada registra com o contrato assinado) ---------- */
const CAPITAIS = { AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia',
  MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande', MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
  RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas' };
const FORO_PADRAO = 'Fortaleza/CE';
const RESULTADO = { aceito: 'Aceito', parcial: 'Aceito em parte', recusado: 'Recusado' };
const lista = (v) => (Array.isArray(v) ? v.map((x) => texto(x).slice(0, 200)).filter(Boolean) : []);

/* ponto de partida: o que o comercial pediu (e o que a diretoria decidiu) */
function fechadoInicial(c) {
  const f = c.formulario || {};
  const pedidos = f.pedidos || [];
  const uf = texto(f.uf).toUpperCase();
  const negou = !!(c.diretoria && c.diretoria.decidido_em && !c.diretoria.aprovado);
  return {
    taxa_adm: num(f.taxa_adm), boleto: num(f.boleto), desconto_tipo: f.desconto_tipo || 'nenhum', desconto_valor: num(f.desconto_valor),
    desconto_inicio: texto((f.pedidos_detalhe || {}).pontualidade_adiar), garantias: lista(f.garantias), garantia_outra: texto(f.garantia_outra),
    limite_extra: pedidos.includes('taxa_extra_ampliar') && !negou ? num(String((f.pedidos_detalhe || {}).taxa_extra_ampliar || '').replace(/[^\d,.]/g, '').replace(',', '.')) || LIMITE_EXTRA : LIMITE_EXTRA,
    cashback: String(f.cashback || 'nao'), cashback_pct: num(f.cashback_pct), cashback_receitas: lista(f.cashback_receitas),
    // a vigência vem do pedido (a advogada confirma o que foi fechado); o primeiro vencimento é do executivo
    inicio_contrato: texto(f.inicio_contrato), primeiro_vencimento: texto(f.primeiro_vencimento), dia_vencimento: diaDe(f.primeiro_vencimento) || num(f.dia_vencimento),
    periodo_minimo: num(f.periodo_minimo), fidelizacao: comFidelizacao(f),
    honorarios: num(f.honorarios),
    // o foro que o comercial escreveu; sem resposta, a capital do estado do condomínio
    foro: pedidos.includes('foro_capital') ? (texto((f.pedidos_detalhe || {}).foro_capital).slice(0, 120) || (CAPITAIS[uf] ? `${CAPITAIS[uf]}/${uf}` : FORO_PADRAO)) : FORO_PADRAO,
    // o prazo que o cliente pediu (a advogada confirma); sem número, os 30 dias que o Jurídico aceita
    prazo_contestacao: pedidos.includes('contestacao_30') ? Math.round(num(String((f.pedidos_detalhe || {}).contestacao_30 || '').replace(/[^\d]/g, ''))) || 30 : 15,
    clausulas: pedidos.map((k) => C.porChave.get(k)).filter(Boolean).map((x) => ({ chave: x.chave, clausula: x.clausula, pedido: x.pedido,
      resultado: x.diretoria && negou ? 'recusado' : '', redacao: '' })),
    observacoes: '',
  };
}

/* o que a advogada mandou: só os campos conhecidos, com os tipos certos */
function normalizarFechado(b) {
  b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  return {
    taxa_adm: num(b.taxa_adm), boleto: num(b.boleto), desconto_tipo: ['nenhum', 'percentual', 'valor'].includes(b.desconto_tipo) ? b.desconto_tipo : 'nenhum',
    desconto_valor: num(b.desconto_valor), desconto_inicio: texto(b.desconto_inicio).slice(0, 60), garantias: lista(b.garantias), garantia_outra: texto(b.garantia_outra).slice(0, 200),
    limite_extra: num(b.limite_extra), cashback: ['nao', '5', '10', 'outro'].includes(String(b.cashback)) ? String(b.cashback) : '', cashback_pct: num(b.cashback_pct),
    cashback_receitas: lista(b.cashback_receitas), inicio_contrato: texto(b.inicio_contrato).slice(0, 10), primeiro_vencimento: texto(b.primeiro_vencimento).slice(0, 10), dia_vencimento: num(b.dia_vencimento),
    periodo_minimo: num(b.periodo_minimo), fidelizacao: !!b.fidelizacao, honorarios: num(b.honorarios), foro: texto(b.foro).slice(0, 120), prazo_contestacao: num(b.prazo_contestacao),
    clausulas: (Array.isArray(b.clausulas) ? b.clausulas : []).slice(0, 40).map((x) => ({ chave: texto(x && x.chave).slice(0, 60), clausula: texto(x && x.clausula).slice(0, 60),
      pedido: texto(x && x.pedido).slice(0, 300), resultado: RESULTADO[x && x.resultado] ? x.resultado : '', redacao: texto(x && x.redacao).slice(0, 2000) }))
      .filter((x) => x.clausula || x.pedido || x.redacao),
    observacoes: texto(b.observacoes).slice(0, 4000),
  };
}

/* o que o executivo informa no pedido e a advogada não altera: vale sempre o do pedido */
const DO_EXECUTIVO = ['garantias', 'garantia_outra', 'cashback', 'cashback_pct', 'cashback_receitas', 'primeiro_vencimento', 'dia_vencimento'];
function comPedido(c, x) {
  const base = fechadoInicial(c);
  return { ...x, ...Object.fromEntries(DO_EXECUTIVO.map((k) => [k, base[k]])) };
}

/* o que falta para registrar as condições fechadas e concluir (garantias, cashback e vencimento vêm do pedido) */
function faltasFechado(x) {
  const l = [];
  const exige = (cond, msg) => { if (!cond) l.push(msg); };
  exige(num(x.taxa_adm) > 0, 'Informar a taxa administrativa fechada.');
  exige(num(x.boleto) > 0, 'Informar o valor do boleto fechado.');
  if (['percentual', 'valor'].includes(x.desconto_tipo)) exige(num(x.desconto_valor) > 0, 'Informar o desconto de pontualidade fechado.');
  if ((x.garantias || []).includes('Taxa extraordinária')) exige(num(x.limite_extra) > 0, 'Informar até quantos % da ordinária a taxa extra é coberta.');
  exige(dataOk(x.inicio_contrato), 'Informar a vigência (início do contrato).');
  exige(num(x.honorarios) > 0, 'Informar os honorários de cobrança extrajudicial.');
  exige(texto(x.foro), 'Informar o foro.');
  exige(num(x.prazo_contestacao) > 0, 'Informar o prazo para contestar a prestação de contas (dias).');
  (x.clausulas || []).forEach((c) => exige(c.resultado, `Dizer como ficou: ${c.clausula} ${c.pedido}`.trim() + '.'));
  return l;
}

/* o que a negociação mudou entre o pedido do comercial e o contrato assinado */
function diferencasFechado(f, x) {
  if (!x || !x.taxa_adm) return [];
  const l = [];
  const desc = (t, v) => (['percentual', 'valor'].includes(t) ? (t === 'percentual' ? `${fmt(v)}%` : `R$ ${fmt(v)}`) : 'não possui');
  const cb = (o) => (o.cashback === 'outro' ? `${fmt(o.cashback_pct)}%` : o.cashback === 'nao' || !o.cashback ? 'não' : `${o.cashback}%`);
  const g = (o) => [...(o.garantias || []), texto(o.garantia_outra)].filter(Boolean).sort().join(', ');
  const par = (rotulo, a, b) => { if (String(a) !== String(b)) l.push({ rotulo, pedido: a, fechado: b }); };
  par('Taxa administrativa', `${fmt(num(f.taxa_adm) || 0)}%`, `${fmt(num(x.taxa_adm) || 0)}%`);
  par('Boleto', `R$ ${fmt(num(f.boleto) || 0)}`, `R$ ${fmt(num(x.boleto) || 0)}`);
  par('Desconto de pontualidade', desc(f.desconto_tipo, num(f.desconto_valor)), desc(x.desconto_tipo, num(x.desconto_valor)));
  par('Vigência (início do contrato)', dataBr(f.inicio_contrato), dataBr(x.inicio_contrato));
  par('Garantias', g(f), g(x));
  par('Cashback', cb(f), cb(x));
  par('Fidelização', comFidelizacao(f) ? 'com' : 'sem', x.fidelizacao ? 'com' : 'sem');
  return l;
}

/* condições fechadas em texto, campo a campo (para comparar a correção com o que estava registrado) */
function resumoFechado(x) {
  x = x || {};
  const desc = ['percentual', 'valor'].includes(x.desconto_tipo) ? (x.desconto_tipo === 'percentual' ? `${fmt(num(x.desconto_valor) || 0)}%` : `R$ ${fmt(num(x.desconto_valor) || 0)}`) : 'não possui';
  return {
    'Taxa administrativa': `${fmt(num(x.taxa_adm) || 0)}%`, Boleto: `R$ ${fmt(num(x.boleto) || 0)}`,
    'Desconto de pontualidade': desc + (texto(x.desconto_inicio) ? ` a partir de ${texto(x.desconto_inicio)}` : ''),
    Garantias: [...(x.garantias || []), texto(x.garantia_outra)].filter(Boolean).sort().join(', '),
    'Taxa extra coberta': num(x.limite_extra) ? `até ${fmt(num(x.limite_extra))}%` : '',
    Cashback: x.cashback === 'outro' ? `${fmt(num(x.cashback_pct) || 0)}%` : !x.cashback || x.cashback === 'nao' ? 'não' : `${x.cashback}%`,
    'Cashback incide sobre': [...(x.cashback_receitas || [])].sort().join(', '),
    'Vigência (início do contrato)': dataBr(x.inicio_contrato), 'Primeiro vencimento': dataBr(x.primeiro_vencimento),
    'Dia de vencimento': num(x.dia_vencimento) ? String(num(x.dia_vencimento)) : '',
    'Período mínimo': num(x.periodo_minimo) ? `${num(x.periodo_minimo)} meses` : 'padrão', Fidelização: x.fidelizacao ? 'com' : 'sem',
    'Honorários de cobrança extrajudicial': num(x.honorarios) ? `${fmt(num(x.honorarios))}%` : '',
    Foro: texto(x.foro), 'Prazo de contestação': num(x.prazo_contestacao) ? `${num(x.prazo_contestacao)} dias` : '',
    ...Object.fromEntries((x.clausulas || []).map((k) => [`${k.clausula} ${k.pedido}`.trim(), `${RESULTADO[k.resultado] || '—'}${texto(k.redacao) ? `: ${texto(k.redacao)}` : ''}`])),
    'Observações': texto(x.observacoes),
  };
}
function mudancasFechado(antes, depois) {
  const a = resumoFechado(antes), b = resumoFechado(depois);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] || '') !== (b[k] || '')).map((k) => ({ rotulo: k, antes: a[k] || '—', depois: b[k] || '—' }));
}

/* o formulário da implantação diferente do contrato fechado (o setor confere antes de seguir) */
function implantacaoDiferente(fi, x) {
  if (!x || !x.taxa_adm) return [];
  fi = fi || {};
  const l = [];
  const n = (v) => (num(v) == null ? null : Math.round(num(v) * 10000) / 10000);
  const par = (rotulo, a, b, f = (v) => v) => { if (a != null && a !== '' && String(a) !== String(b)) l.push({ rotulo, implantacao: f(a), contrato: f(b) }); };
  par('Taxa administrativa', n(fi.taxa_adm), n(x.taxa_adm), (v) => (v == null ? '—' : `${fmt(v)}%`));
  par('Boleto', n(fi.boleto), n(x.boleto), (v) => (v == null ? '—' : `R$ ${fmt(v)}`));
  const desc = (t, v) => (['percentual', 'valor'].includes(t) ? (t === 'percentual' ? `${fmt(num(v) || 0)}%` : `R$ ${fmt(num(v) || 0)}`) : 'não possui');
  if (fi.desconto_tipo) par('Desconto de pontualidade', desc(fi.desconto_tipo, fi.desconto_valor), desc(x.desconto_tipo, x.desconto_valor));
  par('Vigência (início do contrato)', texto(fi.inicio_contrato), texto(x.inicio_contrato), dataBr);
  if (x.honorarios) par('Honorários de cobrança extrajudicial', n(fi.honorarios), n(x.honorarios), (v) => (v == null ? '—' : `${fmt(v)}%`));
  return l;
}

/* campos da implantação que vêm das condições fechadas: travados lá (vale o do contrato) */
const CAMPOS_FECHADOS = ['taxa_adm', 'boleto', 'desconto_tipo', 'desconto_valor', 'garantias', 'garantia_outra', 'cashback', 'cashback_pct', 'cashback_receitas',
  'inicio_contrato', 'primeiro_vencimento', 'dia_vencimento', 'honorarios'];
// vêm do contrato, mas o comercial ajusta na implantação: o que será garantido e o primeiro vencimento (o síndico às vezes muda)
const CAMPOS_FECHADOS_IMPLANTACAO = CAMPOS_FECHADOS.filter((k) => !['garantias', 'garantia_outra', 'primeiro_vencimento', 'dia_vencimento'].includes(k));

/* dados do contrato que seguem para o formulário de Implantação (o fechado vale sobre o pedido) */
function paraImplantacao(c) {
  const fechado = c.fechado_em && c.fechado && c.fechado.taxa_adm ? c.fechado : null;
  const f = { ...(c.formulario || {}), ...(fechado ? Object.fromEntries(CAMPOS_FECHADOS.map((k) => [k, fechado[k]])) : {}) };
  const v = (x) => x !== undefined && x !== null && x !== '';
  const out = {};
  for (const k of ['nome', 'cnpj', 'uf', 'cidade', 'administradora', 'sindico_nome', 'sindico_cpf', 'sindico_email', 'sindico_telefone', 'taxa_adm', 'boleto',
    'taxa_ordinaria', 'desconto_tipo', 'desconto_valor', 'cashback', 'cashback_pct', 'inicio_contrato', 'primeiro_vencimento', 'dia_vencimento', 'honorarios']) if (v(f[k])) out[k] = f[k];
  if (f.sem_cnpj) out.sem_cnpj = true;
  const garantias = f.garantias || [];
  out.garantias = garantias.filter((x) => I.GARANTIAS.includes(x));
  const outras = [...garantias.filter((x) => !I.GARANTIAS.includes(x)), texto(f.garantia_outra)].filter(Boolean);
  if (outras.length) out.garantia_outra = outras.join(', ');
  if (temCashback(f)) out.cashback_receitas = (f.cashback_receitas || []).filter((x) => RECEITAS_CASHBACK.includes(x));
  const notas = [texto(f.minucias) ? `Outras solicitações: ${texto(f.minucias)}` : '', fechado && texto(fechado.observacoes) ? `Condições fechadas: ${texto(fechado.observacoes)}` : ''].filter(Boolean);
  if (notas.length) out.observacoes = `Contrato ${c.protocolo || ''}. ${notas.join(' ')}`.slice(0, 4000);
  return out;
}
/* documentos do contrato → tipo na Implantação (o que não tem tipo próprio lá entra como "outro") */
const DOC_IMPLANTACAO = { analise_credito: 'analise_credito', convencao: 'convencao', ata_eleicao: 'ata_eleicao', atas_taxas: 'ata_orcamento', cadastro_proprietarios: 'cadastro_moradores',
  documento_sindico: 'documento_sindico', comprovante_endereco: 'comprovante_endereco', contrato_assinado: 'contrato',
  regimento: 'outro', cadastro_locatarios: 'outro', ata_ago: 'outro', procuracao: 'outro' };

/* ---------- PDF da solicitação (o gerador é o do Formulário de Implantação) ---------- */
const pct = (v) => (num(v) == null ? '' : `${fmt(num(v))}%`);
const reais = (v) => (num(v) == null ? '' : num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '');
const comAnalise = (valor, ref, f) => (ref == null || num(ref) === num(valor) ? f(valor) : `${f(valor)} (análise: ${f(ref)})`);
const DESCONTO = { nenhum: 'Não possui', percentual: 'Percentual', valor: 'Valor por unidade' };
const CASHBACK = { nao: 'Não', 5: 'Sim, 5%', 10: 'Sim, 10%' };
const ETAPA = { rascunho: 'rascunho', fila: 'na fila do Jurídico', em_elaboracao: 'em elaboração', pendencia: 'pendência com o comercial', minuta_enviada: 'minuta com o comercial',
  conferencia: 'aguardando as condições fechadas', assinado: 'assinado', cancelada: 'cancelada' };

function montarPdf(c, { executivo, responsavel, documentos = [], usuario, origemTexto }) {
  const f = c.formulario || {};
  const ref = c.origem === 'entrega' ? {} : c.referencia || {};
  const d = c.diretoria || {};
  const det = f.pedidos_detalhe || {};
  const secoes = [
    { numero: 1, titulo: 'Condomínio e síndico', campos: [['Condomínio', f.nome], ['CNPJ', f.sem_cnpj ? 'Ainda não tem (síndico ciente dos 90 dias)' : f.cnpj], ['Estado', f.uf], ['Cidade', f.cidade],
      ['Administradora', f.administradora], ['Síndico', f.sindico_nome], ['CPF do síndico', f.sindico_cpf], ['E-mail', f.sindico_email], ['Telefone', f.sindico_telefone]] },
    { numero: 2, titulo: 'Condições negociadas', campos: [['Taxa administrativa', comAnalise(f.taxa_adm, ref.taxa_adm, pct)], ['Valor do boleto', comAnalise(f.boleto, ref.boleto, reais)],
      ['Desconto de pontualidade', DESCONTO[f.desconto_tipo || 'nenhum'] + (['percentual', 'valor'].includes(f.desconto_tipo) ? ` ${f.desconto_tipo === 'percentual' ? pct(f.desconto_valor) : reais(f.desconto_valor)}` : '')],
      ['O que iremos garantir', [...(f.garantias || []), f.garantia_outra].filter(Boolean).join(', ')],
      ['Taxa ordinária', reais(f.taxa_ordinaria)], ['Taxa extra (por unidade)', reais(f.taxa_extra)],
      ['Cashback', f.cashback === 'outro' ? `Sim, ${pct(f.cashback_pct)}` : CASHBACK[f.cashback] || ''],
      ...(temCashback(f) ? [['Incide sobre', [...(f.cashback_receitas || []), f.cashback_receita_outra].filter(Boolean).join(', ')]] : [])] },
    { numero: 3, titulo: 'Vigência', campos: [['Primeiro vencimento', dataBr(f.primeiro_vencimento) + (f.dia_vencimento ? ` (boletos no dia ${f.dia_vencimento})` : '')],
      ['Período mínimo', f.periodo_minimo ? `${f.periodo_minimo} meses` : 'padrão do contrato'], ['Cláusula 12ª', comFidelizacao(f) ? 'com fidelização' : 'sem fidelização']] },
    { numero: 4, titulo: 'Objeções e solicitações de modificação de contrato', campos: (f.pedidos || []).length ? [] : [['Alteração de cláusulas', 'Nenhuma pedida']],
      tabela: (f.pedidos || []).length ? { cab: ['Cláusula', 'Pedido'], larguras: [0.22, 0.78],
        linhas: f.pedidos.map((k) => C.porChave.get(k)).filter(Boolean).map((x) => [x.clausula, x.pedido + (texto(det[x.chave]) ? ` — ${texto(det[x.chave])}` : '') + (x.diretoria ? ' (diretoria)' : '')]) } : null },
    { numero: 5, titulo: 'Outras solicitações', texto_titulo: 'Outras solicitações', texto: f.minucias || '—' },
  ];
  if ((d.itens || []).length) {
    secoes.push({ titulo: 'Diretoria', campos: [['Situação', d.decidido_em ? (d.aprovado ? 'Aprovado' : 'Não aprovado') : 'Aguardando'], ['Por', d.por || ''], ['Em', quando(d.decidido_em)], ['Observação', d.observacao || '']],
      texto_titulo: 'Itens', texto: d.itens.map((x) => `• ${x}`).join('\n') });
  }
  if (c.fechado_em && c.fechado && c.fechado.taxa_adm) {
    const x = c.fechado;
    secoes.push({ titulo: 'Condições fechadas no contrato assinado', campos: [['Taxa administrativa', pct(x.taxa_adm)], ['Boleto', reais(x.boleto)],
      ['Desconto de pontualidade', DESCONTO[x.desconto_tipo || 'nenhum'] + (['percentual', 'valor'].includes(x.desconto_tipo) ? ` ${x.desconto_tipo === 'percentual' ? pct(x.desconto_valor) : reais(x.desconto_valor)}` : '') + (x.desconto_inicio ? ` · a partir de ${x.desconto_inicio}` : '')],
      ['Garantias', [...(x.garantias || []), x.garantia_outra].filter(Boolean).join(', ')], ['Taxa extra coberta', x.limite_extra ? `até ${fmt(x.limite_extra)}% da ordinária` : ''],
      ['Cashback', x.cashback === 'outro' ? `Sim, ${pct(x.cashback_pct)}` : CASHBACK[x.cashback] || ''], ['Vigência (início)', dataBr(x.inicio_contrato)], ['Primeiro vencimento', dataBr(x.primeiro_vencimento) + (x.dia_vencimento ? ` (dia ${x.dia_vencimento})` : '')],
      ['Período mínimo', x.periodo_minimo ? `${x.periodo_minimo} meses` : 'padrão'], ['Fidelização', x.fidelizacao ? 'com' : 'sem'], ['Foro', x.foro], ['Contestação', x.prazo_contestacao ? `${x.prazo_contestacao} dias` : '']],
      tabela: (x.clausulas || []).length ? { titulo: 'Cláusulas negociadas', cab: ['Cláusula', 'Pedido', 'Resultado', 'Redação'], larguras: [0.15, 0.3, 0.13, 0.42],
        linhas: x.clausulas.map((k) => [k.clausula, k.pedido, RESULTADO[k.resultado] || '', k.redacao]) } : null,
      texto_titulo: x.observacoes ? 'Observações da advogada' : '', texto: x.observacoes || '' });
  }
  const vig = documentos.filter((x) => !x.substituido_em);
  const linhas = [];
  const cores = [];
  for (const [tipo, doc] of Object.entries(DOCUMENTOS)) {
    const atuais = vig.filter((x) => x.tipo === tipo);
    if (!atuais.length && !doc.assinatura) continue;
    cores.push([linhas.length, 1, atuais.length ? '#2B7A55' : '#B3261E']);
    linhas.push([doc.nome, atuais.length ? (tipo === 'analise_credito' ? 'vinculada' : 'entregue') : 'falta', atuais.map((x) => `${x.nome} · ${quando(x.enviado_em)}`).join('; ') || 'necessária para assinar']);
  }
  secoes.push({ numero: 6, titulo: 'Documentos', tabela: { titulo: 'Os documentos do síndico são pedidos na Implantação', cab: ['Documento', 'Situação', 'Arquivo · enviado em'], larguras: [0.42, 0.13, 0.45], linhas, cores } });
  if (c.responsavel_id || c.minuta_enviada_em) {
    secoes.push({ titulo: 'Andamento no Jurídico', campos: [['Responsável', responsavel], ['Assumida em', quando(c.assumido_em)], ['Prazo (72h úteis)', quando(c.prazo)],
      ['Minuta enviada em', quando(c.minuta_enviada_em)], ['Ajustes pedidos', String(c.ajustes || 0)], ['Assinado em', quando(c.assinado_em)], ['Condições registradas em', quando(c.fechado_em)]] });
  }
  return {
    cabecalho: 'SOLICITAÇÃO DE CONTRATO', titulo_pdf: `Solicitação de Contrato ${c.protocolo || ''}`,
    nota_final: 'Documento gerado pelo portal MyBlue com os dados da solicitação de contrato na data de emissão.',
    protocolo: c.protocolo || '',
    emitido: `Emitido em ${quando(new Date())}${usuario ? ` por ${usuario}` : ''}`,
    condominio: f.nome || c.condominio || 'Solicitação de contrato',
    subtitulo: [`Origem: ${origemTexto}`, executivo, f.uf, `Etapa: ${ETAPA[c.etapa]}`].filter(Boolean).join(' · '),
    rotulo_diferencas: 'Diferente da análise',
    diferencas: diferencas(f, c.origem === 'entrega' ? null : c.referencia).map((x) => {
      const m = (v) => (typeof v === 'number' ? (/R\$/.test(x.rotulo) ? reais(v) : /%/.test(x.rotulo) ? pct(v) : v) : v);
      return `${x.rotulo.replace(/ \((%|R\$)\)$/, '')} ${m(x.valor)} (análise: ${m(x.analise)})`;
    }),
    secoes,
  };
}

module.exports = { CAMPOS_FECHADOS_IMPLANTACAO, DOCUMENTOS, GARANTIAS, RECEITAS_CASHBACK, LIMITE_EXTRA, DOC_IMPLANTACAO, RESULTADO, CAPITAIS, FORO_PADRAO, daAnalise, doPdf, faltas, faltasCampos, itensDiretoria, avisos,
  AVISO_CONVENCAO, AVISO_CONVENCAO_JURIDICO, diferencas, fechadoInicial, normalizarFechado, comPedido, completarPedido, faltasFechado, diferencasFechado, mudancasFechado, implantacaoDiferente, paraImplantacao, comFidelizacao, montarPdf, cpfValido: I.cpfValido, cnpjOk: I.cnpjOk };
