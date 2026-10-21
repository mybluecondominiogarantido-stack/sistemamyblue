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
 *   vigência    inicio_contrato (AAAA-MM-DD, primeira arrecadação garantida), dia_vencimento, periodo_minimo (meses),
 *               fidelizacao (true = pedir a versão com fidelização fora da Paraíba)
 *   pedidos     pedidos [chave de server/contratos/clausulas.js], pedidos_detalhe { chave: texto }
 *   minúcias    minucias (toda e qualquer tratativa diferente da habitual: só aqui)
 */
const I = require('../implantacoes/formulario');
const C = require('./clausulas');

const DOCUMENTOS = {
  analise_credito: { nome: 'Análise de Crédito' },
  convencao: { nome: 'Convenção do condomínio', operacional: true },
  regimento: { nome: 'Regimento interno', operacional: true },
  ata_eleicao: { nome: 'Ata de eleição do síndico', operacional: true },
  atas_taxas: { nome: 'Atas que estipularam as taxas (ordinárias e extras)', operacional: true },
  cadastro_proprietarios: { nome: 'Cadastro dos proprietários (nome, CPF, unidade e endereço)', operacional: true },
  cadastro_locatarios: { nome: 'Cadastro dos locatários (nome, CPF e unidade)', operacional: true },
  documento_sindico: { nome: 'RG e CPF do síndico', operacional: true },
  comprovante_endereco: { nome: 'Comprovante de endereço do síndico', operacional: true },
  ata_ago: { nome: 'Ata da assembleia que autorizou a contratação (sem CNPJ)' },
  minuta: { nome: 'Minuta do contrato', juridico: true },
  contrato_assinado: { nome: 'Contrato assinado' },
  procuracao: { nome: 'Procuração assinada' },
  outro: { nome: 'Outro documento' },
};
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

/* o que falta para enviar ao Jurídico (bloqueia o envio) */
function faltas(f, { docs = new Set(), executivoId } = {}) {
  const l = [];
  const exige = (cond, msg) => { if (!cond) l.push(msg); };
  exige(texto(f.nome), 'Informar o nome do condomínio.');
  if (f.sem_cnpj) {
    exige(f.sem_cnpj_ciente, 'Marcar que o síndico está ciente dos 90 dias para regularizar o CNPJ.');
    exige(texto(f.administradora), 'Informar a administradora (sem CNPJ, o repasse vai para a conta dela).');
    exige(docs.has('ata_ago'), `Anexar: ${DOCUMENTOS.ata_ago.nome}.`);
  } else exige(I.cnpjOk(f.cnpj), 'Informar um CNPJ válido (sem CNPJ: marque "O condomínio ainda não tem CNPJ").');
  exige(/^[A-Z]{2}$/.test(texto(f.uf)), 'Informar o estado do condomínio.');
  exige(texto(f.sindico_nome), 'Informar o nome do síndico.');
  exige(I.cpfValido(f.sindico_cpf), 'Informar um CPF do síndico válido.');
  exige(emailOk(f.sindico_email), 'Informar o e-mail do síndico ou do condomínio.');
  exige(digitos(f.sindico_telefone).length >= 10, 'Informar o telefone do síndico (com DDD).');
  exige(num(f.taxa_adm) > 0, 'Informar a taxa administrativa negociada.');
  exige(num(f.boleto) > 0, 'Informar o valor do boleto negociado.');
  exige(['nenhum', 'percentual', 'valor'].includes(f.desconto_tipo), 'Dizer se tem desconto de pontualidade.');
  if (['percentual', 'valor'].includes(f.desconto_tipo)) exige(num(f.desconto_valor) > 0, 'Informar o valor ou o % do desconto de pontualidade.');
  exige((f.garantias || []).length || texto(f.garantia_outra), 'Marcar o que iremos garantir.');
  if ((f.garantias || []).includes('Taxa extraordinária')) exige(num(f.taxa_ordinaria) > 0, 'Informar a taxa ordinária (para conferir o limite da taxa extra).');
  exige(['nao', '5', '10', 'outro'].includes(String(f.cashback || '')), 'Dizer se foi concedido cashback.');
  if (f.cashback === 'outro') exige(num(f.cashback_pct) > 0, 'Informar o percentual do cashback.');
  if (temCashback(f)) exige((f.cashback_receitas || []).length || texto(f.cashback_receita_outra), 'Marcar sobre quais receitas incide o cashback.');
  exige(/^\d{4}-\d{2}-\d{2}$/.test(texto(f.inicio_contrato)), 'Informar a data de início do contrato (primeira arrecadação garantida).');
  exige(num(f.dia_vencimento) >= 1 && num(f.dia_vencimento) <= 31, 'Informar o dia de vencimento da taxa condominial (1 a 31).');
  for (const k of f.pedidos || []) if (!C.porChave.has(k)) l.push('Pedido de alteração desconhecido: desmarque e marque de novo.');
  exige(texto(f.minucias), 'Informar as minúcias da negociação (se não houver nada diferente do habitual, escreva "Nenhuma").');
  exige(executivoId, 'Escolher o executivo de negócios.');
  return l;
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
function avisos(f, { origem, diasAnalise, validadeProposta } = {}) {
  const l = [];
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
    l.push({ nivel: 'info', texto: 'Sem desconto de pontualidade: o contrato pede que o condomínio institua 10% em assembleia em até 30 dias da assinatura; senão, a taxa administrativa sobe 1 ponto. Retirar a sanção, não; adiar para o próximo orçamento, sim (marque em Pedidos do síndico).' });
  }
  if (f.sem_cnpj) l.push({ nivel: 'atencao', texto: 'Sem CNPJ: o condomínio tem 90 dias da primeira arrecadação para regularizar, senão o repasse fica retido. Até lá, o repasse vai para a conta da administradora (formalizado por e-mail), nunca para a conta do síndico.' });
  if (temCashback(f)) l.push({ nivel: 'info', texto: 'Cashback e desconto de pontualidade mudam o texto que vai para assinatura: confira se foram mesmo negociados.' });
  l.push({ nivel: 'info', texto: comFidelizacao(f) ? `Cláusula 12ª na versão com fidelização${UF_FIDELIZACAO.includes(texto(f.uf).toUpperCase()) ? ' (contratos da Paraíba)' : ' (pedida na solicitação)'}: rescindir no período mínimo devolve à MyBlue o que ela adiantou.`
    : 'Cláusula 12ª na versão sem fidelização: rescisão com aviso de 90 dias no período mínimo e 60 dias depois.' });
  l.push({ nivel: 'info', texto: 'Procuração: o síndico assina junto com o contrato; na troca de síndico, atualizar em até 15 dias.' });
  if (origem === 'entrega') l.push({ nivel: 'atencao', texto: 'Condomínio de entrega, sem análise de crédito: a diretoria aprova a taxa administrativa e o boleto antes da minuta.' });
  if (diasAnalise != null && validadeProposta && diasAnalise > validadeProposta) {
    l.push({ nivel: 'atencao', texto: `A proposta da análise vale ${validadeProposta} dias e a análise foi liberada há ${diasAnalise}: confira se as condições continuam valendo.` });
  }
  return l;
}

/* documentos que o comercial busca com o síndico: não travam o contrato, mas travam a operação depois */
const pendencias = (docs = new Set()) => Object.keys(DOCUMENTOS).filter((t) => DOCUMENTOS[t].operacional && !docs.has(t)).map((t) => DOCUMENTOS[t].nome);

/* o que mudou em relação à análise (taxa, boleto, vencimento, desconto) */
const diferencas = (f, ref) => I.diferencas(f, ref);

/* dados do contrato que seguem para o formulário de Implantação */
function paraImplantacao(c) {
  const f = c.formulario || {};
  const v = (x) => x !== undefined && x !== null && x !== '';
  const out = {};
  for (const k of ['nome', 'cnpj', 'uf', 'cidade', 'administradora', 'sindico_nome', 'sindico_cpf', 'sindico_email', 'sindico_telefone', 'taxa_adm', 'boleto',
    'taxa_ordinaria', 'desconto_tipo', 'desconto_valor', 'cashback', 'cashback_pct', 'inicio_contrato', 'dia_vencimento']) if (v(f[k])) out[k] = f[k];
  if (f.sem_cnpj) out.sem_cnpj = true;
  const garantias = f.garantias || [];
  out.garantias = garantias.filter((x) => I.GARANTIAS.includes(x));
  const outras = [...garantias.filter((x) => !I.GARANTIAS.includes(x)), texto(f.garantia_outra)].filter(Boolean);
  if (outras.length) out.garantia_outra = outras.join(', ');
  if (temCashback(f)) out.cashback_receitas = (f.cashback_receitas || []).filter((x) => RECEITAS_CASHBACK.includes(x));
  if (texto(f.minucias)) out.observacoes = `Contrato ${c.protocolo || ''}: ${texto(f.minucias)}`.slice(0, 4000);
  return out;
}
/* documentos do contrato → tipo na Implantação (o que não tem tipo próprio lá entra como "outro") */
const DOC_IMPLANTACAO = { convencao: 'convencao', ata_eleicao: 'ata_eleicao', atas_taxas: 'ata_orcamento', cadastro_proprietarios: 'cadastro_moradores',
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
  assinado: 'contrato assinado', cancelada: 'cancelada' };

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
    { numero: 3, titulo: 'Vigência', campos: [['Início (1ª arrecadação garantida)', dataBr(f.inicio_contrato)], ['Vencimento da taxa', f.dia_vencimento ? `dia ${f.dia_vencimento}` : ''],
      ['Período mínimo', f.periodo_minimo ? `${f.periodo_minimo} meses` : 'padrão do contrato'], ['Cláusula 12ª', comFidelizacao(f) ? 'com fidelização' : 'sem fidelização']] },
    { numero: 4, titulo: 'Pedidos do síndico', campos: (f.pedidos || []).length ? [] : [['Alteração de cláusulas', 'Nenhuma pedida']],
      tabela: (f.pedidos || []).length ? { cab: ['Cláusula', 'Pedido', 'Resposta padrão do Jurídico'], larguras: [0.17, 0.38, 0.45],
        linhas: f.pedidos.map((k) => C.porChave.get(k)).filter(Boolean).map((x) => [x.clausula, x.pedido + (texto(det[x.chave]) ? ` — ${texto(det[x.chave])}` : ''), x.resposta + (x.diretoria ? ' (diretoria)' : '')]) } : null },
    { numero: 5, titulo: 'Minúcias da negociação', texto_titulo: 'Toda e qualquer tratativa diferente da habitual', texto: f.minucias || '—' },
  ];
  if ((d.itens || []).length) {
    secoes.push({ titulo: 'Diretoria', campos: [['Situação', d.decidido_em ? (d.aprovado ? 'Aprovado' : 'Não aprovado') : 'Aguardando'], ['Por', d.por || ''], ['Em', quando(d.decidido_em)], ['Observação', d.observacao || '']],
      texto_titulo: 'Itens', texto: d.itens.map((x) => `• ${x}`).join('\n') });
  }
  const vig = documentos.filter((x) => !x.substituido_em);
  const linhas = [];
  const cores = [];
  for (const [tipo, doc] of Object.entries(DOCUMENTOS)) {
    const atuais = vig.filter((x) => x.tipo === tipo);
    if (!atuais.length && !doc.operacional) continue;
    cores.push([linhas.length, 1, atuais.length ? '#2B7A55' : '#9A5B05']);
    linhas.push([doc.nome, atuais.length ? 'entregue' : 'pendente', atuais.map((x) => `${x.nome} · ${quando(x.enviado_em)}`).join('; ') || 'trava a operação depois']);
  }
  secoes.push({ numero: 6, titulo: 'Documentos', tabela: { titulo: 'Os documentos do síndico não travam o contrato, mas travam a cobrança, os boletos e o repasse depois', cab: ['Documento', 'Situação', 'Arquivo · enviado em'], larguras: [0.42, 0.13, 0.45], linhas, cores } });
  if (c.responsavel_id || c.minuta_enviada_em) {
    secoes.push({ titulo: 'Andamento no Jurídico', campos: [['Responsável', responsavel], ['Assumida em', quando(c.assumido_em)], ['Prazo (72h úteis)', quando(c.prazo)],
      ['Minuta enviada em', quando(c.minuta_enviada_em)], ['Ajustes pedidos', String(c.ajustes || 0)], ['Assinado em', quando(c.assinado_em)]] });
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

module.exports = { DOCUMENTOS, GARANTIAS, RECEITAS_CASHBACK, LIMITE_EXTRA, DOC_IMPLANTACAO, daAnalise, doPdf, faltas, itensDiretoria, avisos, pendencias, diferencas,
  paraImplantacao, comFidelizacao, montarPdf, cpfValido: I.cpfValido, cnpjOk: I.cnpjOk };
