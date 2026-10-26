'use strict';
/*
 * Ficha de repasse da implantação: o que o portal já sabe do condomínio (formulário, análise, contrato, etapas,
 * documentos e Carteira) mais os campos em azul, que só a assistente de implantação sabe (dados).
 *
 * montar() devolve o mesmo conteúdo para a tela e para o PDF (formulario_pdf.py): seções com pares rótulo/valor e
 * tabelas. Valor em azul é { v, k } (k: o caminho em dados), com op (lista suspensa) ou area (texto longo);
 * uma tabela com "add" ganha "+ Adicionar" na tela. A versão enviada guarda o conteúdo como ficou (não muda depois).
 */
const F = require('./formulario');
const { fmt, ISENCAO, SINDICO, DESCONTO } = require('./formulario-pdf');

const { reais, pct, dataBr, quando, simNao } = fmt;
const texto = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const lista = (v, max = 30) => (Array.isArray(v) ? v.slice(0, max) : []);

const SIM_NAO = ['Sim', 'Não'];
const FIXA = ['Fixa', 'Variável'];
const FORMA_FUNDO = ['Percentual sobre a taxa ordinária', 'Valor fixo por unidade', 'Percentual sobre outra base (descrever)'];
const COBRANCA_FUNDO = ['Unificada', 'Separado'];
const TIPO_RECEITA = ['Reserva de área comum', 'Outra receita'];
const POR_QUE = ['Espólio', 'Consta no contrato', 'Outro'];
const CONFERIDO = ['Conferida', 'Pendente', 'Não se aplica'];
const CASHBACK = ['Juros', 'Multa', 'Honorários', 'Taxa administrativa', 'Tarifa bancária', 'Desconto de pontualidade', 'Correção monetária'];
const CONSUMOS = ['Água', 'Gás', 'Energia elétrica'];
const GARANTIAS_CONTRATO = ['Taxa ordinária', 'Taxa extraordinária', 'Água', 'Gás', 'Fundo de reserva', 'Fundo de obras', 'Locação de ambientes a condôminos'];
const LIMITE_VERSOES = 3;

const escolha = (v, ops) => (ops.includes(v) ? v : '');

/* campos em azul: só os conhecidos, com tamanho limitado */
function normalizarDados(b) {
  b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const consumo = lista(b.consumo, 3);
  const fundo = b.fundo && typeof b.fundo === 'object' ? b.fundo : {};
  const conf = b.conferidos && typeof b.conferidos === 'object' ? b.conferidos : {};
  return {
    subsindico: texto(b.subsindico, 160), subsindico_telefone: texto(b.subsindico_telefone, 60), prestacao_contas: texto(b.prestacao_contas, 300),
    taxa_condominial: escolha(b.taxa_condominial, FIXA), validade_boleto: texto(b.validade_boleto, 60),
    unidades_construtora: escolha(b.unidades_construtora, SIM_NAO), envio_construtora: texto(b.envio_construtora, 120),
    balancete: escolha(b.balancete, SIM_NAO), balancete_por: texto(b.balancete_por, 160),
    consumo: CONSUMOS.map((nome, k) => {
      const c = consumo[k] && typeof consumo[k] === 'object' ? consumo[k] : {};
      return { incide: escolha(c.incide, SIM_NAO), tipo: escolha(c.tipo, FIXA), valor: texto(c.valor, 80), obs: texto(c.obs, 300) };
    }),
    taxa_extra_obs: texto(b.taxa_extra_obs, 500),
    fundo: { forma: escolha(fundo.forma, FORMA_FUNDO), percentual: texto(fundo.percentual, 30), valor: texto(fundo.valor, 60), base: texto(fundo.base, 160),
      cobranca: escolha(fundo.cobranca, COBRANCA_FUNDO) },
    receitas: lista(b.receitas, 20).map((x) => ({ tipo: escolha(x && x.tipo, TIPO_RECEITA), descricao: texto(x && x.descricao, 160), valor: texto(x && x.valor, 60),
      consideracoes: texto(x && x.consideracoes, 300) })).filter((x) => x.tipo || x.descricao || x.valor || x.consideracoes),
    nao_garantidos_obs: texto(b.nao_garantidos_obs, 800),
    nao_garantidas: lista(b.nao_garantidas, 60).map((x) => ({ unidade: texto(x && x.unidade, 40), o_que: texto(x && x.o_que, 200), por_que: escolha(x && x.por_que, POR_QUE),
      obs: texto(x && x.obs, 300) })).filter((x) => x.unidade || x.o_que || x.por_que || x.obs),
    repasse_obs: texto(b.repasse_obs, 800),
    conferidos: { ata_taxa_extra: escolha(conf.ata_taxa_extra, CONFERIDO), ata_taxa_extra_obs: texto(conf.ata_taxa_extra_obs, 200),
      ata_receita: escolha(conf.ata_receita, CONFERIDO), ata_receita_obs: texto(conf.ata_receita_obs, 200) },
    cashback_incide: lista(b.cashback_incide, 10).filter((x) => CASHBACK.includes(x)),
    particularidades: texto(b.particularidades, 4000), outras_observacoes: texto(b.outras_observacoes, 4000),
  };
}

/* o que vem preenchido quando a ficha abre */
function dadosIniciais(i, { analise = null, contrato = null } = {}) {
  const f = i.formulario || {};
  const ag = (analise && analise.agua_gas) || {};
  const garantias = (contrato && contrato.garantias) || f.garantias || [];
  const receitas = (contrato && contrato.cashback_receitas) || f.cashback_receitas || [];
  return normalizarDados({
    prestacao_contas: f.sindico_email || '', taxa_condominial: 'Fixa', unidades_construtora: f.entrega ? 'Sim' : 'Não',
    consumo: [{ incide: garantias.includes('Água') || ag.compoe_boleto ? 'Sim' : 'Não' }, { incide: garantias.includes('Gás') ? 'Sim' : 'Não' }, { incide: 'Não' }],
    cashback_incide: receitas.filter((x) => CASHBACK.includes(x)),
    outras_observacoes: (i.obs_controle && i.obs_controle.texto) || '',
  });
}

const az = (v, k, extra = {}) => ({ v: v == null ? '' : String(v), k, ...extra });
const traco = (v) => (v === null || v === undefined || v === '' ? '—' : v);

/* parcela do próximo vencimento de uma taxa extra (início e fim AAAA-MM) */
function parcela(x, primeiroVenc) {
  const m = (s) => { const r = /^(\d{4})-(\d{2})/.exec(String(s || '')); return r ? Number(r[1]) * 12 + Number(r[2]) - 1 : null; };
  const ini = m(x.inicio), fim = m(x.fim), ref = m(primeiroVenc);
  if (ini === null || fim === null || ref === null || fim < ini) return '';
  if (ref > fim) return 'encerrada';
  return `P. ${Math.max(1, ref - ini + 1)}/${fim - ini + 1}`;
}

/*
 * ctx: { analise (formulário da análise), contrato ({ fechado, protocolo, fechado_em }), documentos, executivo, responsavel,
 *        destino (nome da assistente de crédito), emitido_por, quando (Date) }
 */
function montar(i, dadosBrutos, ctx = {}) {
  const d = normalizarDados(dadosBrutos);
  const f = i.formulario || {};
  const e = F.normalizarEtapas(i.etapas);
  const an = ctx.analise || {};
  const ct = ctx.contrato && ctx.contrato.fechado ? ctx.contrato.fechado : null;
  const garantias = ct ? [...(ct.garantias || []), ct.garantia_outra].filter(Boolean) : [...(f.garantias || []), f.garantia_outra].filter(Boolean);
  const taxaAdm = ct && ct.taxa_adm ? ct.taxa_adm : f.taxa_adm;
  const boleto = ct && ct.boleto ? ct.boleto : f.boleto;
  const descTipo = ct ? ct.desconto_tipo : f.desconto_tipo;
  const descValor = ct ? ct.desconto_valor : f.desconto_valor;
  const primeiroVenc = e.boletos.primeiro_vencimento || (ct && ct.primeiro_vencimento) || f.primeiro_vencimento || '';
  const honor = ct && ct.honorarios ? ct.honorarios : f.honorarios;
  const isentos = (an.outros_isentos || []).filter((x) => x && x.cargo).map((x) => `${x.cargo}${x.percentual && Number(x.percentual) !== 100 ? ` (${x.percentual}%)` : ''}`);
  const extras = (f.taxas_extras || []).filter((x) => x && (x.descricao || x.valor_por_uh));
  const naoGarantidas = GARANTIAS_CONTRATO.filter((g) => !garantias.includes(g));
  // exceção negociada no contrato sobre o repasse (cláusula aceita que fala de repasse)
  const excecao = ct ? (ct.clausulas || []).filter((c) => /repasse/i.test(`${c.pedido} ${c.redacao}`) && ['aceito', 'parcial'].includes(c.resultado))
    .map((c) => c.redacao || c.pedido).join('; ') : '';
  const cbPct = ct ? (ct.cashback === 'outro' ? ct.cashback_pct : ['5', '10'].includes(ct.cashback) ? Number(ct.cashback) : null)
    : f.cashback === 'outro' ? f.cashback_pct : ['5', '10'].includes(String(f.cashback)) ? Number(f.cashback) : null;

  const secoes = [];
  secoes.push({ numero: 1, titulo: 'Informações gerais', origem: 'do formulário de implantação', campos: [
    ['Nome do condomínio', f.nome || i.condominio], ['CNPJ', f.sem_cnpj ? 'Ainda não tem' : traco(f.cnpj)], ['Cidade / estado', [f.cidade, f.uf].filter(Boolean).join(' / ')],
    ['Total de unidades', traco(f.uh_total)], ['Síndico', traco(f.sindico_nome)], ['Tipo de síndico', traco(SINDICO[f.sindico_tipo])],
    ['Telefone do síndico', traco(f.sindico_telefone)], ['E-mail do síndico', traco(f.sindico_email)],
    ['Subsíndico', az(d.subsindico, 'subsindico')], ['Telefone do subsíndico', az(d.subsindico_telefone, 'subsindico_telefone')],
    ['Administradora / contador', traco(f.administradora)], ['Telefone', traco([f.consultor_telefone, f.consultor_nome ? `(${f.consultor_nome})` : ''].filter(Boolean).join(' '))],
    ['Condomínio de entrega', f.entrega || i.origem === 'entrega' ? 'Sim' : 'Não'], ['Construtora', traco(f.construtora)],
    ['Executivo de vendas', traco(ctx.executivo)], ['Data do contrato', traco(dataBr(ctx.contrato && ctx.contrato.fechado_em ? new Date(ctx.contrato.fechado_em).toISOString() : f.inicio_contrato))],
    ['Envio da prestação de contas', az(d.prestacao_contas, 'prestacao_contas')],
  ] });
  secoes.push({ numero: 2, titulo: 'Informações financeiras', origem: 'do formulário, da análise e do contrato', campos: [
    ['Dia de vencimento padrão', traco(f.dia_vencimento)], ['1º vencimento', traco(dataBr(primeiroVenc))],
    ['Taxa condominial', az(d.taxa_condominial, 'taxa_condominial', { op: FIXA })], ['Valor da taxa condominial', traco(reais(f.taxa_ordinaria))],
    ['Valor do boleto', traco(reais(boleto))], ['Taxa administrativa', traco(pct(taxaAdm))],
    ['Desconto de pontualidade', (DESCONTO[descTipo || 'nenhum'] || 'Não possui') + (['percentual', 'valor'].includes(descTipo) ? ` ${descTipo === 'percentual' ? pct(descValor) : reais(descValor)}` : '')],
    ['Validade do boleto', az(d.validade_boleto, 'validade_boleto')], ['Honorários extrajudiciais', traco(pct(honor))],
    ['Forma de envio dos boletos', traco(F.ENVIO[e.envio.forma])], ['Síndico isento da taxa', traco(ISENCAO[f.sindico_isencao])],
    ['Outras unidades isentas', isentos.length ? isentos.join(', ') : 'Nenhuma'],
    ['Unidades da construtora', az(d.unidades_construtora, 'unidades_construtora', { op: SIM_NAO })], ['Forma de envio – construtora', az(d.envio_construtora, 'envio_construtora')],
    ['Balancete mensal', az(d.balancete, 'balancete', { op: SIM_NAO })], ['Enviado por', az(d.balancete_por, 'balancete_por')],
  ], texto_titulo: f.observacoes ? 'Outras considerações (do formulário)' : '', texto: f.observacoes || '' });
  secoes.push({ numero: '2.1', titulo: 'Cobrança de consumo', origem: 'da análise de crédito', tabela: {
    cab: ['Cobrança', 'Incide?', 'Fixa ou variável', 'Valor', 'Observações'], larguras: [0.17, 0.12, 0.15, 0.17, 0.39],
    linhas: CONSUMOS.map((nome, k) => [nome, az(d.consumo[k].incide, `consumo.${k}.incide`, { op: SIM_NAO }), az(d.consumo[k].tipo, `consumo.${k}.tipo`, { op: FIXA }),
      az(d.consumo[k].valor, `consumo.${k}.valor`), az(d.consumo[k].obs, `consumo.${k}.obs`)]) } });
  secoes.push({ numero: '2.2', titulo: 'Taxa extra', origem: 'do formulário', campos: [
    ['Taxa extra vigente', extras.length ? 'Sim' : 'Não'], ['Descrição da taxa extra', traco(extras.map((x) => x.descricao).filter(Boolean).join('; '))],
    ['Valor por unidade', traco(extras.map((x) => reais(x.valor_por_uh)).filter(Boolean).join('; '))],
    ['Parcela do próximo vencimento', traco(extras.map((x) => parcela(x, primeiroVenc)).filter(Boolean).join('; '))],
    ['Considerações', az(d.taxa_extra_obs, 'taxa_extra_obs')]] });
  secoes.push({ numero: '2.3', titulo: 'Fundo de reserva', origem: 'da análise e do contrato', campos: [
    ['Possui', garantias.includes('Fundo de reserva') ? 'Sim (garantido)' : an.fundo_reserva_compoe_ordinaria ? 'Sim (na taxa ordinária)' : 'Não informado'],
    ['Forma de cálculo', az(d.fundo.forma, 'fundo.forma', { op: FORMA_FUNDO })], ['Percentual', az(d.fundo.percentual, 'fundo.percentual')],
    ['Valor por unidade', az(d.fundo.valor, 'fundo.valor')], ['Base de cálculo', az(d.fundo.base, 'fundo.base')],
    ['Cobrança no boleto', az(d.fundo.cobranca, 'fundo.cobranca', { op: COBRANCA_FUNDO })]] });
  secoes.push({ numero: '2.4', titulo: 'Reservas e/ou outras receitas', origem: 'a Implantação completa', tabela: {
    cab: ['Tipo', 'Descrição', 'Valor', 'Considerações'], larguras: [0.24, 0.28, 0.14, 0.34], add: 'receitas', vazio: 'Nenhuma reserva ou outra receita informada.',
    novo: { tipo: '', descricao: '', valor: '', consideracoes: '' },
    linhas: d.receitas.map((x, k) => [az(x.tipo, `receitas.${k}.tipo`, { op: TIPO_RECEITA }), az(x.descricao, `receitas.${k}.descricao`), az(x.valor, `receitas.${k}.valor`),
      az(x.consideracoes, `receitas.${k}.consideracoes`)]) } });
  secoes.push({ numero: 3, titulo: 'Não garantidos', origem: 'do contrato e da Implantação', campos: [
    ['Possui não garantidos', naoGarantidas.length || d.nao_garantidas.length ? 'Sim' : 'Não'], ['Taxas não garantidas (do contrato)', naoGarantidas.length ? naoGarantidas.join(', ') : 'Nenhuma'],
    ['Observações', az(d.nao_garantidos_obs, 'nao_garantidos_obs')]],
  tabela: { titulo: 'Unidades não garantidas', cab: ['Unidade', 'O que não é garantido', 'Por quê', 'Observação'], larguras: [0.14, 0.3, 0.22, 0.34], add: 'nao_garantidas',
    vazio: 'Nenhuma unidade não garantida.', novo: { unidade: '', o_que: '', por_que: '', obs: '' },
    linhas: d.nao_garantidas.map((x, k) => [az(x.unidade, `nao_garantidas.${k}.unidade`), az(x.o_que, `nao_garantidas.${k}.o_que`), az(x.por_que, `nao_garantidas.${k}.por_que`, { op: POR_QUE }),
      az(x.obs, `nao_garantidas.${k}.obs`)]) } });
  secoes.push({ numero: 4, titulo: 'Conta bancária e repasse', origem: 'do contrato e do formulário', campos: [
    ['Tipo de conta bancária', f.sem_cnpj ? 'Da administradora (ainda sem CNPJ)' : 'Própria (tem CNPJ)'], ['Data padrão de repasse', 'Um dia após o vencimento (D+1)'],
    ['Exceção negociada', traco(excecao)], ['Antecipação de repasse', simNao(f.antecipacao) || 'Não'],
    ...(f.antecipacao === 'sim' ? [['Permanente ou por período', traco(f.antecipacao_prazo)], ['Valor da antecipação', traco(reais(f.antecipacao_valor))], ['Data da antecipação', traco(dataBr(f.antecipacao_data))]] : []),
    ['Considerações', az(d.repasse_obs, 'repasse_obs')]] });
  // documentos: os anexos da implantação (e o "Marcar recebido"), mais o que a Implantação confere
  const vig = (ctx.documentos || []).filter((x) => !x.substituido_em);
  const docLinhas = [{ grupo: 'Anexados na implantação' }];
  const cores = [];
  const pendentes = [];
  for (const [tipo, doc] of Object.entries(F.DOCUMENTOS)) {
    if (tipo === 'outro' || (tipo === 'analise_credito' && i.origem === 'entrega')) continue;
    const atuais = vig.filter((x) => x.tipo === tipo);
    const sem = atuais.length && atuais.every((x) => x.sem_arquivo);
    cores.push([docLinhas.length - 1, 1, atuais.length ? '#2B7A55' : tipo === 'contrato' ? '#5F7680' : '#B5650A']);
    if (!atuais.length && tipo !== 'contrato') pendentes.push(doc.nome);
    docLinhas.push([doc.nome, atuais.length ? (sem ? '✓ recebido' : '✓ entregue') : tipo === 'contrato' ? 'não anexado' : '! pendente',
      atuais.length ? atuais.map((x) => (x.sem_arquivo ? `sem arquivo: ${x.observacao || ''}` : x.nome) + ` · ${quando(x.enviado_em).slice(0, 5)}`).join('; ')
        : doc.setor ? 'a cargo da Implantação' : tipo === 'contrato' ? '—' : 'alerta ao executivo']);
  }
  cores.push([docLinhas.length - 1, 1, '#2B7A55']);
  docLinhas.push(['Formulário de implantação', '✓ entregue', `${i.protocolo || ''} · enviado em ${quando(i.enviado_em).slice(0, 5)}`]);
  docLinhas.push({ grupo: 'Conferidos pela Implantação' });
  const conf = (rot, k, val, obs) => {
    cores.push([docLinhas.length - 1, 1, val === 'Pendente' ? '#B5650A' : '#2B7A55']);
    docLinhas.push([rot, az(val, `conferidos.${k}`, { op: CONFERIDO }), az(obs, `conferidos.${k}_obs`)]);
  };
  conf('Ata de taxa extra', 'ata_taxa_extra', d.conferidos.ata_taxa_extra, d.conferidos.ata_taxa_extra_obs);
  conf('Ata de receita garantida', 'ata_receita', d.conferidos.ata_receita, d.conferidos.ata_receita_obs);
  const onbFeito = F.onboardingFeito(e);
  cores.push([docLinhas.length - 1, 1, onbFeito ? '#2B7A55' : '#B5650A']);
  docLinhas.push(['Onboarding', onbFeito ? `✓ ${F.ONBOARDING[e.onboarding.situacao].toLowerCase()}` : '! pendente',
    [dataBr(e.onboarding.data) || e.onboarding.data, e.onboarding.hora].filter(Boolean).join(' às ') || (i.onboarding_justificativa ? `justificado: ${i.onboarding_justificativa.texto}` : '—')]);
  secoes.push({ numero: 5, titulo: 'Documentos', origem: 'dos anexos da implantação', tabela: { cab: ['Documento', 'Situação', 'Arquivo · enviado em'], larguras: [0.4, 0.15, 0.45], linhas: docLinhas, cores } });
  secoes.push({ numero: 6, titulo: 'Cashback', origem: 'do formulário; a Implantação confere', campos: [
    ['Contrato com cashback', cbPct ? 'Sim' : 'Não'], ['Percentual do cashback', cbPct ? `${String(cbPct).replace('.', ',')}%` : '—']],
  multi: cbPct ? { k: 'cashback_incide', titulo: 'Incide sobre', op: CASHBACK, v: d.cashback_incide } : null,
  tabela: cbPct ? { titulo: 'Incide sobre (marcado pela Implantação)', cab: CASHBACK, larguras: CASHBACK.map(() => 1 / CASHBACK.length),
    linhas: [CASHBACK.map((x) => (d.cashback_incide.includes(x) ? { v: '✓ sim' } : '—'))] } : null });
  secoes.push({ numero: 7, titulo: 'Particularidades', origem: 'o que aconteceu no mês da implantação', texto: az(d.particularidades, 'particularidades', { area: true }) });
  secoes.push({ numero: 8, titulo: 'Outras observações', origem: 'o que a assistente de crédito precisa saber', texto_titulo: 'Da assistente de implantação',
    texto: az(d.outras_observacoes, 'outras_observacoes', { area: true }) });

  const atencao = [];
  if (excecao) atencao.push(`exceção no repasse: ${excecao}`);
  if (f.antecipacao === 'sim') atencao.push(`antecipação de ${reais(f.antecipacao_valor)}${f.antecipacao_data ? ` em ${dataBr(f.antecipacao_data)}` : ''}`);
  if (pendentes.length) atencao.push(`documento pendente: ${pendentes.join(', ')}`);
  if (!onbFeito) atencao.push('onboarding ainda não feito');
  const cidade = [f.cidade, f.uf].filter(Boolean).join('/');
  return {
    cabecalho: 'FICHA DE REPASSE DE IMPLANTAÇÃO',
    protocolo: i.protocolo || '',
    emitido: `Emitida em ${quando(ctx.quando || new Date())}${ctx.emitido_por ? ` por ${ctx.emitido_por}` : ''}`,
    titulo_pdf: `Ficha de repasse ${i.protocolo || ''} ${f.nome || i.condominio || ''}`.trim(),
    condominio: f.nome || i.condominio || 'Condomínio',
    subtitulo: [cidade, f.uh_total ? `${f.uh_total} unidades` : '', e.vouch.id ? `ID Vouch ${e.vouch.id}` : '', ctx.responsavel ? `Assistente de implantação: ${ctx.responsavel}` : '',
      ctx.destino ? `Assistente de crédito: ${ctx.destino}` : ''].filter(Boolean).join(' · '),
    rotulo_diferencas: 'Atenção para o repasse',
    diferencas: atencao,
    legenda: 'Em preto: o que o portal já tem (formulário, análise de crédito, contrato, etapas e documentos). <font color="#1D5FC2"><b>Em azul: preenchido pela assistente de implantação.</b></font>',
    nota_final: 'Ficha gerada pelo portal MyBlue. Cada envio ao Crédito é uma versão; este PDF é a cópia guardada no CPD.',
    secoes,
  };
}

/* para o PDF: tabela vazia ganha a linha "nenhuma", texto em branco vira "—" */
function paraPdf(c) {
  return { ...c, secoes: c.secoes.map((s) => {
    const x = { ...s };
    delete x.multi;
    if (x.tabela && !x.tabela.linhas.length) x.tabela = { ...x.tabela, linhas: [[x.tabela.vazio || '—', ...x.tabela.cab.slice(1).map(() => '')]] };
    if (x.texto && typeof x.texto === 'object' && !x.texto.v) x.texto = { v: '—' };
    return x;
  }) };
}

/* o que falta para enviar (campos em azul que precisam de resposta) */
function faltas(d) {
  d = normalizarDados(d);
  const l = [];
  if (!d.taxa_condominial) l.push('Taxa condominial: fixa ou variável.');
  d.consumo.forEach((c, k) => { if (!c.incide) l.push(`Cobrança de consumo (${CONSUMOS[k]}): incide ou não.`); else if (c.incide === 'Sim' && !c.tipo) l.push(`Cobrança de consumo (${CONSUMOS[k]}): fixa ou variável.`); });
  if (!d.balancete) l.push('Balancete mensal: sim ou não.');
  if (!d.conferidos.ata_taxa_extra) l.push('Ata de taxa extra: conferida, pendente ou não se aplica.');
  if (!d.conferidos.ata_receita) l.push('Ata de receita garantida: conferida, pendente ou não se aplica.');
  return l;
}

/* o que mudou entre duas versões (rótulos das seções e campos) */
function diferencas(a, b) {
  if (!a || !b) return [];
  const plano = (c) => {
    const m = new Map();
    for (const s of c.secoes || []) {
      for (const [rot, v] of s.campos || []) m.set(`${s.numero} · ${rot}`, typeof v === 'object' && v ? v.v : v);
      if (s.tabela) m.set(`${s.numero} · ${s.tabela.titulo || s.titulo}`, JSON.stringify((s.tabela.linhas || []).map((l) => (Array.isArray(l) ? l.map((x) => (x && typeof x === 'object' ? x.v : x)) : l))));
      if (s.texto) m.set(`${s.numero} · ${s.titulo}`, typeof s.texto === 'object' ? s.texto.v : s.texto);
    }
    return m;
  };
  const pa = plano(a), pb = plano(b);
  return [...pb.keys()].filter((k) => String(pa.get(k) ?? '') !== String(pb.get(k) ?? ''));
}

module.exports = { montar, paraPdf, normalizarDados, dadosIniciais, faltas, diferencas, LIMITE_VERSOES, CASHBACK };
