'use strict';
/*
 * Roteiros dos vídeos tutoriais. O "nome" é o slug do catálogo do portal (server/tutoriais.js),
 * de onde vêm o título e o público mostrados no cartão de abertura. Cada roteiro tem:
 *   entrar      e-mail de quem aparece usando (sem ele o vídeo começa na tela de login)
 *   inicio      rota aberta antes de começar a gravar
 *   ferramenta  slug da ferramenta real que o vídeo usa (precisa do HTML em FERRAMENTAS)
 *   preparar    ajustes no cenário antes de gravar
 *   abertura    [texto, itens] do cartão de abertura
 *   gravar      o passo a passo, com legendas
 *   resumo      itens do cartão final
 */
const fs = require('fs');
const { cliente } = require('./gravador');

const menu = (href) => `#lateral a[href="${href}"]`;
const fecharModal = '.fundo-modal .modal-pe [data-fechar]';
const FUSO = 'America/Sao_Paulo';
/* dia útil daqui a n dias, no formato dos campos de data (AAAA-MM-DD) */
function diaUtil(n) {
  const d = new Date(Date.now() + n * 864e5);
  while ([0, 6].includes(new Date(d.toLocaleString('en-US', { timeZone: FUSO })).getDay())) d.setTime(d.getTime() + 864e5);
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO });
}
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
/* dia n do mês que vem (AAAA-MM-DD): a vigência (dia 1) e o primeiro vencimento (dia 10) dos exemplos */
function diaDoProximoMes(n) {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + 1, n)).toISOString().slice(0, 10);
}
const dia10 = () => diaDoProximoMes(10);
const dia1 = () => diaDoProximoMes(1);

/* ---------- Análise de Crédito (dados fictícios) ---------- */
const os = require('os');
const path = require('path');
const SENHA_CR = 'Nova12345';
/* sessão que também manda cabeçalhos (os anexos levam o tipo do documento no cabeçalho) */
async function sessaoCr(base, email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email, senha: SENHA_CR }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return async (metodo, url, corpo, cab = {}) => {
    const bruto = Buffer.isBuffer(corpo);
    const x = await fetch(base + url, { method: metodo, headers: { cookie, origin: base, 'content-type': bruto ? 'application/pdf' : 'application/json', ...cab }, body: corpo == null ? undefined : bruto ? corpo : JSON.stringify(corpo) });
    const t = await x.text();
    try { return JSON.parse(t); } catch { return t; }
  };
}
/* PDFs de exemplo para os anexos (vazios, só para o envio) */
function pdfsCr() {
  const pasta = path.join(os.tmpdir(), 'tutoriais-recursos');
  fs.mkdirSync(pasta, { recursive: true });
  const r = {};
  for (const [k, nome] of [['convencao', 'Convencao_Residencial_Exemplo.pdf'], ['relatorio', 'Contas_a_receber_exemplo.pdf']]) {
    r[k] = path.join(pasta, nome);
    fs.writeFileSync(r[k], '%PDF-1.4\n% arquivo de exemplo dos tutoriais\n%%EOF\n');
  }
  return r;
}
/* os 3 meses fechados antes do mês de hoje (mm/aaaa) */
function mesesCr() {
  const h = new Date();
  return [3, 2, 1].map((k) => { const d = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - k, 1)); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; });
}
function planilhaCr() {
  const l = ['Unidade;Titular;Documento;Competência;Tipo;Valor'];
  mesesCr().forEach((c, i) => {
    for (const [u, n, doc] of [['A-101', 'Condômino Fictício 1', '111.111.111-11'], ['B-203', 'Condômino Fictício 2', '222.222.222-22']]) l.push(`${u};${n};${doc};${c};Taxa ordinária;1.840,00`, `${u};${n};${doc};${c};Taxa extra;700,00`, `${u};${n};${doc};${c};Multa;36,80`);
    l.push(`C-305;Condômino Fictício 3;;${c};Taxa ordinária;${['1.840,00', '2.540,00', '1.840,00'][i]}`, `D-402;Condômino Fictício 4;;${c};Taxa ordinária;${['1.200,00', '500,00', '1.500,00'][i]}`);
  });
  return l.join('\n');
}
const FORM_CR = {
  razao_social: 'Condomínio Residencial Jardim das Acácias', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova', administradora: 'Administradora Exemplo',
  sistema_gestao: 'Superlógica', uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'nenhum' }, agua_gas: { compoe_boleto: false },
  taxas_extras: [{ descricao: 'Reforma da fachada', valor_por_uh: 700, inicio: '2026-01', fim: '2026-12', ata: true }], sindico: { tipo: 'condomino', isencao: 'integral' }, uh_isentas_informadas: 1,
};
/* análise pedida pela executiva (Vera) e enviada; com "liberar", o analista (Tiago) faz tudo e libera o retorno */
async function analiseCr(base, form, { liberar = false } = {}) {
  const vera = await sessaoCr(base, 'vera@myblue.com.br');
  const pdf = Buffer.from('%PDF-1.4\n% exemplo\n%%EOF\n');
  const { id } = await vera('POST', '/api/credito/analises', { formulario: form });
  for (const tipo of ['convencao', 'relatorio']) await vera('POST', `/api/credito/analises/${id}/documentos`, pdf, { 'x-tipo': tipo, 'x-nome-arquivo': tipo + '.pdf' });
  await vera('POST', `/api/credito/analises/${id}/enviar`, {});
  if (liberar) {
    const tiago = await sessaoCr(base, 'tiago@myblue.com.br');
    await tiago('POST', `/api/credito/analises/${id}/assumir`, {});
    const lido = await tiago('POST', `/api/credito/analises/${id}/relatorio-colado`, { texto: planilhaCr() });
    await tiago('PATCH', `/api/credito/analises/${id}`, { dados_analista: { convencao: { registro: 'RI', uh: form.uh_total }, relatorio: { data_emissao: hoje(), unidades: lido.unidades } } });
    await tiago('POST', `/api/credito/analises/${id}/liberar`, {});
  }
  return id;
}

/* ---------- Implantação (dados fictícios) ---------- */
const FORM_IMP = {
  nome: 'Condomínio Residencial Jardim das Acácias', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', uh_total: 24, dia_vencimento: 10, taxa_ordinaria: 1840,
  sindico_tipo: 'condomino', sindico_isencao: 'integral', sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35', sindico_email: 'sindico@exemplo.com',
  sindico_telefone: '(85) 90000-0000', taxa_adm: 3, boleto: 2, desconto_tipo: 'nenhum', inicio_contrato: diaUtil(10), honorarios: 12, garantias: ['Taxa ordinária'],
  parceria: 'nao', cashback: 'nao', antecipacao: 'nao', administradora: 'Administradora Exemplo', consultor_nome: 'Consultor Fictício', consultor_telefone: '(85) 90000-0001',
};
/* implantação aberta pela executiva (Vera) a partir de um contrato concluído e enviada ao setor; com "responsavel", já designada e iniciada */
async function implantacaoTut(base, nome, { responsavel, etapas, extra, concluir } = {}) {
  const ct = await contratoTut(base, nome, { ate: 'concluido' });
  const vera = await sessaoCr(base, 'vera@myblue.com.br');
  const { implantacao: id } = await vera('POST', `/api/contratos/${ct}/implantacao`, {});
  const d = await vera('GET', `/api/implantacoes/${id}`);
  await vera('PATCH', `/api/implantacoes/${id}`, { formulario: { ...FORM_IMP, ...d.implantacao.formulario, nome, ...(extra || {}) } });
  const pdf = Buffer.from('%PDF-1.4\n% exemplo\n%%EOF\n');
  const cadastro = Buffer.from(['Unidade;Nome;CPF', ...Array.from({ length: 24 }, (_, k) => `${101 + k};Morador Fictício ${k + 1};111.444.777-35`)].join('\n'));
  await vera('POST', `/api/implantacoes/${id}/documentos`, cadastro, { 'x-tipo': 'cadastro_moradores', 'x-nome-arquivo': 'cadastro.csv', 'content-type': 'text/csv' });
  for (const tipo of ['ata_eleicao', 'ata_orcamento']) await vera('POST', `/api/implantacoes/${id}/documentos`, pdf, { 'x-tipo': tipo, 'x-nome-arquivo': tipo + '.pdf' });
  await vera('POST', `/api/implantacoes/${id}/enviar`, {});
  if (responsavel) {
    const nina = await sessaoCr(base, 'nina@myblue.com.br');
    const quem = (await nina('GET', '/api/implantacoes/meta')).equipe.find((x) => x.nome === responsavel);
    await nina('POST', `/api/implantacoes/${id}/designar`, { usuario_id: quem.id });
    const conduz = await sessaoCr(base, quem.nome === 'Nina Prado' ? 'nina@myblue.com.br' : 'otto@myblue.com.br');
    await conduz('POST', `/api/implantacoes/${id}/iniciar`, {});
    if (etapas) await conduz('PATCH', `/api/implantacoes/${id}/etapas`, { etapas });
    if (concluir) await conduz('POST', `/api/implantacoes/${id}/concluir`, {});
  }
  return id;
}
/* retorno de análise de crédito em PDF, de uma análise feita antes do portal (o modelo de 4 páginas, com dados fictícios) */
async function retornoTut(protocolo, nome) {
  const R = require('../../../server/credito/retorno');
  const { analisar } = require('../../../server/credito/motor');
  const formulario = { ...FORM_CR, razao_social: nome, executivo: { nome: 'Vera Campos', uf: 'CE' } };
  const meses = [3, 2, 1].map((k) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); });
  const r = analisar({ formulario, convencao: { presente: true, registro: 'RI', uh: FORM_CR.uh_total }, relatorio: { presente: true, data_emissao: hoje(), tem_competencia: true, tem_nomes: true,
    unidades: [{ unidade: '101', titular: 'Titular Fictício', lancamentos: meses.map((c) => ({ competencia: c, vencimento: `${c}-10`, tipo: 'ordinaria', valor: FORM_CR.taxa_ordinaria })) }] } }, undefined, { hoje: hoje() });
  return (await R.gerarPdf(R.montarDados(r, { formulario, protocolo, analista: 'Analista Fictício', emissao: hoje() }))).pdf;
}
/* contrato assinado fora do portal: a executiva (Vera) anexa o contrato e o retorno, preenche e envia; fica com o Jurídico */
async function implantacaoForaTut(base, nome, protocolo) {
  const vera = await sessaoCr(base, 'vera@myblue.com.br');
  const r = await vera('POST', '/api/implantacoes/pdf?acao=criar', await retornoTut(protocolo, nome), { 'content-type': 'application/pdf', 'x-nome-arquivo': 'Retorno_analise_exemplo.pdf' });
  if (r.erro) throw new Error(`implantação fora do portal: ${r.erro}`);
  const pdf = Buffer.from('%PDF-1.4\n% exemplo\n%%EOF\n');
  for (const tipo of ['contrato', 'convencao', 'cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) await vera('POST', `/api/implantacoes/${r.id}/documentos`, pdf, { 'x-tipo': tipo, 'x-nome-arquivo': tipo + '.pdf' });
  const d = await vera('GET', `/api/implantacoes/${r.id}`);
  await vera('PATCH', `/api/implantacoes/${r.id}`, { formulario: { ...d.implantacao.formulario, ...FORM_IMP, nome, taxa_adm: null, boleto: null, inicio_contrato: '', honorarios: null } });
  const e = await vera('POST', `/api/implantacoes/${r.id}/enviar`, {});
  if (e.erro) throw new Error(`enviar ao Jurídico: ${e.erro} ${JSON.stringify(e.faltas || '')}`);
  return r.id;
}
function pdfsImp() {
  const pasta = path.join(os.tmpdir(), 'tutoriais-recursos');
  fs.mkdirSync(pasta, { recursive: true });
  const r = {};
  for (const [k, nome] of [['cadastro_moradores', 'Cadastro_moradores_exemplo.csv'], ['ata_eleicao', 'Ata_eleicao_exemplo.pdf'], ['ata_orcamento', 'Ata_orcamento_exemplo.pdf']]) {
    r[k] = path.join(pasta, nome);
    fs.writeFileSync(r[k], k === 'cadastro_moradores' ? 'Unidade;Nome;CPF\n101;Morador Fictício 1;111.444.777-35\n102;Morador Fictício 2;111.444.777-35\n' : '%PDF-1.4\n% arquivo de exemplo dos tutoriais\n%%EOF\n');
  }
  return r;
}

/* ---------- Solicitação de Contrato (dados fictícios) ---------- */
const FORM_CT = {
  nome: 'Condomínio Residencial Jardim das Acácias', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', administradora: 'Administradora Exemplo',
  sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35', sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3, boleto: 2, desconto_tipo: 'nenhum', garantias: ['Taxa ordinária', 'Taxa extraordinária'], taxa_ordinaria: 1840, taxa_extra: 700, cashback: 'nao',
  inicio_contrato: dia1(), primeiro_vencimento: dia10(), pedidos: ['contestacao_30', 'foro_capital'], pedidos_detalhe: { contestacao_30: '30', foro_capital: 'Fortaleza/CE' },
  minucias: 'Primeiro repasse adiantado em 5 dias.',
};
/* solicitação pedida pela executiva (Vera) e enviada ao Jurídico; "ate" leva até a minuta enviada, até o contrato assinado
   ou até o contrato concluído (a advogada registrou as condições) */
async function contratoTut(base, nome, { ate } = {}) {
  const aid = await analiseCr(base, { ...FORM_CR, razao_social: nome }, { liberar: true });
  const vera = await sessaoCr(base, 'vera@myblue.com.br');
  const { id } = await vera('POST', '/api/contratos', { origem: 'analise', analise_id: aid });
  await vera('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM_CT, nome } });
  await vera('POST', `/api/contratos/${id}/enviar`, {});
  if (!ate) return id;
  const lara = await sessaoCr(base, 'lara@myblue.com.br');
  const pdf = Buffer.from('%PDF-1.4\n% exemplo\n%%EOF\n');
  await lara('POST', `/api/contratos/${id}/assumir`, {});
  await lara('POST', `/api/contratos/${id}/documentos`, pdf, { 'x-tipo': 'minuta', 'x-nome-arquivo': 'Minuta_exemplo.pdf' });
  await lara('POST', `/api/contratos/${id}/minuta`, {});
  if (ate === 'minuta') return id;
  await vera('POST', `/api/contratos/${id}/pedir-assinatura`, {});
  if (ate === 'para_assinar') return id;
  await lara('POST', `/api/contratos/${id}/em-assinatura`, { plataforma: 'Clicksign' });
  if (ate === 'assinado' || ate === 'concluido') {
    await lara('POST', `/api/contratos/${id}/documentos`, pdf, { 'x-tipo': 'contrato_assinado', 'x-nome-arquivo': 'Contrato_assinado_exemplo.pdf' });
    await lara('POST', `/api/contratos/${id}/assinado`, {});
  }
  if (ate === 'concluido') {
    const d = await lara('GET', `/api/contratos/${id}`);
    const r = await lara('PUT', `/api/contratos/${id}/fechado`, { condicoes: { ...d.contrato.fechado, honorarios: 12,
      clausulas: (d.contrato.fechado.clausulas || []).map((c) => ({ ...c, resultado: 'aceito' })) }, concluir: true });
    if (r.erro) throw new Error(`concluir o contrato: ${r.erro} ${JSON.stringify(r.faltas || '')}`);
  }
  return id;
}

/* ---------- Demandas Jurídicas (dados fictícios) ---------- */
/* dia útil de n dias corridos atrás (AAAA-MM-DD) e n dias depois de um dia */
function diasAtras(n) {
  const d = new Date(Date.now() - n * 864e5);
  while ([0, 6].includes(new Date(d.toLocaleString('en-US', { timeZone: FUSO })).getDay())) d.setTime(d.getTime() - 864e5);
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO });
}
const depoisDe = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/* a Tabela de prazos e as demandas de três meses (a advogada lança pelos colegas) */
async function demandasTut(base) {
  const lara = await sessaoCr(base, 'lara@myblue.com.br');
  let { tipos } = await lara('PUT', '/api/juridico/tipos', { tipos: [{ nome: 'Contrato (garantia)', horas: 8 }, { nome: 'Aditivo', horas: 16 }, { nome: 'Rescisão', horas: 24 },
    { nome: 'Análise de contrato de fornecedor', horas: 24 }, { nome: 'Contrato (parcerias)', horas: 16 }, { nome: 'Parecer', horas: 24 }] });
  ({ tipos } = await lara('PUT', '/api/juridico/tipos', { tipos: tipos.map((t) => ({ id: t.id, nome: t.nome, horas: t.horas })), contratos_id: tipos[0].id }));
  const T = (n) => tipos.find((t) => t.nome === n).id;
  const { pessoas } = await lara('GET', '/api/juridico/meta');
  const P = (n) => pessoas.find((x) => x.nome === n).id;
  const nova = async (b) => { const r = await lara('POST', '/api/juridico/demandas', b); if (r.erro) throw new Error('demanda: ' + r.erro); return r.id; };
  // entregues nos últimos três meses (duas fora do prazo), para os indicadores
  const hist = [['Aditivo', 'Vera Campos', 'Residencial Jardim das Acácias', 80, 1], ['Rescisão', 'Sara Alves', 'Condomínio Solar do Bosque', 75, 2],
    ['Análise de contrato de fornecedor', 'Rafa Nunes', 'Elevadores Exemplo Ltda.', 70, 5], ['Contrato (parcerias)', 'Vera Campos', 'Administradora Exemplo', 62, 1],
    ['Aditivo', 'Tiago Moura', 'Edifício Mirante do Sol', 55, 2], ['Parecer', 'Nina Prado', 'Residencial Vila das Palmeiras', 48, 3],
    ['Rescisão', 'Sara Alves', 'Condomínio Recanto Verde', 40, 6], ['Aditivo', 'Vera Campos', 'Condomínio Parque das Águas', 33, 1],
    ['Contrato (parcerias)', 'Bruna Reis', 'Administradora Modelo', 26, 2], ['Análise de contrato de fornecedor', 'Rafa Nunes', 'Limpeza Exemplo Ltda.', 19, 3],
    ['Parecer', 'Tiago Moura', 'Residencial Jardim das Acácias', 12, 2]];
  for (const [tipo, quem, cliente, atras, dias] of hist) {
    const sol = diasAtras(atras);
    await nova({ tipo_id: T(tipo), solicitante_id: P(quem), cliente, solicitada_em: sol, entregue_em: depoisDe(sol, dias), status: 'concluido', responsavel_id: P('Lara Mendes') });
  }
  const ids = {};
  ids.atrasada = await nova({ tipo_id: T('Rescisão'), solicitante_id: P('Nina Prado'), cliente: 'Condomínio Parque das Águas', objeto: 'Distrato do contrato de manutenção dos portões',
    solicitada_em: diasAtras(9), status: 'em_andamento' });
  ids.retornoVera = await nova({ tipo_id: T('Aditivo'), solicitante_id: P('Vera Campos'), cliente: 'Residencial Jardim das Acácias', objeto: 'Aditivo para a taxa extra da reforma da fachada',
    solicitada_em: diasAtras(6), entregue_em: diasAtras(5), status: 'aguardando_retorno', responsavel_id: P('Lara Mendes'), observacoes: 'Falta a ata da assembleia que aprovou a obra.' });
  await nova({ tipo_id: T('Contrato (parcerias)'), solicitante_id: P('Sara Alves'), cliente: 'Administradora Exemplo', objeto: 'Contrato de parceria para indicação de condomínios',
    solicitada_em: diasAtras(3), entregue_em: diasAtras(2), status: 'aguardando_assinaturas', responsavel_id: P('Lara Mendes') });
  await nova({ tipo_id: T('Análise de contrato de fornecedor'), solicitante_id: P('Rafa Nunes'), cliente: 'Segurança Exemplo Ltda.', objeto: 'Contrato de vigilância: conferir multa e reajuste' });
  return ids;
}

/* ---------- Da Análise de Crédito à Implantação (um condomínio fictício do começo ao fim) ---------- */
/* troca quem está no portal sem passar pela tela de login (o cartão do capítulo cobre a troca) */
async function trocarPessoa(t, email) {
  const r = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: t.base }, body: JSON.stringify({ email, senha: SENHA_CR }) });
  const par = (r.headers.get('set-cookie') || '').split(';')[0];
  const k = par.indexOf('=');
  await t.ctx.clearCookies();
  await t.ctx.addCookies([{ name: par.slice(0, k), value: par.slice(k + 1), url: t.base }]);
}
/* cartão entre os capítulos: o que acontece; faz por trás o que o vídeo não mostra (antes), troca de pessoa (email)
   e abre a tela já pronta */
async function cartaoJor(t, chapeu, titulo, { email, rota, antes } = {}) {
  await t.semLegenda();
  await t.tut('cartao', chapeu, titulo, '', null);
  const ini = Date.now();
  if (antes) await antes();
  await t.pausa(Math.max(400, 3000 - (Date.now() - ini)));
  if (email) await trocarPessoa(t, email);
  // o endereço muda só no "#": recarrega para o portal abrir com a pessoa nova (e com o que mudou por trás)
  await t.ir(rota, 200);
  await t.p.reload();
  await t.pausa(1600);
  await t.tut('cartao', '', '');
  await t.pausa(400);
}
const NOME_JOR = 'Condomínio Residencial Jardim das Acácias';
/* cada passo da jornada feito pela API (o que o vídeo não mostra); para se o portal recusar */
async function passosJor(base) {
  const [vera, tiago, lara, nina, otto] = await Promise.all(['vera', 'tiago', 'lara', 'nina', 'otto'].map((n) => sessaoCr(base, n + '@myblue.com.br')));
  const pdf = Buffer.from('%PDF-1.4\n% exemplo\n%%EOF\n');
  const ok = async (passo, p) => { const r = await p; if (r && r.erro) throw new Error(`${passo}: ${r.erro} ${JSON.stringify(r.faltas || '')}`); return r; };
  const j = {};
  return {
    j, vera, tiago, lara, nina, otto,
    async analisePronta() {
      j.analise = (await ok('análise', vera('POST', '/api/credito/analises', { formulario: { ...FORM_CR, razao_social: NOME_JOR } }))).id;
      for (const tipo of ['convencao', 'relatorio']) await ok('anexo da análise', vera('POST', `/api/credito/analises/${j.analise}/documentos`, pdf, { 'x-tipo': tipo, 'x-nome-arquivo': tipo + '.pdf' }));
    },
    enviarAnalise: () => ok('enviar análise', vera('POST', `/api/credito/analises/${j.analise}/enviar`, {})),
    async analistaLanca() {
      await ok('assumir análise', tiago('POST', `/api/credito/analises/${j.analise}/assumir`, {}));
      await this.lancarAnalise();
    },
    async lancarAnalise() {
      const lido = await ok('relatório', tiago('POST', `/api/credito/analises/${j.analise}/relatorio-colado`, { texto: planilhaCr() }));
      await ok('dados do analista', tiago('PATCH', `/api/credito/analises/${j.analise}`, { dados_analista: { convencao: { registro: 'RI', uh: FORM_CR.uh_total }, relatorio: { data_emissao: hoje(), unidades: lido.unidades } } }));
    },
    liberar: () => ok('liberar', tiago('POST', `/api/credito/analises/${j.analise}/liberar`, {})),
    async pedirContrato() {
      j.contrato = (await ok('contrato', vera('POST', '/api/contratos', { origem: 'analise', analise_id: j.analise }))).id;
      await ok('formulário do contrato', vera('PATCH', `/api/contratos/${j.contrato}`, { formulario: { ...FORM_CT, nome: NOME_JOR, garantias: ['Taxa ordinária'], pedidos: [], minucias: 'Nenhuma' } }));
      await ok('enviar contrato', vera('POST', `/api/contratos/${j.contrato}/enviar`, {}));
    },
    async contratoId() { j.contrato = (await vera('GET', '/api/contratos?vis=minhas')).contratos.find((x) => x.condominio === NOME_JOR).id; return j.contrato; },
    assumirContrato: () => ok('assumir contrato', lara('POST', `/api/contratos/${j.contrato}/assumir`, {})),
    anexarMinuta: () => ok('minuta', lara('POST', `/api/contratos/${j.contrato}/documentos`, pdf, { 'x-tipo': 'minuta', 'x-nome-arquivo': 'Minuta_exemplo.pdf' })),
    enviarMinuta: () => ok('enviar minuta', lara('POST', `/api/contratos/${j.contrato}/minuta`, {})),
    pedirAssinatura: () => ok('pedir assinatura', vera('POST', `/api/contratos/${j.contrato}/pedir-assinatura`, {})),
    emAssinatura: () => ok('em assinatura', lara('POST', `/api/contratos/${j.contrato}/em-assinatura`, { plataforma: 'Clicksign' })),
    async assinado() {
      await ok('contrato assinado', lara('POST', `/api/contratos/${j.contrato}/documentos`, pdf, { 'x-tipo': 'contrato_assinado', 'x-nome-arquivo': 'Contrato_assinado_exemplo.pdf' }));
      await ok('assinado', lara('POST', `/api/contratos/${j.contrato}/assinado`, {}));
    },
    async concluirContrato() {
      const d = await lara('GET', `/api/contratos/${j.contrato}`);
      await ok('concluir contrato', lara('PUT', `/api/contratos/${j.contrato}/fechado`, { condicoes: { ...d.contrato.fechado, honorarios: 12 }, concluir: true }));
    },
    async solicitarImplantacao() { j.implantacao = (await ok('solicitar implantação', vera('POST', `/api/contratos/${j.contrato}/implantacao`, {}))).implantacao; },
    async implantacaoId() { j.implantacao = (await vera('GET', `/api/contratos/${j.contrato}`)).implantacao.id; return j.implantacao; },
    async completarImplantacao() {
      const d = await vera('GET', `/api/implantacoes/${j.implantacao}`);
      await ok('formulário da implantação', vera('PATCH', `/api/implantacoes/${j.implantacao}`, { formulario: { ...d.implantacao.formulario, honorarios: 12, parceria: 'nao', antecipacao: 'nao', consultor_nome: 'Consultor Fictício', consultor_telefone: '(85) 90000-0001' } }));
      const cadastro = Buffer.from(['Unidade;Nome;CPF', ...Array.from({ length: 24 }, (_, k) => `${101 + k};Morador Fictício ${k + 1};111.444.777-35`)].join('\n'));
      await ok('cadastro', vera('POST', `/api/implantacoes/${j.implantacao}/documentos`, cadastro, { 'x-tipo': 'cadastro_moradores', 'x-nome-arquivo': 'cadastro.csv', 'content-type': 'text/csv' }));
      for (const tipo of ['ata_eleicao', 'ata_orcamento']) await ok('ata', vera('POST', `/api/implantacoes/${j.implantacao}/documentos`, pdf, { 'x-tipo': tipo, 'x-nome-arquivo': tipo + '.pdf' }));
    },
    enviarImplantacao: () => ok('enviar implantação', vera('POST', `/api/implantacoes/${j.implantacao}/enviar`, {})),
    async designar(nome) {
      const quem = (await nina('GET', '/api/implantacoes/meta')).equipe.find((x) => x.nome === nome);
      await ok('designar', nina('POST', `/api/implantacoes/${j.implantacao}/designar`, { usuario_id: quem.id }));
    },
    iniciar: (s) => ok('iniciar', s('POST', `/api/implantacoes/${j.implantacao}/iniciar`, {})),
    async etapasEConcluir(s) {
      await ok('etapas', s('PATCH', `/api/implantacoes/${j.implantacao}/etapas`, { etapas: { documentacao: { feito: true }, vouch: { id: '90001' }, onboarding: { situacao: 'realizado', data: hoje(), hora: '10:00' }, boletos: { feito: true, primeiro_vencimento: dia10() }, envio: { forma: 'email' } } }));
      await ok('concluir implantação', s('POST', `/api/implantacoes/${j.implantacao}/concluir`, {}));
    },
    async carteira() {
      const c = await ok('dados da carteira', nina('GET', `/api/implantacoes/${j.implantacao}/carteira`));
      await ok('carteira', nina('POST', `/api/implantacoes/${j.implantacao}/carteira`, { dados: c.dados }));
    },
  };
}

module.exports = [
  /* ======================= Primeiros passos ======================= */
  {
    nome: 'portal-primeiro-acesso',
    inicio: 'login',
    async preparar(cen) {
      // pessoa nova, ainda com a senha temporária
      await cen.admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Nina Torres', email: 'nina@myblue.com.br', senha: 'Bemvinda1', setores: [cen.S('CS')], modulos: ['renegociacoes'] });
    },
    abertura: ['Do primeiro login até achar as suas ferramentas.', ['Criar a sua senha', 'A tela inicial e o menu', 'Abrir uma ferramenta', 'Avisos e a sua conta']],
    async gravar(t, cen) {
      const E = '1 · Primeiro acesso';
      await t.legenda('No primeiro acesso, entre com o e-mail e a <b>senha temporária</b> que você recebeu.', { etapa: E, ms: 1000 });
      await t.digitar('#email', 'nina@myblue.com.br');
      await t.digitar('#senha', 'Bemvinda1', { atraso: 60 });
      await t.clicar('#btEntrar', { depois: 1500 });
      await t.legenda('Agora crie a <b>sua senha</b>: pelo menos 8 caracteres, com letras e números.', { etapa: E, ms: 900 });
      await t.digitar('#nova', 'MinhaSenha2026', { atraso: 55 });
      await t.digitar('#nova2', 'MinhaSenha2026', { atraso: 45 });
      await t.clicar('#fTroca button[type=submit]', { depois: 2200 });

      const I = '2 · A tela inicial';
      await t.legenda('Esta é a tela inicial. Aqui fica o atalho da <b>Central de Tickets</b>, para pedir algo a outro setor.', { etapa: I, ms: 600 });
      await t.mostrar('.atalho-tickets', 2800, { dx: 0.3 });
      await t.legenda('Logo abaixo, as <b>ferramentas</b> liberadas para você. Clique em <b>Abrir</b> para usar.', { etapa: I, ms: 600 });
      await t.mostrar('.cartoes .cartao', 2800);

      const M = '3 · O menu';
      await t.legenda('No menu ao lado ficam a <b>Central de Links</b>, os <b>Tutoriais</b>, os <b>Tickets</b> e a <b>Carteira de condomínios</b>.', { etapa: M, ms: 400 });
      for (const h of ['#/links', '#/tutoriais', '#/tickets', '#/carteira']) await t.mostrar(menu(h), 900, { dx: 0.3 });
      await t.legenda('E, separadas por setor, as ferramentas que você usa.', { etapa: M, ms: 400 });
      await t.mostrar('#lateral a[data-slug]', 2200, { dx: 0.3 });

      const F = '4 · Abrir uma ferramenta';
      await t.legenda('Para achar uma ferramenta, digite parte do nome na <b>busca</b> e tecle <b>Enter</b>.', { etapa: F, ms: 600 });
      await t.digitar('#busca', 'reneg', { atraso: 90, depois: 900 });
      await t.p.keyboard.press('Enter');
      await t.pausa(2800);
      await t.legenda('A ferramenta abre dentro do portal. Na barra de cima: <b>recarregar</b>, abrir em <b>nova aba</b> e <b>fechar</b>.', { etapa: F, ms: 400 });
      await t.mostrar('#btRecarregar', 1300);
      await t.mostrar('a[title="Abrir em nova aba"]', 1300);
      await t.mostrar('#btFecharMod', 1300);
      await t.legenda('Quando aparecer <b>✓ salvo no servidor</b>, o que você lançou já está guardado para a equipe.', { etapa: F, ms: 3400 });
      await t.clicar('#btFecharMod', { depois: 1200 });

      const A = '5 · Avisos';
      await t.legenda('O <b>sino</b> mostra os avisos: ticket novo, resposta, mudança de prazo e outros.', { etapa: A, ms: 700 });
      await t.clicar('#btSino', { depois: 1500 });
      await t.legenda('Ative os <b>alertas do navegador</b> para ser avisado mesmo com o portal em outra aba.', { etapa: A, ms: 400 });
      if (await t.p.locator('#btPermitir').isVisible()) await t.mostrar('#btPermitir', 2600); else await t.pausa(2600);
      await t.p.keyboard.press('Escape'); await t.pausa(500);

      const C = '6 · A sua conta';
      await t.legenda('Em <b>Minha conta</b> você coloca a sua foto e troca a senha.', { etapa: C, ms: 600 });
      await t.clicar('#btConta', { depois: 1300 });
      await t.legenda('Escolha uma foto: ela aparece no menu e nos comentários dos tickets.', { etapa: C, ms: 500 });
      await t.enviarArquivo('label[for=inFoto]', '#inFoto', cen.rec.foto, { depois: 2600 });
      await t.legenda('Para trocar a senha, informe a atual e a nova. As sessões em outros aparelhos são encerradas.', { etapa: C, ms: 500 });
      await t.mostrar('#fSenha', 3200, { dy: 0.3 });
      await t.legenda('Precisa de mais espaço na tela? <b>Recolha o menu</b> por aqui. Para sair, use o botão ao lado do seu nome.', { etapa: C, ms: 300 });
      await t.clicar('#btRecolher', { depois: 1500 });
      await t.clicar('#btRecolher', { depois: 900 });
      await t.mostrar('#btSair', 2600);
    },
    resumo: ['1º acesso: senha temporária → crie a sua', 'Menu e <b>busca</b> para achar as ferramentas', '<b>Sino</b> para os avisos · <b>Minha conta</b> para foto e senha'],
  },

  {
    nome: 'carteira-condominios',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/carteira',
    abertura: ['Os condomínios da MyBlue, quem cuida de cada um e o síndico.', ['Buscar um condomínio', 'O síndico', 'Filtrar por responsável e vigência', 'Ver a carteira de cada pessoa']],
    async gravar(t) {
      await t.legenda('A <b>Base de Clientes</b> mostra os condomínios da MyBlue, quem é o responsável em cada setor e o síndico.', { etapa: '1 · A Base de Clientes', ms: 600 });
      await t.mostrar('.tiles', 3000, { dx: 0.4 });
      await t.legenda('Busque pelo <b>nome</b>, <b>ID</b>, <b>CNPJ</b> ou pelo <b>síndico</b>.', { etapa: '2 · Buscar', ms: 400 });
      await t.digitar('#cfQ', 'solar', { atraso: 110, depois: 1200 });
      await t.legenda('Clique no condomínio para ver os dados, os responsáveis, o síndico e o histórico de mudanças.', { etapa: '2 · Buscar', ms: 400 });
      await t.clicar('#tbC tr.clicavel', { depois: 3800 });
      await t.clicar(fecharModal, { depois: 600 });
      const S = '3 · O síndico';
      await t.legenda('A coluna <b>Síndico</b> traz o nome, o telefone e o e-mail do síndico de cada condomínio.', { etapa: S, ms: 400 });
      await t.clicar('#cfQ', { depois: 150 }); await t.p.locator('#cfQ').fill(''); await t.pausa(500);
      await t.mostrar('th[data-ordem="sindico_nome"]', 2600);
      await t.legenda('A busca também acha pelo nome ou telefone do síndico.', { etapa: S, ms: 300 });
      await t.digitar('#cfQ', 'teresa', { atraso: 110, depois: 2200 });
      await t.clicar('#cfQ', { depois: 150 }); await t.p.locator('#cfQ').fill(''); await t.pausa(700);
      const F = '4 · Filtrar';
      await t.legenda('Filtre por <b>responsável</b>, UF, administradora ou situação.', { etapa: F, ms: 500 });
      await t.escolher('#cfPes', { value: 'analista_cobranca|MARCOS LIMA - 4701' }, { depois: 2400 });
      await t.escolher('#cfPes', { value: '' }, { depois: 600 });
      await t.legenda('Em <b>Vigência</b>, escolha o mês: aparecem os condomínios que entraram nele. Ao lado de cada mês, quantos foram.', { etapa: F, ms: 400 });
      await t.escolher('#cfVig', { index: 2 }, { depois: 2800 });
      await t.escolher('#cfVig', { value: '' }, { depois: 600 });
      await t.legenda('Na aba <b>Equipes</b>: quantos condomínios cada pessoa tem, por função.', { etapa: '5 · Equipes', ms: 500 });
      await t.clicar('nav.abas a[href="#/carteira/responsaveis"]', { depois: 2400 });
      await t.legenda('Clique no número para ver a lista de condomínios da pessoa.', { etapa: '5 · Equipes', ms: 300 });
      await t.mostrar('[data-ver]', 2600);
    },
    resumo: ['Busca por nome, ID, CNPJ ou síndico', 'Coluna <b>Síndico</b> · filtros por responsável e <b>vigência</b>', 'Aba <b>Equipes</b>: a carteira de cada pessoa · Marketing: <b>Lista do Marketing</b>'],
  },

  {
    nome: 'minhas-premiacoes',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/',
    async preparar(cen) {
      // demonstrativos fictícios do mês anterior, enviados como a ferramenta de Comissionamento envia
      const D = require('./dados-ficticios');
      const comp = D.compAnterior(new Date());
      const conds = (n, falha) => D.CONDS.slice(0, n).map((c, i) => ['Cond. ' + c, i !== falha]);
      const doc = (x) => D.demonstrativo({ comp, titulo: 'Memória de cálculo — Condomínios com meta de redução de inadimplência', nota: 'Valor por condomínio que bate a meta.', ...x });
      const ids = cen.id;
      await cen.admin('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: comp, relatorios: [
        { chave: 'cb1', usuario_id: ids['marcos@myblue.com.br'], nome: 'Marcos Lima', cargo: 'Analista de Cobrança', setor: 'Cobrança', valor: 495,
          html: doc({ nome: 'Marcos Lima', cargo: 'Analista de Cobrança', setor: 'Cobrança', linhas: conds(12, 4), total: 495 }), leitores: [{ usuario_id: ids['lia@myblue.com.br'], motivo: 'lider' }] },
        { chave: 'cb2', usuario_id: ids['sara@myblue.com.br'], nome: 'Sara Alves', cargo: 'Analista de Cobrança', setor: 'Cobrança', valor: 540,
          html: doc({ nome: 'Sara Alves', cargo: 'Analista de Cobrança', setor: 'Cobrança', linhas: conds(12, -1), total: 540 }), leitores: [{ usuario_id: ids['lia@myblue.com.br'], motivo: 'lider' }] },
      ] });
      // a gestão pede ao coordenador do Crédito as planilhas da equipe (Planilhas do mês);
      // a Cobrança não manda planilha: a gestão puxa do Acompanhamento de Resultados
      await cen.admin('POST', '/api/comissao/planilhas', { modulo: 'premiacoes', competencia: comp, avisar_email: false, pedidos: [
        { chave: 'cr1', usuario_id: ids['caio@myblue.com.br'], nome: 'Bruna Reis', tipo: 'credito', titulo: 'Planilha de envio de boletos' },
        { chave: 'cr2', usuario_id: ids['caio@myblue.com.br'], nome: 'Davi Rocha', tipo: 'credito', titulo: 'Planilha de envio de boletos' }] });
    },
    abertura: ['O seu demonstrativo de premiação, todo mês, no portal.', ['Onde fica', 'Conferir e Estou ciente', 'Coordenação: enviar as planilhas da equipe', 'Líderes: a equipe']],
    async gravar(t) {
      const O = '1 · Onde fica';
      await t.legenda('Quando o demonstrativo do mês é enviado, chega um <b>aviso no sino</b> e um e-mail curto (sem valores).', { etapa: O, ms: 600 });
      await t.mostrar('#btSino', 2600);
      await t.legenda('No menu, em <b>Premiações</b>, abra <b>Minhas Premiações</b>. O número mostra o que espera por você.', { etapa: O, ms: 300 });
      await t.clicar(menu('#/premiacoes'), { depois: 1600 });
      await t.legenda('Cada mês tem um cartão com o valor e a situação: <b>Novo</b>, <b>Aberto</b> ou <b>Ciente</b>.', { etapa: O, ms: 300 });
      await t.mostrar('.cartao', 3000);

      const C = '2 · Conferir';
      await t.legenda('Clique no cartão para abrir o demonstrativo: o valor e a memória de cálculo, condomínio por condomínio. Ele fica aqui para consultar.', { etapa: C, ms: 300 });
      await t.clicar('.cartao', { depois: 2200 });
      await t.mostrar('#frDemo', 3600, { dy: 0.3 });
      await t.legenda('Conferiu? Clique em <b>Estou ciente</b>. Se tiver dúvida, fale com a sua liderança antes.', { etapa: C, ms: 300 });
      await t.clicar('#btCienteC', { depois: 2400 });
      await t.legenda('Pronto: o demonstrativo fica marcado como ciente e a gestão de premiações acompanha quem já confirmou.', { etapa: C, ms: 2600 });

      const P = '3 · Coordenação';
      await t.legenda('O <b>coordenador do setor</b> recebe o pedido das planilhas do mês da equipe, com um aviso só.', { etapa: P, ms: 300 });
      await t.ctx.clearCookies(); // sai da sessão do analista para entrar como coordenador do Crédito
      await t.entrar('caio@myblue.com.br', require('./cenario').SENHA);
      await t.ir('#/premiacoes', 1600);
      await t.legenda('Em <b>Planilhas para enviar</b>, uma linha por pessoa: clique em <b>Enviar planilha</b> e escolha o arquivo (Excel, CSV ou PDF).', { etapa: P, ms: 300 });
      const pasta = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'tut-'));
      const arq = require('path').join(pasta, 'envio-boletos-bruna.csv');
      require('fs').writeFileSync(arq, 'Condomínio;Vencimento;Data envio\nCond. Jardim Azul;10/11/2026;28/10/2026\nCond. Primavera;15/11/2026;03/11/2026\n');
      await t.enviarArquivo('.pedido-plan:has-text("Bruna Reis") label.btn', '.pedido-plan:has-text("Bruna Reis") input[data-plan]', arq, { depois: 2400 });
      await t.legenda('Um arquivo por pessoa. Quando todas estão enviadas, a gestão recebe <b>um aviso só</b>. Você acompanha: <b>Enviada</b> e depois <b>Recebida e conferida</b>.', { etapa: P, ms: 300 });
      await t.mostrar('.planilhas-mes', 3200);

      const L = '4 · Líderes';
      await t.legenda('Coordenação, supervisão, gerência e diretoria veem também os demonstrativos da equipe, na aba <b>Minha equipe</b>.', { etapa: L, ms: 300 });
      await t.ctx.clearCookies(); // a coordenadora da Cobrança acompanha os demonstrativos da equipe dela
      await t.entrar('lia@myblue.com.br', require('./cenario').SENHA);
      await t.ir('#/premiacoes/equipe', 1600);
      await t.mostrar('.tiles', 2800);
      await t.mostrar('tr.clicavel', 2800);
    },
    resumo: ['Aviso no sino e por e-mail quando sai o demonstrativo', 'Abrir, conferir e clicar em <b>Estou ciente</b>', 'Coordenação: <b>enviar as planilhas do mês</b> da equipe', 'Líderes e diretoria: aba <b>Minha equipe</b>'],
  },
  {
    nome: 'central-de-links',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/links',
    abertura: ['Os links úteis da empresa num lugar só.', null],
    async gravar(t) {
      await t.legenda('A <b>Central de Links</b> reúne os links úteis da empresa, organizados por grupo.', { etapa: 'Central de Links', ms: 3200 });
      await t.legenda('Clique num link para abrir: ele abre numa <b>nova aba</b>, e o portal continua aberto.', { etapa: 'Central de Links', ms: 300 });
      await t.mostrar('.cl-link', 1500);
      await t.mostrar('.cl-link >> nth=2', 1800);
      await t.legenda('O fundo muda a cada <b>campanha</b> do Marketing. Ela vale para todo o portal no mesmo dia.', { etapa: 'Central de Links', ms: 3800 });
      await t.legenda('A Central de Links também fica no menu, logo abaixo do Início.', { etapa: 'Central de Links', ms: 300 });
      await t.mostrar(menu('#/links'), 2600, { dx: 0.3 });
    },
    resumo: ['Menu → <b>Central de Links</b>', 'Os links abrem numa nova aba', 'Quem cuida dela é o Marketing'],
  },

  /* ======================= Central de Tickets ======================= */
  {
    nome: 'ticket-abrir-e-acompanhar',
    inicio: 'login',
    abertura: ['Use a Central de Tickets sempre que precisar de algo de outro setor.',
      ['Entrar no portal', 'Abrir o ticket para o setor certo', 'Acompanhar e conversar com quem atende']],
    async gravar(t) {
      await t.legenda('Entre com o seu <b>e-mail</b> e a sua <b>senha</b>.', { etapa: '1 · Entrar', ms: 1200 });
      await t.digitar('#email', 'sara@myblue.com.br');
      await t.digitar('#senha', 'Nova12345', { atraso: 60 });
      await t.clicar('#btEntrar', { depois: 1800 });

      const E = '2 · Abrir o ticket';
      await t.legenda('Na tela inicial ficam o atalho da Central de Tickets e as ferramentas liberadas para você.', { etapa: E, ms: 3600 });
      await t.legenda('Clique em <b>Novo ticket</b>.', { etapa: E, ms: 900 });
      await t.clicar('#btIniNovoT', { depois: 900 });
      await t.legenda('Em <b>Para qual setor?</b>, escolha quem vai atender. Em <b>Tipo de demanda</b>, o assunto.', { etapa: E, ms: 1500 });
      await t.escolher('#tSetor', 'Cobrança');
      await t.escolher('#tCat', '2ª via de boleto', { depois: 900 });
      await t.legenda('Marque se a demanda é <b>externa</b> (condomínio, síndico, propostas) ou <b>interna</b> (entre setores).', { etapa: E, ms: 1300 });
      await t.clicar('input[name=tOrigem][value=condominio]', { depois: 500 });
      await t.legenda('Digite e escolha o condomínio da lista. O portal já mostra <b>para quem o ticket vai</b>.', { etapa: E, ms: 600 });
      await t.digitar('#tCond', 'Cond. Vila Rica · PE', { atraso: 45, depois: 2600 });
      await t.legenda('Escreva um <b>assunto</b> curto e, na <b>descrição</b>, tudo o que o setor precisa.', { etapa: E, ms: 700 });
      await t.digitar('#tTitulo', '2ª via — apto 51');
      await t.digitar('#tDesc', 'Moradora pediu a 2ª via do boleto de outubro. Vencimento 10/10. Enviar para o e-mail do síndico.', { atraso: 22, depois: 600 });
      await t.legenda('A <b>prioridade</b> veio do tipo de demanda. Logo abaixo aparece o <b>prazo para resposta</b>.', { etapa: E, ms: 900 });
      await t.mostrar('#tPrazo', 2600);
      await t.legenda('Se tiver arquivos, anexe em <b>Anexos</b>. Depois, clique em <b>Abrir ticket</b>.', { etapa: E, ms: 2200 });
      await t.clicar('#btCriarT', { depois: 1800 });

      const A = '3 · Acompanhar';
      await t.legenda('Pronto: o ticket foi aberto e já está com o responsável. Aqui você vê a situação, os prazos e o histórico.', { etapa: A, ms: 4800 });
      await t.legenda('Para conversar com quem está atendendo, escreva a mensagem e clique em <b>Enviar</b>.', { etapa: A, ms: 900 });
      await t.digitar('#cTexto', 'Se possível, enviar ainda hoje. Obrigada!', { atraso: 35 });
      await t.clicar('#btComentar', { depois: 1600 });
      await t.legenda('Todos os seus pedidos ficam em <b>Tickets → Abertos por mim</b>.', { etapa: A, ms: 900 });
      await t.clicar(menu('#/tickets'), { depois: 1300 });
      await t.clicar('nav.abas a[href="#/tickets/fila/abertos"]', { depois: 1400 });
      await t.legenda('Situação, responsável e prazo de cada pedido. Clique num ticket para abrir.', { etapa: A, ms: 4200 });
      await t.legenda('Quando o setor responder ou resolver, você recebe o aviso no <b>sino</b>. Se não ficou resolvido, use <b>Reabrir</b> no ticket.', { etapa: A, ms: 900 });
      await t.mostrar('#btSino', 4200);
    },
    resumo: ['<b>Novo ticket</b> → setor, tipo de demanda e condomínio (ou interna)', 'Assunto curto e descrição completa, com anexos se tiver',
      'Acompanhe em <b>Tickets → Abertos por mim</b> e converse pelo próprio ticket'],
  },

  {
    nome: 'ticket-atender',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/tickets/fila/minha',
    async preparar(cen) {
      await cen.sessao.sara('POST', '/api/tickets', { condominio_id: cen.cond['Cond. Vila Rica'], titulo: 'Acordo da unidade 51', categoria_id: cen.cat['Proposta de acordo'],
        descricao: 'Condômino da unidade 51 quer parcelar os boletos de julho a setembro.\nContato: (11) 90000-0000.', setor_id: cen.S('Cobrança') });
    },
    abertura: ['Do ticket que chegou até a resolução.', ['Minha fila', 'Iniciar o atendimento com prazo', 'Responder e registrar nota interna', 'Aguardando, transferir e resolver']],
    async gravar(t) {
      await t.legenda('Em <b>Tickets → Minha fila</b> ficam os tickets que estão com você, com a situação e o prazo.', { etapa: '1 · Minha fila', ms: 3600 });
      await t.legenda('O número no menu mostra quantos tickets estão na sua fila.', { etapa: '1 · Minha fila', ms: 300 });
      await t.mostrar('#lateral [data-contador=fila]', 2200);
      await t.legenda('Clique no ticket para abrir.', { etapa: '1 · Minha fila', ms: 300 });
      await t.clicar('#tbT tr:has-text("Acordo da unidade 51")', { depois: 1800 });

      const I = '2 · Iniciar';
      await t.legenda('Leia o pedido. Para começar, clique em <b>Iniciar atendimento</b>.', { etapa: I, ms: 2600 });
      await t.clicar('#btIniciar', { depois: 900 });
      await t.legenda('Informe <b>até quando você conclui</b>. Quem abriu o ticket vê essa previsão.', { etapa: I, ms: 500 });
      await t.preencherCampo('#mConc', diaUtil(2) + 'T16:00', { depois: 1200 });
      await t.clicar('#mOkC', { depois: 2000 });

      const R = '3 · Responder';
      await t.legenda('Responda a quem abriu pelo campo de mensagem e clique em <b>Enviar</b>.', { etapa: R, ms: 500 });
      await t.digitar('#cTexto', 'Olá! Vou levantar os valores e te envio a proposta até amanhã.', { atraso: 28 });
      await t.clicar('#btComentar', { depois: 1800 });
      await t.legenda('Marque <b>nota interna</b> para registrar algo que só a equipe do setor vê.', { etapa: R, ms: 500 });
      await t.digitar('#cTexto', 'Conferir se há acordo anterior quebrado antes de propor.', { atraso: 28 });
      await t.clicar('#cInterno', { depois: 500 });
      await t.clicar('#btComentar', { depois: 2000 });

      const S = '4 · Aguardando e transferir';
      await t.legenda('Se depender de alguém de fora (banco, síndico, condômino), mude a situação para <b>Aguardando</b> e salve.', { etapa: S, ms: 700 });
      await t.escolher('#dStatus', { value: 'aguardando' }, { depois: 900 });
      await t.clicar('#btSalvarT', { depois: 2000 });
      await t.legenda('Se o pedido for de outro setor, use <b>Transferir</b>: ele vai para a fila do setor certo, com o motivo.', { etapa: S, ms: 500 });
      await t.clicar('#btTransferir', { depois: 900 });
      await t.escolher('#trSetor', 'Crédito', { depois: 700 });
      await t.digitar('#trMot', 'Precisa da análise do balancete.', { atraso: 30, depois: 800 });
      await t.legenda('Neste exemplo, vamos cancelar e continuar o atendimento.', { etapa: S, ms: 600 });
      await t.clicar(fecharModal, { depois: 800 });

      const F = '5 · Resolver';
      await t.legenda('Terminou? Clique em <b>Marcar como resolvido</b> e conte o que foi feito: quem abriu é avisado.', { etapa: F, ms: 500 });
      await t.clicar('#btResolver', { depois: 800 });
      await t.digitar('#mMotivo', 'Proposta enviada ao condômino: 3 parcelas a partir de 10/11.', { atraso: 26, depois: 600 });
      await t.clicar('#mOkM', { depois: 2400 });
      await t.legenda('O ticket fica como <b>Resolvido</b>. Se o problema continuar, quem abriu pode reabrir.', { etapa: F, ms: 3600 });
    },
    resumo: ['<b>Iniciar atendimento</b> com o prazo para conclusão', 'Mensagem para quem abriu · <b>nota interna</b> para a equipe', '<b>Aguardando</b>, <b>Transferir</b> e <b>Marcar como resolvido</b>'],
  },

  {
    nome: 'ticket-lider',
    entrar: 'lia@myblue.com.br',
    inicio: '#/tickets/fila/setor',
    abertura: ['O líder recebe o que chega para o setor e distribui para a equipe.', ['Fila do setor', 'Escolher o responsável', 'Prioridade e prazos', 'Painel de tickets']],
    async gravar(t) {
      await t.legenda('Como líder, em <b>Fila do setor</b> você vê tudo o que chegou para o setor.', { etapa: '1 · Fila do setor', ms: 3400 });
      await t.legenda('Marque <b>sem responsável</b> para ver o que ainda precisa ser distribuído. Os atrasados aparecem em vermelho.', { etapa: '1 · Fila do setor', ms: 400 });
      await t.clicar('#fTsr', { depois: 2600 });
      await t.clicar('#tbT tr:has-text("Revisar régua")', { depois: 1800 });

      const D = '2 · Distribuir';
      await t.legenda('Escolha o <b>responsável</b> e clique em <b>Salvar alterações</b>. A pessoa recebe o aviso na hora.', { etapa: D, ms: 500 });
      await t.escolher('#dResp', 'Marcos Lima', { depois: 900 });
      await t.legenda('O líder também ajusta a <b>prioridade</b> e o <b>prazo para resposta</b>.', { etapa: D, ms: 300 });
      await t.escolher('#dPrio', { value: 'alta' }, { depois: 1800 });
      await t.mostrar('#dPrazo', 1500);
      await t.clicar('#btSalvarT', { depois: 2200 });

      const P = '3 · Painel';
      await t.legenda('No <b>Painel de tickets</b>: abertos, atrasados, tempo de resposta e o que está com cada pessoa.', { etapa: P, ms: 400 });
      await t.clicar(menu('#/tickets/painel'), { depois: 2600 });
      await t.legenda('Escolha o período para comparar com o mês anterior.', { etapa: P, ms: 300 });
      await t.escolher('#pDias', { value: '7' }, { depois: 2000 });
      await t.rolar(420, '#pCorpo');
      await t.pausa(2400);
    },
    resumo: ['<b>Fila do setor</b> → filtro <b>sem responsável</b>', 'Escolha o responsável e salve', '<b>Painel de tickets</b> para acompanhar a equipe'],
  },

  {
    nome: 'ticket-supervisao',
    entrar: 'sueli@myblue.com.br',
    inicio: '#/tickets/fila/todos',
    abertura: ['Para quem acompanha a empresa toda.', ['Todos os tickets de todos os setores', 'Atrasados e filtros', 'Direcionar um ticket', 'Painel geral']],
    async gravar(t) {
      const T = '1 · Todos os tickets';
      await t.legenda('Com a <b>supervisão da Central de Tickets</b>, a aba <b>Todos</b> mostra os tickets de todos os setores.', { etapa: T, ms: 3600 });
      await t.legenda('Filtre por <b>setor</b>, situação, ou marque <b>só atrasados</b>.', { etapa: T, ms: 400 });
      await t.escolher('#fTse', 'Cobrança', { depois: 1600 });
      await t.clicar('#fTat', { depois: 2200 });
      await t.clicar('#fTat', { depois: 900 });
      await t.clicar('#tbT tr:has-text("Acordo para unidade 104")', { depois: 1800 });
      await t.legenda('Em qualquer ticket você pode trocar o responsável, transferir, mudar a situação, a prioridade e o prazo.', { etapa: '2 · Direcionar', ms: 400 });
      await t.mostrar('#ladoAcoes', 4200, { dy: 0.3 });
      await t.legenda('No <b>Painel de tickets</b>, compare os setores e acompanhe os atrasos.', { etapa: '3 · Painel', ms: 400 });
      await t.clicar(menu('#/tickets/painel'), { depois: 2600 });
      await t.escolher('#pSetor', 'Cobrança', { depois: 2200 });
      await t.rolar(420, '#pCorpo');
      await t.pausa(2400);
    },
    resumo: ['<b>Tickets → Todos</b>: todos os setores', 'Filtros por setor e <b>só atrasados</b>', '<b>Painel de tickets</b> por setor e período'],
  },

  {
    nome: 'links-editar',
    entrar: 'mel@myblue.com.br',
    inicio: '#/links',
    async preparar(cen, base) {
      await cen.admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Mel Andrade', email: 'mel@myblue.com.br', senha: 'Senha1234', setores: [cen.S('Marketing')], editor_links: true });
      const c = cliente(base);
      await c('POST', '/api/auth/login', { email: 'mel@myblue.com.br', senha: 'Senha1234' });
      await c('POST', '/api/auth/senha', { atual: 'Senha1234', nova: 'Nova12345' });
    },
    abertura: ['Para quem tem a marcação Marketing — Central de Links no cadastro.', ['Cadastrar um link', 'Mudar a ordem', 'Trocar o fundo da campanha']],
    async gravar(t, cen) {
      await t.legenda('Quem edita a Central de Links vê o botão <b>Editar links e fundo</b>.', { etapa: '1 · Editar', ms: 400 });
      await t.clicar('a[href="#/links/gestao"]', { depois: 1800 });
      const L = '2 · Links';
      await t.clicar('nav.abas a[href="#/links/gestao/links"]', { depois: 1500 });
      await t.legenda('<b>Novo link</b>: título, endereço, grupo e ícone.', { etapa: L, ms: 300 });
      await t.clicar('#btNovoLink', { depois: 800 });
      await t.digitar('#lTit', 'Manual do portal');
      await t.digitar('#lUrl', 'https://exemplo.myblue.com.br/manual', { atraso: 22 });
      await t.digitar('#lGrupo', 'Equipe');
      await t.escolher('#lIcone', { value: 'documento' });
      await t.digitar('#lDesc', 'Manuais do Portal MyBlue', { atraso: 26 });
      await t.clicar('#btSalvarLink', { depois: 1800 });
      await t.legenda('Use as <b>setas</b> para mudar a ordem. Links do mesmo grupo aparecem juntos.', { etapa: L, ms: 300 });
      await t.clicar('[data-mover="1"]', { depois: 2000 });
      const C = '3 · Fundo da campanha';
      await t.clicar('nav.abas a[href="#/links/gestao/campanhas"]', { depois: 1500 });
      await t.legenda('Cada campanha entra no ar sozinha na <b>data de início</b> e fica até começar a próxima.', { etapa: C, ms: 3000 });
      await t.legenda('<b>Nova campanha</b>: nome, data e a imagem de fundo (computador e, se quiser, celular).', { etapa: C, ms: 300 });
      await t.clicar('#btNovaCamp', { depois: 800 });
      await t.digitar('#cNome', 'Campanha de novembro');
      await t.preencherCampo('#cInicio', diaUtil(20));
      await t.enviarArquivo('#z-fundo', '#z-fundo input[type=file]', cen.rec.fundo, { depois: 1800 });
      await t.legenda('<b>Escurecer</b> deixa os botões legíveis sobre a imagem. Depois, <b>Criar campanha</b>.', { etapa: C, ms: 2400 });
      await t.clicar('#btSalvarCamp', { depois: 2400 });
      await t.legenda('A campanha fica <b>agendada</b>. Use <b>Ver</b> para conferir como a página vai ficar.', { etapa: C, ms: 300 });
      await t.clicar('a[href^="#/links/previa/"]', { depois: 3600 });
    },
    resumo: ['<b>Editar links e fundo</b> → aba <b>Links</b>', 'Setas para mudar a ordem', 'Aba <b>Fundo da campanha</b>: agenda o fundo de cada mês'],
  },

  /* ======================= Da Análise de Crédito à Implantação ======================= */
  {
    // a jornada vista pelo executivo: só a tela dele; o que as outras pessoas fazem aparece nos cartões "Enquanto isso"
    nome: 'jornada-credito-implantacao',
    entrar: 'vera@myblue.com.br',
    inicio: '#/credito',
    async preparar(cen, base) {
      cen.P = await passosJor(base);
      await cen.P.analisePronta();
      cen.pdfsImp = pdfsImp();
    },
    abertura: ['O caminho do executivo: da análise de crédito ao condomínio na Carteira.', ['Pedir a análise e receber o retorno', 'Pedir o contrato e levar a minuta ao síndico', 'Solicitar a implantação', 'Acompanhar até a Carteira']],
    async gravar(t, cen) {
      const P = cen.P, j = P.j;
      const A = '1 · Análise de Crédito';
      await t.legenda('Fechou a conversa com o síndico? Tudo começa no menu <b>Análise de Crédito</b>.', { etapa: A, ms: 300 });
      await t.mostrar(menu('#/credito'), 1800, { dx: 0.3 });
      await t.ir(`#/credito/${j.analise}`, 1800);
      await t.legenda('Preencha os dados do condomínio e anexe a <b>convenção</b> e o <b>relatório de inadimplência</b>.', { etapa: A, ms: 400 });
      await t.mostrar('#fRs', 2200);
      await t.legenda('<b>Enviar para análise</b>: sai o protocolo, e a resposta vem em até 24h úteis.', { etapa: A, ms: 300 });
      await t.clicar('#btEnviarCr', { depois: 2400 });

      await cartaoJor(t, 'Enquanto isso · Análise de Crédito', 'O analista calcula e libera o retorno', { rota: `#/credito/${j.analise}`, antes: async () => { await P.analistaLanca(); await P.liberar(); } });
      await t.legenda('Você é avisado no sino e por e-mail: o <b>retorno</b> fica na análise, em PDF, com a taxa e o boleto.', { etapa: A, ms: 300 });
      await t.mostrar('a.btn.primary[target=_blank]', 2800);

      const C = '2 · Contrato';
      await t.legenda('Com o retorno liberado, vá em <b>Jurídico → Solicitação de Contrato</b> e clique em <b>Nova solicitação</b>.', { etapa: C, ms: 300 });
      await t.ir('#/contratos', 1600);
      await t.mostrar(menu('#/contratos'), 1600, { dx: 0.3 });
      await t.clicar('#btNovoCt', { depois: 1400 });
      await t.legenda('Escolha a análise: condomínio, taxa, boleto e vencimento vêm preenchidos.', { etapa: C, ms: 300 });
      await t.clicar('input[name=anCt]', { depois: 900 });
      await t.clicar('#mCtOk', { depois: 2200 });
      await t.legenda('Complete o síndico, o que vamos garantir, a vigência e a data do primeiro vencimento.', { etapa: C, ms: 300 });
      await t.digitar('#c_sindico_nome', 'Síndico Fictício', { atraso: 30 });
      await t.digitar('#c_sindico_cpf', '111.444.777-35', { atraso: 45 });
      await t.digitar('#c_sindico_email', 'sindico@exemplo.com', { atraso: 25 });
      await t.digitar('#c_sindico_telefone', '(85) 90000-0000', { atraso: 35 });
      // a conferência ao vivo tira os avisos em vermelho e a tela se ajusta: espera antes de clicar
      await t.pausa(1500);
      await t.mostrar('[data-marca-ct=garantias][value="Taxa ordinária"]', 600);
      await t.clicar('[data-marca-ct=garantias][value="Taxa ordinária"]', { depois: 900 });
      await t.clicar('input[name=c_cashback][value=nao]', { depois: 400 });
      await t.preencherCampo('#c_inicio_contrato', dia1());
      await t.preencherCampo('#c_primeiro_vencimento', dia10());
      await t.digitar('#c_minucias', 'Nenhuma', { atraso: 40 });
      await t.legenda('<b>Enviar ao Jurídico</b>: o Jurídico tem <b>72h úteis</b> para a minuta.', { etapa: C, ms: 300 });
      await t.clicar('#btEnviarCt', { depois: 2600 });
      await P.contratoId();

      await cartaoJor(t, 'Enquanto isso · Jurídico', 'A advogada assume e redige a minuta', { rota: `#/contratos/${j.contrato}`, antes: async () => { await P.assumirContrato(); await P.anexarMinuta(); await P.enviarMinuta(); } });
      await t.legenda('A minuta chegou: leve ao síndico. Pediu mudança? <b>Pedir ajuste</b>, e ela volta ao Jurídico.', { etapa: C, ms: 300 });
      await t.mostrar('#btAjusteCt', 2200);
      await t.legenda('Aprovou? <b>Síndico aprovou: pedir assinatura</b>.', { etapa: C, ms: 300 });
      await t.clicar('#btPedirAssCt', { depois: 900 });
      await t.clicar('#mTxtCtOk', { depois: 2400 });

      await cartaoJor(t, 'Enquanto isso · Jurídico', 'Manda assinar, recebe a via assinada e registra as condições fechadas', { rota: `#/contratos/${j.contrato}`, antes: async () => { await P.emAssinatura(); await P.assinado(); await P.concluirContrato(); } });
      const D = '3 · Implantação';
      await t.legenda('Você é avisado: <b>contrato assinado</b>. Agora é com você: clique em <b>Solicitar implantação</b>.', { etapa: D, ms: 300 });
      await t.mostrar('.msg.info', 2400);
      await t.clicar('#btAbrirImpCt', { depois: 900 });
      await t.clicar('#mOk', { depois: 2600 });
      await P.implantacaoId();
      await t.legenda('A implantação abre com as <b>condições fechadas no contrato</b>, o contrato assinado e a convenção.', { etapa: D, ms: 300 });
      await t.mostrar('section.painel:has(h2:text("Condições fechadas no contrato"))', 3000);
      await t.legenda('Falta só o que é da implantação: honorários, parceria, antecipação e o consultor do condomínio.', { etapa: D, ms: 300 });
      await t.clicar('input[name=i_honorarios_op][value="12"]', { depois: 400 });
      await t.clicar('input[name=i_parceria][value=nao]', { depois: 400 });
      await t.clicar('input[name=i_antecipacao][value=nao]', { depois: 400 });
      await t.digitar('#i_consultor_nome', 'Consultor Fictício', { atraso: 30 });
      await t.digitar('#i_consultor_telefone', '(85) 90000-0001', { atraso: 40 });
      await t.legenda('E os documentos do síndico: cadastro de moradores, ata de eleição e ata de previsão orçamentária.', { etapa: D, ms: 300 });
      for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) {
        await t.clicar('#btSalvarImp', { depois: 1500 });
        await t.enviarArquivo(`label:has(input[data-doc-imp=${tipo}])`, `input[data-doc-imp=${tipo}]`, cen.pdfsImp[tipo], { depois: 1800 });
      }
      await t.legenda('<b>Enviar ao setor Implantação</b>: sai o protocolo IMP, e a coordenação é avisada.', { etapa: D, ms: 300 });
      await t.clicar('#btEnviarImp', { depois: 2600 });

      await cartaoJor(t, 'Enquanto isso · Implantação', 'A coordenação designa, a assistente conduz e o condomínio entra na Carteira', { rota: `#/implantacao/${j.implantacao}`,
        antes: async () => { await P.designar('Otto Reis'); await P.iniciar(P.otto); await P.etapasEConcluir(P.otto); await P.carteira(); } });
      const E = '4 · Acompanhar';
      await t.legenda('Você é avisado em cada passo e acompanha tudo na implantação: aqui, <b>concluída</b> e com o condomínio na Carteira.', { etapa: E, ms: 300 });
      await t.mostrar('#conteudo .pagina .etiqueta', 3000);
      await t.legenda('O contrato e a análise ficam ligados à implantação, a um clique.', { etapa: E, ms: 3000 });
    },
    resumo: ['<b>Análise de Crédito</b>: pedir e receber o retorno', '<b>Solicitação de Contrato</b>: pedir · levar a minuta ao síndico · pedir a assinatura', '<b>Solicitar implantação</b> no contrato · completar e enviar · acompanhar'],
  },
  {
    // a jornada vista por quem executa: analista de crédito, advogada, coordenação e assistente da Implantação
    nome: 'jornada-credito-implantacao-equipe',
    entrar: 'tiago@myblue.com.br',
    inicio: '#/credito/fila',
    async preparar(cen, base) {
      cen.P = await passosJor(base);
      await cen.P.analisePronta();
      await cen.P.enviarAnalise();
    },
    abertura: ['O caminho de um condomínio pelas mãos de quem executa cada etapa.', ['Analista de crédito', 'Advogada', 'Coordenação da Implantação', 'Assistente de implantação']],
    async gravar(t, cen) {
      const P = cen.P, j = P.j;
      const A = '1 · Analista de crédito';
      await t.legenda('O executivo enviou a análise: ela chega na <b>Fila</b> da Análise de Crédito, com o prazo.', { etapa: A, ms: 300 });
      await t.mostrar('.tiles', 2200, { dx: 0.4 });
      await t.clicar(`#tbCr tr.clicavel`, { depois: 1800 });
      await t.legenda('<b>Assumir</b>: a análise passa a ser sua.', { etapa: A, ms: 300 });
      await t.clicar('#btAssumirCr', { depois: 2000 });
      await P.lancarAnalise();
      await t.legenda('Lance o relatório (colando a planilha ou o resultado da skill) e a convenção. O passo a passo está no tutorial do analista.', { etapa: A, ms: 300 });
      await t.ir(`#/credito/${j.analise}`, 200);
      await t.p.reload(); await t.pausa(1600);
      await t.legenda('<b>Salvar e calcular</b>: a política dá o status, a taxa administrativa e o boleto.', { etapa: A, ms: 300 });
      await t.clicar('#btCalcCr', { depois: 2600 });
      await t.mostrar('#conteudo .pagina > .painel', 2600, { dx: 0.3 });
      await t.legenda('<b>Validar e liberar</b>: o retorno em PDF vai para o executivo.', { etapa: A, ms: 300 });
      await t.clicar('#btLibCr', { depois: 1400 });
      await t.clicar('#mOk', { depois: 3000 });
      await t.clicar('.fundo-modal [data-fechar]', { depois: 1000 });

      await cartaoJor(t, 'Enquanto isso · Executivo', 'Pede o contrato com as condições negociadas', { email: 'lara@myblue.com.br', rota: '#/contratos/fila', antes: () => P.pedirContrato() });
      const B = '2 · Advogada';
      await t.legenda('O pedido chega na <b>Fila do Jurídico</b>, com o prazo de 72h úteis para a minuta.', { etapa: B, ms: 300 });
      await t.clicar(`#tbCt tr[data-id="${j.contrato}"]`, { depois: 1800 });
      await t.legenda('<b>Assumir</b>. As objeções e solicitações do síndico vêm com a resposta padrão do Jurídico.', { etapa: B, ms: 300 });
      await t.clicar('#btAssumirCt', { depois: 2000 });
      await P.anexarMinuta();
      await t.legenda('Redija a minuta, anexe em Documentos e clique em <b>Enviar minuta ao comercial</b>.', { etapa: B, ms: 300 });
      await t.ir(`#/contratos/${j.contrato}`, 200);
      await t.p.reload(); await t.pausa(1600);
      await t.clicar('#btMinutaCt', { depois: 900 });
      await t.clicar('#mTxtCtOk', { depois: 2400 });

      await cartaoJor(t, 'Enquanto isso · Executivo', 'Leva a minuta ao síndico, que aprova', { rota: '#/acompanhamento-contratos/assinaturas', antes: () => P.pedirAssinatura() });
      await t.legenda('O executivo pediu a assinatura: em <b>Acompanhamento de demandas Jurídicas → Assinaturas</b>, mande assinar e marque <b>Enviado para assinatura</b>.', { etapa: B, ms: 300 });
      await t.clicar(`[data-acao-ass="para_assinar"][data-c="${j.contrato}"]`, { depois: 900 });
      await t.digitar('#mObsAssCt', 'Enviado pela Clicksign ao síndico.', { atraso: 35 });
      await t.clicar('#mEmAssOk', { depois: 2000 });
      await P.assinado();
      await t.legenda('Voltou a via assinada: <b>Assinado</b>, anexando o contrato. Depois, registre as <b>condições fechadas</b>.', { etapa: B, ms: 300 });
      await t.ir(`#/contratos/${j.contrato}`, 200);
      await t.p.reload(); await t.pausa(1600);
      await t.mostrar('#fechadoCt', 2600);
      await t.legenda('Confira a <b>vigência</b> que foi fechada, marque os <b>honorários</b> e corrija o que mudou na negociação.', { etapa: B, ms: 300 });
      await t.clicar('input[name=c_f_honorarios_op][value="12"]', { depois: 900 });
      await t.legenda('<b>Concluir contrato</b>: o executivo é avisado para solicitar a implantação.', { etapa: B, ms: 300 });
      await t.clicar('#btFechConcluir', { depois: 1000 });
      await t.clicar('#mOk', { depois: 2400 });

      await cartaoJor(t, 'Enquanto isso · Executivo', 'Solicita a implantação, completa e envia ao setor', { email: 'nina@myblue.com.br', rota: '#/implantacao/atividades/fila',
        antes: async () => { await P.solicitarImplantacao(); await P.completarImplantacao(); await P.enviarImplantacao(); } });
      const C = '3 · Coordenação da Implantação';
      await t.legenda('A implantação chega no <b>Painel de implantação → Fila</b>, já com as condições fechadas no contrato.', { etapa: C, ms: 300 });
      await t.clicar(`#corpoAcomp tr[data-imp="${j.implantacao}"]`, { depois: 1800 });
      await t.mostrar('section.painel:has(h2:text("Condições fechadas no contrato"))', 2600);
      await t.legenda('<b>Designar</b>: escolha a assistente que vai conduzir. Ela tem 8h úteis para iniciar.', { etapa: C, ms: 300 });
      await t.clicar('#btDesigImp', { depois: 900 });
      await t.escolher('#mDesig', 'Otto Reis');
      await t.clicar('#mDesigOk', { depois: 2000 });

      await cartaoJor(t, 'Assistente de implantação', 'Conduz as etapas', { email: 'otto@myblue.com.br', rota: `#/implantacao/${j.implantacao}` });
      const D = '4 · Assistente de implantação';
      await t.legenda('Quem foi designado clica em <b>Iniciar implantação</b>.', { etapa: D, ms: 300 });
      await t.clicar('#btIniImp', { depois: 2200 });
      await t.legenda('Marque as <b>5 etapas</b>: documentação, cadastro no Vouch, onboarding, emissão e envio dos boletos.', { etapa: D, ms: 300 });
      await t.clicar('#e_doc', { depois: 400 });
      await t.digitar('#e_vouch', '90001', { atraso: 80 });
      await t.escolher('#e_onb', 'Realizado');
      await t.preencherCampo('#e_onb_data', hoje());
      await t.preencherCampo('#e_onb_hora', '10:00');
      await t.clicar('#e_bol', { depois: 400 });
      await t.preencherCampo('#e_bol_venc', diaUtil(20));
      await t.clicar('input[name=e_env][value=email]', { depois: 400 });
      await t.clicar('#btEtapasImp', { depois: 1800 });
      await t.legenda('As conferências do portal comparam com a análise e o contrato. Tudo certo: <b>Concluir implantação</b>.', { etapa: D, ms: 300 });
      await t.clicar('#btConclImp', { depois: 1000 });
      await t.clicar('#mOk', { depois: 2400 });

      await cartaoJor(t, 'Coordenação da Implantação', 'Confirma na Carteira', { email: 'nina@myblue.com.br', rota: `#/implantacao/${j.implantacao}` });
      const E = '5 · Carteira';
      await t.legenda('A coordenação confere e clica em <b>Confirmar na Carteira</b>: o ID Vouch e a forma de envio vêm das etapas.', { etapa: E, ms: 300 });
      await t.clicar('#btCartImp', { depois: 1800 });
      await t.mostrar('#k_codigo', 2000);
      await t.clicar('#kOk', { depois: 2600 });
      await t.legenda('Pronto: o condomínio está na <b>Carteira</b>, com a análise, o contrato e as condições fechadas guardados na implantação.', { etapa: E, ms: 3200 });
    },
    resumo: ['<b>Analista de crédito</b>: assumir · calcular · liberar', '<b>Advogada</b>: assumir · minuta · assinatura · condições fechadas', '<b>Implantação</b>: coordenação designa · assistente conduz · coordenação confirma na Carteira'],
  },

  /* ======================= Análise de Crédito ======================= */
  {
    nome: 'credito-solicitar',
    entrar: 'vera@myblue.com.br',
    inicio: '#/credito',
    async preparar(cen, base) {
      cen.pdfsCr = pdfsCr();
      // uma análise já com o retorno enviado, para mostrar o PDF e a reanálise
      cen.analiseEnviada = await analiseCr(base, { ...FORM_CR, razao_social: 'Edifício Mirante do Sol', cidade: 'Caucaia' }, { liberar: true });
    },
    abertura: ['Do pedido ao retorno da análise de crédito.', ['Preencher a solicitação', 'Anexar convenção e relatório', 'Enviar e acompanhar', 'Abrir o retorno e pedir reanálise']],
    async gravar(t, cen) {
      const A = '1 · Nova solicitação';
      await t.legenda('No menu, <b>Análise de Crédito</b> mostra as suas solicitações e a situação de cada uma.', { etapa: A, ms: 600 });
      await t.mostrar(menu('#/credito'), 1800, { dx: 0.3 });
      await t.mostrar('#tbCr tr', 2200, { dx: 0.3 });
      await t.legenda('Clique em <b>Nova solicitação</b>. O rascunho fica salvo até você enviar.', { etapa: A, ms: 500 });
      await t.clicar('#btNovaCr', { depois: 1800 });
      await t.legenda('No alto, o portal mostra <b>o que ainda falta</b> para enviar.', { etapa: A, ms: 600 });
      await t.mostrar('.msg.aviso', 2600, { dx: 0.2 });

      const B = '2 · Dados do condomínio';
      await t.legenda('Preencha a identificação: razão social, CNPJ, UF e cidade.', { etapa: B, ms: 400 });
      await t.digitar('#fRs', 'Condomínio Residencial Jardim das Acácias', { atraso: 30 });
      await t.digitar('#fCnpj', '11.222.333/0001-81', { atraso: 45 });
      await t.digitar('#fUf', 'CE', { atraso: 80 });
      await t.digitar('#fCid', 'Fortaleza', { atraso: 50 });
      await t.legenda('Escolha se é <b>nova contratação</b> ou <b>portabilidade</b> de outra garantidora.', { etapa: B, ms: 400 });
      await t.clicar('input[name=fTipo][value=nova]', { depois: 900 });
      await t.legenda('Na operação: unidades, <b>taxa ordinária</b> e dia do vencimento.', { etapa: B, ms: 400 });
      await t.digitar('#fUh', '24', { atraso: 90 });
      await t.digitar('#fOrd', '1.840,00', { atraso: 60 });
      await t.digitar('#fVenc', '10', { atraso: 90 });
      await t.legenda('Taxa extra: informe o <b>valor por unidade</b>, não o total, com início e fim.', { etapa: B, ms: 400 });
      await t.clicar('#btExtra', { depois: 600 });
      await t.digitar('#tbExtras [data-x=descricao]', 'Reforma da fachada', { atraso: 35 });
      await t.digitar('#tbExtras [data-x=valor_por_uh]', '700,00', { atraso: 70 });
      await t.preencherCampo('#tbExtras [data-x=inicio]', '2026-01');
      await t.preencherCampo('#tbExtras [data-x=fim]', '2026-12');
      await t.clicar('#tbExtras [data-x=ata]', { depois: 600 });
      await t.legenda('E o síndico: condômino ou profissional, e se tem isenção.', { etapa: B, ms: 400 });
      await t.escolher('#fSind', { value: 'condomino' });
      await t.escolher('#fIse', { value: 'integral' });
      await t.digitar('#fIseT', '1', { atraso: 90 });
      await t.legenda('Clique em <b>Salvar rascunho</b> para guardar o que já preencheu.', { etapa: B, ms: 400 });
      await t.clicar('#btSalvarCr', { depois: 2200 });

      const C = '3 · Documentos';
      await t.legenda('Anexe a <b>convenção registrada</b> e o <b>relatório de inadimplência</b> detalhado por competência, emitido há menos de 3 meses.', { etapa: C, ms: 600 });
      await t.enviarArquivo('label:has(input[data-doc=convencao])', 'input[data-doc=convencao]', cen.pdfsCr.convencao, { depois: 2200 });
      await t.enviarArquivo('label:has(input[data-doc=relatorio])', 'input[data-doc=relatorio]', cen.pdfsCr.relatorio, { depois: 2200 });
      await t.legenda('Atas de taxa extra e outros documentos entram em <b>Outros documentos</b>.', { etapa: C, ms: 400 });
      await t.mostrar('#tipoOutro', 2200);

      const D = '4 · Enviar';
      await t.legenda('Com tudo certo, clique em <b>Enviar para análise</b>: o portal gera o <b>protocolo</b> e o prazo começa a contar.', { etapa: D, ms: 500 });
      await t.clicar('#btEnviarCr', { depois: 2600 });
      await t.legenda('O setor Análise de Crédito é avisado na hora. A resposta vem em até <b>24h úteis</b> (48h quando vai à diretoria).', { etapa: D, ms: 600 });
      await t.mostrar('.info-ticket', 3000, { dx: 0.3 });
      await t.legenda('Se faltar algo, a solicitação volta para você com a <b>lista de pendências</b>, no sino e por e-mail. Responda e reenvie.', { etapa: D, ms: 3600 });

      const E = '5 · O retorno';
      await t.legenda('Quando o analista libera, você recebe o aviso e o retorno fica aqui, em <b>PDF</b>.', { etapa: E, ms: 500 });
      await t.ir('#/credito/' + cen.analiseEnviada, 1800);
      await t.mostrar('a.btn.primary[target=_blank]', 3000);
      await t.legenda('Proposta vencida, relatório novo ou mudança no condomínio? Clique em <b>Solicitar reanálise</b>.', { etapa: E, ms: 500 });
      await t.clicar('#btReCr', { depois: 1600 });
      await t.legenda('O formulário vem preenchido e a convenção vai junto. A reanálise recebe um <b>protocolo novo</b>, ligado a este.', { etapa: E, ms: 3600 });
      await t.clicar(fecharModal, { depois: 800 });
    },
    resumo: ['<b>Nova solicitação</b>: dados, taxa extra por unidade e síndico', 'Anexe a convenção e o relatório e clique em <b>Enviar</b>', 'Retorno em PDF no portal · <b>Solicitar reanálise</b> quando precisar'],
  },

  {
    nome: 'credito-analisar',
    entrar: 'tiago@myblue.com.br',
    inicio: '#/credito/fila',
    async preparar(cen, base) {
      cen.analiseFila = await analiseCr(base, FORM_CR);
    },
    abertura: ['Da fila ao retorno liberado para o executivo.', ['A fila e os prazos', 'Lançar o relatório e a convenção', 'Calcular e conferir', 'Diretoria, pendência e liberação']],
    async gravar(t, cen) {
      const A = '1 · A fila';
      await t.legenda('A <b>Fila</b> mostra as análises pelo prazo. Chegou no dia útil até as 16h: resposta no mesmo dia; depois disso, no dia útil seguinte.', { etapa: A, ms: 600 });
      await t.mostrar('.tiles', 2600, { dx: 0.4 });
      await t.mostrar('#tbCr tr', 2200, { dx: 0.3 });
      await t.legenda('Abra a análise e clique em <b>Assumir</b>: ela passa a ser sua.', { etapa: A, ms: 400 });
      await t.clicar('#tbCr tr.clicavel', { depois: 1800 });
      await t.clicar('#btAssumirCr', { depois: 2200 });

      const B = '2 · Relatório e convenção';
      await t.legenda('Lance o relatório de inadimplência: <b>cole a planilha</b> (unidade, titular, documento, competência, tipo e valor), ou cole o bloco <b>PORTAL MYBLUE</b> da skill do Claude em <b>Colar resultado da skill</b>: cada parte vai para o seu campo.', { etapa: B, ms: 500 });
      await t.apontar('#dCola');
      await t.p.locator('#dCola').fill(planilhaCr());
      await t.pausa(1600);
      await t.clicar('#btColar', { depois: 1800 });
      await t.mostrar('#dColaInfo', 2200);
      await t.legenda('Informe a <b>data de emissão</b> do relatório: ela define os meses que entram na base.', { etapa: B, ms: 400 });
      await t.preencherCampo('#dEmis', hoje());
      await t.legenda('Na convenção: o <b>tipo de registro</b>, o número de unidades, a multa e o foro.', { etapa: B, ms: 400 });
      await t.escolher('#dReg', { value: 'RI' });
      await t.digitar('#dCuh', '24', { atraso: 90 });
      await t.digitar('#dMulta', '2', { atraso: 90 });
      await t.legenda('Espólios confirmados, retomadas e ajustes (sempre com justificativa) também ficam aqui.', { etapa: B, ms: 400 });
      await t.mostrar('#dEsp', 2400);

      const C = '3 · Calcular';
      await t.legenda('Clique em <b>Salvar e calcular</b>: o motor de regras aplica a política e mostra o resultado.', { etapa: C, ms: 400 });
      await t.clicar('#btCalcCr', { depois: 2600 });
      await t.legenda('Status, taxa ADM e boleto, com a faixa aplicada e a janela de meses.', { etapa: C, ms: 600 });
      await t.mostrar('#conteudo .pagina > .painel', 3000, { dx: 0.3 });
      await t.legenda('Inadimplência, receitas e exposição, e logo abaixo a <b>memória de cálculo</b> mês a mês.', { etapa: C, ms: 600 });
      await t.mostrar('.tiles', 3000, { dx: 0.4 });
      await t.legenda('Os <b>alertas</b> (concentração, multa, divergência entre as fontes) e a lista da <b>Assertiva</b> vêm em seguida: registre em cada unidade se é ou não espólio; espólio sai da garantia.', { etapa: C, ms: 3200 });

      const D = '4 · Liberar';
      await t.legenda('Confira a <b>Prévia do retorno</b> em PDF. Se faltar documento, use <b>Devolver com pendência</b>.', { etapa: D, ms: 500 });
      await t.mostrar('#acoesBarra a[href$="previa.pdf"]', 2200);
      await t.mostrar('#btPendCr', 2000);
      await t.legenda('Acima de 35% de inadimplência aparece <b>Enviar à diretoria</b>: o retorno só sai depois da chancela.', { etapa: D, ms: 3200 });
      await t.legenda('Tudo certo? <b>Validar e liberar</b>: o portal gera o PDF assinado por você e avisa o executivo.', { etapa: D, ms: 500 });
      await t.clicar('#btLibCr', { depois: 1400 });
      await t.clicar('#mOk', { depois: 4200 });
      await t.legenda('O texto do e-mail de entrega e o resumo executivo ficam prontos para copiar.', { etapa: D, ms: 3600 });
      await t.clicar('.fundo-modal [data-fechar]', { depois: 1200 });
    },
    resumo: ['<b>Fila</b> pelo prazo · <b>Assumir</b>', 'Cole o relatório, informe emissão e convenção · <b>Salvar e calcular</b>', '<b>Prévia</b>, pendência ou diretoria · <b>Validar e liberar</b>'],
  },

  /* ======================= Implantação ======================= */
  {
    nome: 'implantacao-solicitar',
    entrar: 'vera@myblue.com.br',
    inicio: '#/implantacao',
    async preparar(cen, base) {
      cen.pdfsImp = pdfsImp();
      cen.ctImp = await contratoTut(base, 'Condomínio Residencial Jardim das Acácias', { ate: 'concluido' });
      // já enviada ao Jurídico: aparece na lista "Com o Jurídico"
      await implantacaoForaTut(base, 'Residencial Vila Serena', 'AC-2025-0412');
      // para mostrar na janela o caminho "Fora do portal"
      cen.pdfsImp.contrato_fora = path.join(path.dirname(cen.pdfsImp.ata_eleicao), 'Contrato_assinado_exemplo.pdf');
      fs.writeFileSync(cen.pdfsImp.contrato_fora, '%PDF-1.4\n% arquivo de exemplo dos tutoriais\n%%EOF\n');
      cen.pdfsImp.retorno_fora = path.join(path.dirname(cen.pdfsImp.ata_eleicao), 'Retorno_analise_exemplo.pdf');
      fs.writeFileSync(cen.pdfsImp.retorno_fora, await retornoTut('AC-2025-0533', 'Edifício Brisa do Mar'));
    },
    abertura: ['Do contrato assinado ao setor Implantação.', ['Toda implantação começa de um contrato', 'O formulário, com as condições do contrato', 'Documentos obrigatórios e pendentes', 'Enviar e acompanhar', 'Contrato assinado fora do portal']],
    async gravar(t, cen) {
      const A = '1 · Nova implantação';
      await t.legenda('No menu, <b>Painel de implantação</b> abre em <b>Minhas solicitações</b>: a situação de cada uma e o que falta de você.', { etapa: A, ms: 600 });
      await t.mostrar(menu('#/implantacao'), 1800, { dx: 0.3 });
      await t.legenda('Clique em <b>Nova implantação</b>. Toda implantação começa de um <b>contrato assinado</b>.', { etapa: A, ms: 400 });
      await t.clicar('#btNovaImp', { depois: 1400 });
      await t.legenda('<b>No portal</b>: aparecem os seus contratos concluídos pelo Jurídico que ainda não têm implantação.', { etapa: A, ms: 600 });
      await t.mostrar('.modal [data-orig=portal]', 3400, { dx: 0.5 });
      await t.legenda('Escolha o contrato: as condições fechadas, o contrato assinado, a convenção e o retorno da análise vêm junto.', { etapa: A, ms: 500 });
      await t.clicar('input[name=ctImp]', { depois: 900 });
      await t.clicar('#mImpOk', { depois: 2200 });

      const B = '2 · Formulário';
      await t.legenda('O formulário já vem com o contrato e a análise. As <b>condições do contrato</b> ficam travadas: valem as do contrato assinado.', { etapa: B, ms: 600 });
      await t.mostrar('#i_taxa_adm', 3000);
      await t.legenda('Dois vencimentos: o <b>vencimento padrão</b> (dia) do condomínio, que vai para a Carteira, e o <b>1º vencimento</b> (data), que pode ser outro por causa da implantação.', { etapa: B, ms: 500 });
      await t.mostrar('#i_primeiro_vencimento', 2400);
      await t.legenda('Confira o síndico: nome, <b>CPF</b> (o portal confere na hora), e-mail e telefone.', { etapa: B, ms: 400 });
      await t.mostrar('#i_sindico_cpf', 2200);
      await t.legenda('Parceria: só diga se há e escolha o parceiro da base de comissão; o percentual é do setor Parceiros.', { etapa: B, ms: 500 });
      await t.clicar('input[name=i_parceria][value=nao]', { depois: 500 });
      await t.clicar('input[name=i_antecipacao][value=nao]', { depois: 600 });
      await t.legenda('Administradora e contatos: o consultor do condomínio e, no <b>+</b>, quantos contatos precisar.', { etapa: B, ms: 400 });
      await t.digitar('#i_consultor_nome', 'Consultor Fictício', { atraso: 35 });
      await t.digitar('#i_consultor_telefone', '(85) 90000-0001', { atraso: 45 });

      const C = '3 · Documentos';
      await t.legenda('Cinco documentos são <b>obrigatórios</b> para enviar: a convenção e o retorno da análise (já vêm vinculados, sem trocar), o cadastro de moradores, a ata de eleição e a ata de previsão orçamentária.', { etapa: C, ms: 600 });
      for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) {
        await t.clicar('#btSalvarImp', { depois: 1800 });
        await t.enviarArquivo(`label:has(input[data-doc-imp=${tipo}])`, `input[data-doc-imp=${tipo}]`, cen.pdfsImp[tipo], { depois: 2200 });
      }
      await t.legenda('Os outros podem chegar depois: enquanto faltarem, você recebe um <b>lembrete por e-mail</b> a cada dia útil. Depois de enviar, o que já foi anexado fica com <b>cadeado</b>: se estiver errado, a Implantação devolve com pendência e você anexa o certo.', { etapa: C, ms: 3600 });

      const D = '4 · Enviar e acompanhar';
      await t.legenda('Clique em <b>Enviar ao setor Implantação</b>: sai o protocolo IMP e a coordenação e a equipe são avisadas.', { etapa: D, ms: 400 });
      await t.clicar('#btEnviarImp', { depois: 2800 });
      await t.legenda('No botão <b>PDF</b> sai o formulário completo, para guardar ou enviar.', { etapa: D, ms: 400 });
      await t.mostrar('#acoesBarra a[href$="formulario.pdf"]', 2600);
      await t.legenda('Em <b>Abrir</b> você acompanha a <b>linha do tempo</b> (enviada, designada, iniciada, concluída e na Carteira). Se o setor devolver com pendência, a lista chega no sino e por e-mail: ajuste e reenvie.', { etapa: D, ms: 3200 });

      const E = '5 · Contrato assinado fora do portal';
      await t.ir('#/implantacao/minhas', 1400);
      await t.legenda('Contrato assinado <b>fora do portal</b>? Em <b>Nova implantação</b>, escolha <b>Fora do portal</b>.', { etapa: E, ms: 500 });
      await t.clicar('#btNovaImp', { depois: 1200 });
      await t.clicar('input[name=origImp][value=fora]', { depois: 1000 });
      await t.legenda('Anexe o <b>contrato assinado</b> e o <b>retorno da análise</b>: o portal lê o retorno e preenche o formulário.', { etapa: E, ms: 400 });
      await t.enviarArquivo('label:has(#arqCtFora)', '#arqCtFora', cen.pdfsImp.contrato_fora, { depois: 1200 });
      await t.enviarArquivo('label:has(#arqPdfImp)', '#arqPdfImp', cen.pdfsImp.retorno_fora, { depois: 2600 });
      await t.legenda('Você preenche o formulário e envia. A <b>advogada</b> registra as condições do contrato (taxa, boleto, desconto, vigência e honorários).', { etapa: E, ms: 600 });
      await t.mostrar('.modal [data-orig=fora] .msg', 3800);
      await t.clicar('.modal [data-fechar]', { depois: 1000 });
      await t.legenda('Enquanto isso, a implantação fica <b>Com o Jurídico</b>. Com as condições registradas, ela segue sozinha para o setor Implantação, e você é avisado.', { etapa: E, ms: 600 });
      await t.mostrar('#corpoImp tr:has(td:has-text("Vila Serena"))', 4200);
    },
    resumo: ['<b>Painel de implantação</b> · <b>Nova implantação</b> · escolha o contrato assinado', 'Complete o formulário: as condições vêm do contrato', 'Anexe os obrigatórios · <b>Enviar ao setor Implantação</b>', 'Fora do portal: a advogada registra as condições'],
  },
  {
    nome: 'implantacao-conduzir',
    entrar: 'nina@myblue.com.br',
    inicio: '#/implantacao/atividades/fila',
    async preparar(cen, base) {
      cen.impFila = await implantacaoTut(base, 'Edifício Mirante do Sol');
      cen.impNina = await implantacaoTut(base, 'Residencial Vila das Palmeiras', { responsavel: 'Nina Prado' });
    },
    abertura: ['Do pedido que chegou ao condomínio na Carteira.', ['Designar quem conduz', 'As 5 etapas, o prazo e as conferências', 'Pendência e conclusão', 'Confirmar na Carteira']],
    async gravar(t, cen) {
      const A = '1 · Fila e designação';
      await t.legenda('Quando chega uma implantação, a coordenação e a equipe são avisadas. No <b>Painel de implantação → Painel de atividades → Fila</b>, primeiro o que espera designação; a assistente abre aqui, já na carteira dela.', { etapa: A, ms: 600 });
      await t.mostrar('.cards-acomp', 2600, { dx: 0.4 });
      await t.clicar(`#corpoAcomp tr[data-imp="${cen.impFila}"]`, { depois: 1800 });
      await t.legenda('Clique em <b>Designar</b> e escolha quem conduz. A pessoa tem <b>8h úteis</b> para iniciar; sem designação, a coordenação recebe um lembrete a cada 4h úteis.', { etapa: A, ms: 400 });
      await t.clicar('#btDesigImp', { depois: 900 });
      await t.escolher('#mDesig', 'Otto Reis');
      await t.clicar('#mDesigOk', { depois: 2000 });

      const B = '2 · Etapas e conferências';
      await t.ir(`#/implantacao/${cen.impNina}`, 1800);
      await t.legenda('Só quem foi designada edita; o resto da equipe consulta (🔒) e, para editar, pede autorização à coordenação.', { etapa: B, ms: 500 });
      await t.legenda('A <b>linha do tempo</b> mostra o dia em que foi enviada, designada, iniciada e concluída. O prazo para concluir é de 3 dias úteis depois de assumir. Se algo impedir, <b>Marcar impedimento</b> pausa o prazo (a coordenação é avisada); resolvido, <b>Resolvido: retomar o prazo</b>.', { etapa: B, ms: 500 });
      await t.mostrar('#btImpedImp', 2800);
      await t.legenda('Com a implantação iniciada, marque as <b>5 etapas</b>: documentação, cadastro no Vouch (com o ID), onboarding, emissão e envio dos boletos.', { etapa: B, ms: 500 });
      await t.clicar('#e_doc', { depois: 500 });
      await t.digitar('#e_vouch', '90001', { atraso: 90 });
      await t.escolher('#e_onb', 'Realizado');
      await t.legenda('No onboarding, a <b>data e a hora</b> são obrigatórias. Marcado, o portal envia o <b>convite do Outlook</b> (1h, com Teams) para você, o setor CS e o síndico.', { etapa: B, ms: 400 });
      await t.preencherCampo('#e_onb_data', hoje());
      await t.preencherCampo('#e_onb_hora', '10:00');
      await t.legenda('Na emissão dos boletos, o <b>1º vencimento</b> já vem do formulário: altere só se ficou outra data. O vencimento padrão aparece ao lado e é o que vai para a Carteira.', { etapa: B, ms: 400 });
      await t.clicar('#e_bol', { depois: 500 });
      await t.preencherCampo('#e_bol_venc', diaUtil(20));
      await t.clicar('input[name=e_env][value=email]', { depois: 500 });
      await t.clicar('#btEtapasImp', { depois: 2000 });
      await t.legenda('As <b>conferências do portal</b> mostram diferenças com a análise, CPF e CNPJ e o cadastro de moradores contra o número de unidades.', { etapa: B, ms: 600 });
      await t.rolar(500);
      await t.pausa(2600);

      const C = '3 · Pendência e conclusão';
      await t.legenda('Faltou algo? <b>Devolver com pendência</b> manda a lista ao comercial (e o documento anexado errado volta a faltar), e o reenvio volta para você. Documento que chegou direto do síndico ou da administradora: <b>Anexar</b> ou <b>Marcar recebido</b>, dizendo de quem veio.', { etapa: C, ms: 500 });
      await t.mostrar('#btPendImp', 2400);
      await t.legenda('Com as etapas feitas, <b>Concluir implantação</b> (o onboarding pode ficar para depois, com o alerta). Se houver parceria, o setor Parceiros é avisado. A <b>ficha de transição</b> abre na conclusão.', { etapa: C, ms: 400 });
      await t.clicar('#btConclImp', { depois: 1000 });
      await t.clicar('#mOk', { depois: 2600 });
      await t.legenda('O quadro <b>Pós-implantação</b>: espólios em 2 dias úteis de assumir (abra a solicitação na <b>Análise de Espólio</b>; a devolutiva da cobrança aparece aqui), levantamento de pendências em 1 dia útil dos boletos e a 1ª prestação de contas em 5 dias úteis do repasse.', { etapa: C, ms: 600 });
      await t.mostrar('section.painel:has(.pos-linha)', 3400);
      await t.legenda('Os PDFs saem da <b>Central de Ferramentas</b> e ficam no CPD: aqui só se marca o envio. Lembrete na véspera e no dia; atrasada, a coordenação também é avisada e pode cobrar.', { etapa: C, ms: 400 });
      await t.mostrar('#btPosPend', 2400);

      const D = '4 · Carteira';
      await t.legenda('A coordenação confere os dados e clica em <b>Confirmar na Carteira</b>: o ID Vouch e a forma de envio vêm das etapas; o vencimento padrão e o nome, telefone e e-mail do síndico, do formulário.', { etapa: D, ms: 400 });
      await t.clicar('#btCartImp', { depois: 1800 });
      await t.mostrar('#k_codigo', 2400);
      await t.clicar('#kOk', { depois: 2600 });
      await t.legenda('Pronto: o condomínio está na Carteira, e o Controle de Emissão de Boletos acompanha.', { etapa: D, ms: 3000 });
    },
    resumo: ['<b>Designar</b> · 8h úteis para iniciar', 'Marque as 5 etapas · 3 dias úteis para concluir', '<b>Concluir</b> · <b>Pós-implantação</b> · <b>Confirmar na Carteira</b>'],
  },

  {
    nome: 'implantacao-ficha-repasse',
    entrar: 'nina@myblue.com.br',
    inicio: '#/implantacao/depois/fichas',
    async preparar(cen, base) {
      const feito = { documentacao: { feito: true }, vouch: { id: '90021' }, onboarding: { situacao: 'realizado', data: hoje(), hora: '10:00' }, boletos: { feito: true, primeiro_vencimento: diaUtil(15) }, envio: { forma: 'email' } };
      cen.fichaImp = await implantacaoTut(base, 'Residencial Vila das Palmeiras', { responsavel: 'Nina Prado', etapas: feito, concluir: true });
    },
    abertura: ['Da implantação concluída à ficha nas mãos do Crédito.', ['A ficha já vem preenchida', 'Os campos em azul', 'Enviar ao Crédito', 'Devolução, versões e PDF']],
    async gravar(t, cen) {
      const A = '1 · A ficha vem preenchida';
      await t.ir(`#/implantacao/${cen.fichaImp}`, 1800);
      await t.legenda('Ao concluir a implantação, a <b>ficha de transição</b> abre já preenchida com o formulário, a análise, o contrato e as etapas.', { etapa: A, ms: 600 });
      await t.ir(`#/implantacao/${cen.fichaImp}/ficha`, 2000);
      await t.legenda('O prazo para enviar ao Crédito é de <b>5 dias úteis</b> da conclusão, com lembrete 1 dia antes e no dia.', { etapa: A, ms: 600 });
      await t.pausa(2400);

      const B = '2 · Campos em azul';
      await t.legenda('Em preto, o que o portal já sabe. Em <b>azul</b>, o que só a Implantação sabe: subsíndico, consumo, fundo de reserva, não garantidos, particularidades.', { etapa: B, ms: 600 });
      await t.digitar('[data-k="subsindico"]', 'Subsíndica Fictícia (apto 302)', { atraso: 50 });
      await t.escolher('[data-k="balancete"]', 'Sim');
      await t.escolher('[data-k="consumo.0.tipo"]', 'Variável');
      await t.escolher('[data-k="conferidos.ata_taxa_extra"]', 'Não se aplica');
      await t.escolher('[data-k="conferidos.ata_receita"]', 'Conferida');
      await t.legenda('A seção <b>Outras observações</b> já vem com a Obs. do Controle; revise antes de enviar.', { etapa: B, ms: 500 });
      await t.mostrar('[data-k="outras_observacoes"]', 2400);
      await t.clicar('#btSalvarFicha', { depois: 2000 });

      const C = '3 · Enviar ao Crédito';
      await t.legenda('A tela diz para quem vai: a assistente de crédito do condomínio na Carteira (<b>Enviar para …</b>) ou, sem ela, a <b>supervisão de Crédito</b>, que escolhe a assistente; a escolhida fica gravada na Carteira.', { etapa: C, ms: 500 });
      await t.clicar('#btEnviarFicha', { depois: 900 });
      await t.clicar('#mFichaOk', { depois: 2600 });

      const D = '4 · Devolução, versões e PDF';
      await t.legenda('A assistente de crédito confirma o recebimento ou devolve com uma pergunta. Você responde ou envia uma <b>nova versão</b> (até 3), com o motivo.', { etapa: D, ms: 600 });
      await t.legenda('Cada versão tem o seu <b>PDF no papel timbrado</b> (-v1, -v2…) para guardar no CPD.', { etapa: D, ms: 600 });
      await t.rolar(4000);
      await t.pausa(2600);
    },
    resumo: ['A ficha abre na <b>conclusão</b>, já preenchida', 'Complete os <b>campos em azul</b> · 5 dias úteis', 'Envie ao Crédito · versões com PDF'],
  },

  {
    nome: 'implantacao-acompanhar',
    entrar: 'nina@myblue.com.br',
    inicio: '#/implantacao/dashboard',
    async preparar(cen, base) {
      const feito = { documentacao: { feito: true }, vouch: { id: '90011' }, boletos: { feito: true, primeiro_vencimento: diaUtil(15) }, envio: { forma: 'email' } };
      cen.acMarcado = await implantacaoTut(base, 'Residencial Vila das Palmeiras', { responsavel: 'Nina Prado', etapas: { ...feito, onboarding: { situacao: 'marcado', data: diaUtil(25), hora: '15:00' } } });
      await implantacaoTut(base, 'Edifício Mirante do Sol', { responsavel: 'Otto Reis', etapas: { documentacao: { feito: true }, vouch: { id: '90012' } }, extra: { antecipacao: 'sim', antecipacao_valor: 15000, antecipacao_data: diaUtil(12), antecipacao_prazo: 'desconta em 10 parcelas' } });
      await implantacaoTut(base, 'Condomínio Parque das Amostras');
    },
    abertura: ['O Painel de implantação, que substitui a planilha de controle.', ['Dashboard e filtros', 'Painel de atividades: Fila, Mês vigente e Controle', 'Pendências de onboarding e documentação', 'Depois da conclusão e parâmetros']],
    async gravar(t) {
      const A = '1 · Dashboard';
      await t.legenda('No menu, <b>Painel de implantação</b> reúne o que a planilha calculava. A gestão abre no <b>Dashboard</b>; a assistente, no Painel de atividades.', { etapa: A, ms: 600 });
      await t.mostrar(menu('#/implantacao'), 1800, { dx: 0.3 });
      await t.legenda('Só indicadores: contratos do ano, <b>% médio de conclusão</b> (etapas feitas ÷ 5), concluídos, em andamento e não iniciados; o <b>prazo para concluir</b> por assistente.', { etapa: A, ms: 500 });
      await t.mostrar('.cards-acomp', 2800, { dx: 0.4 });
      await t.legenda('Os filtros (ano, mês, assistente, executivo e a busca) ficam lembrados para a próxima visita. O botão <b>Excel</b> baixa a tela aberta.', { etapa: A, ms: 500 });
      await t.mostrar('.filtros-acomp', 2400);
      await t.legenda('O <b>progresso por etapa</b> aponta o gargalo; o gráfico mostra contratos e concluídos por mês.', { etapa: A, ms: 400 });
      await t.mostrar('.barra-acomp', 2600);

      const B = '2 · Painel de atividades';
      await t.ir('#/implantacao/atividades/fila', 1600);
      await t.legenda('<b>Fila</b>: o que está em aberto, do que pede ação primeiro, com as 5 etapas em selos, o prazo para concluir e as pendências.', { etapa: B, ms: 600 });
      await t.pausa(2600);
      await t.ir('#/implantacao/atividades/mes', 1600);
      await t.legenda('As implantações do mês do contrato, na ordem do 1º vencimento, com as 5 etapas e a faixa de conclusão. Do dia 25 em diante, já mostra o mês seguinte.', { etapa: B, ms: 600 });
      await t.pausa(3000);
      await t.ir('#/implantacao/atividades/controle', 1600);
      await t.legenda('<b>Controle</b>, visão <b>Resumida</b>: agrupada por mês, com o % e as 5 etapas em selos (verde feita, âmbar falta). A <b>Obs.</b> quem conduz escreve na célula; ela vai para a ficha de transição.', { etapa: B, ms: 600 });
      await t.mostrar('.ctrl-acomp', 3000, { dx: 0.3 });
      await t.legenda('Escolha o <b>mês do contrato</b> nos botões de cima; as pílulas filtram <b>em andamento</b>, <b>só falta o onboarding</b> ou <b>concluídas</b>.', { etapa: B, ms: 400 });
      await t.mostrar('.meses-ctrl', 1800);
      await t.clicar('[data-sit="andamento"]', { depois: 1800 });
      await t.legenda('<b>Editar</b> (quem conduz e a coordenação) abre as 5 etapas para marcar e <b>Salvar e concluir</b>. Importada que já está na Carteira só é ligada ao cadastro: nada é criado lá.', { etapa: B, ms: 400 });
      await t.clicar('[data-etapas]', { depois: 2600 });
      await t.clicar('.modal [data-fechar]', { depois: 600 });
      await t.legenda('<b>Planilha completa</b> mostra todas as colunas da planilha (CNPJ, administradora, síndico, datas). O Excel sai sempre completo.', { etapa: B, ms: 400 });
      await t.clicar('[data-visao="completa"]', { depois: 2400 });
      await t.clicar('[data-visao="resumida"]', { depois: 600 });
      await t.clicar('[data-sit="todas"]', { depois: 800 });

      const C = '3 · Pendências';
      await t.ir('#/implantacao/dashboard', 1600);
      await t.legenda('No Dashboard, <b>Pendências para acompanhar</b>: o onboarding, até 30 dias depois do 1º vencimento (meta de 90%), do prazo mais curto para o mais longo. <b>Cobrar</b> avisa a assistente que conduz.', { etapa: C, ms: 600 });
      await t.mostrar('#pendDash', 3000);
      await t.clicar('[data-pend="doc"]', { depois: 1400 });
      await t.legenda('<b>Documentação</b>: convenção, ata de eleição, ata da taxa ordinária e procuração em até 60 dias do envio do formulário.', { etapa: C, ms: 600 });
      await t.legenda('Faltando algo do executivo, <b>Cobrar</b> manda a ele, no portal e por e-mail, o que falta; faltando 3 dias, o portal lembra sozinho. A <b>procuração</b> fica com a Implantação.', { etapa: C, ms: 400 });
      await t.mostrar('[data-doc-acomp]', 2600);
      await t.legenda('Clique num documento que falta para anexar ou marcar recebido. <b>Marcar à mão</b> registra a meta com o motivo.', { etapa: C, ms: 300 });
      await t.mostrar('[data-marcar]', 2600);

      const D = '4 · Depois da conclusão e parâmetros';
      await t.ir('#/implantacao/depois/antecipacoes', 1600);
      await t.legenda('<b>Antecipações</b>: marque e envie ao <b>Controle de Repasses</b>; o Gestor de lá confirma e a situação volta para cá (cadastrada, com ajuste ou devolvida).', { etapa: D, ms: 600 });
      await t.pausa(2400);
      await t.ir('#/implantacao/depois/fichas', 1600);
      await t.legenda('<b>Fichas de transição</b>: o prazo de 5 dias úteis de cada ficha, as atrasadas (a coordenação cobra) e as devolvidas.', { etapa: D, ms: 600 });
      await t.pausa(2400);
      await t.ir('#/implantacao/atividades/pos', 1600);
      await t.legenda('<b>Pós-implantação</b>: espólios, levantamento de pendências e 1ª prestação de contas de cada implantação, com o prazo em dias úteis, a devolutiva da Análise de Espólio e o Cobrar da coordenação.', { etapa: D, ms: 600 });
      await t.pausa(2600);
      await t.ir('#/implantacao/parametros', 1600);
      await t.legenda('Os prazos e metas ficam em <b>Parâmetros</b>: a coordenação ajusta, e cada mudança vale a partir da data escolhida.', { etapa: D, ms: 600 });
      await t.mostrar('#pmOnb', 2800);
    },
    resumo: ['<b>Painel de implantação</b> no menu', 'Dashboard · Painel de atividades (Fila, Mês vigente, Controle, Pós-implantação)', 'Depois da conclusão: Carteira, <b>Fichas</b> e Antecipações · <b>Parâmetros</b>'],
  },

  /* ======================= Solicitação de Contrato ======================= */
  {
    nome: 'contrato-solicitar',
    entrar: 'vera@myblue.com.br',
    inicio: '#/contratos',
    async preparar(cen, base) {
      cen.analiseCt = await analiseCr(base, FORM_CR, { liberar: true });
      cen.ctMinuta = await contratoTut(base, 'Edifício Mirante do Sol', { ate: 'minuta' });
    },
    abertura: ['Da negociação fechada com o síndico ao contrato assinado.', ['Pedir a partir da análise', 'Condições, vigência e primeiro vencimento', 'Objeções e solicitações', 'Enviar, ajuste e assinatura']],
    async gravar(t, cen) {
      const A = '1 · Nova solicitação';
      await t.legenda('No menu <b>Jurídico</b>, a <b>Solicitação de Contrato</b> substitui o formulário do Forms e o e-mail com o PDF.', { etapa: A, ms: 600 });
      await t.mostrar(menu('#/contratos'), 1800, { dx: 0.3 });
      await t.legenda('Clique em <b>Nova solicitação</b> e escolha a análise: os dados vêm preenchidos.', { etapa: A, ms: 400 });
      await t.clicar('#btNovoCt', { depois: 1400 });
      await t.mostrar('.modal .grade-3', 2800, { dx: 0.5 });
      await t.clicar('input[name=anCt]', { depois: 900 });
      await t.clicar('#mCtOk', { depois: 2200 });

      const B = '2 · Condições';
      await t.legenda('Complete o síndico. O <b>CPF</b> é conferido na hora.', { etapa: B, ms: 400 });
      await t.digitar('#c_sindico_nome', 'Síndico Fictício', { atraso: 35 });
      await t.digitar('#c_sindico_cpf', '111.444.777-35', { atraso: 55 });
      await t.digitar('#c_sindico_email', 'sindico@exemplo.com', { atraso: 30 });
      await t.digitar('#c_sindico_telefone', '(85) 90000-0000', { atraso: 45 });
      await t.legenda('Taxa e boleto negociados: embaixo fica o valor da análise, e a diferença aparece para o Jurídico.', { etapa: B, ms: 500 });
      await t.mostrar('#c_taxa_adm', 2400);
      await t.legenda('Marque o que vamos garantir. <b>Fundo de obras</b> não está no contrato-modelo: o portal avisa para confirmar com o Jurídico.', { etapa: B, ms: 400 });
      await t.clicar('[data-marca-ct=garantias][value="Taxa ordinária"]', { depois: 500 });
      await t.legenda('A taxa extra aparece em % da ordinária: acima de 40%, a diretoria decide antes da minuta.', { etapa: B, ms: 400 });
      await t.mostrar('#c_taxa_extra', 2600);
      await t.clicar('input[name=c_cashback][value=nao]', { depois: 500 });
      await t.preencherCampo('#c_inicio_contrato', dia1());
      await t.preencherCampo('#c_primeiro_vencimento', dia10());

      const C = '3 · Objeções e solicitações';
      await t.legenda('O síndico pediu para mudar alguma cláusula? Marque em <b>Objeções e Solicitações de modificação de contrato</b> e responda a pergunta, quando houver. O que é decisão da diretoria vai para ela.', { etapa: C, ms: 500 });
      await t.clicar('[data-pedido=foro_capital]', { depois: 900 });
      await t.legenda('Para o foro, escreva qual: a mudança só pode ser para a capital do estado de origem do contrato.', { etapa: C, ms: 300 });
      await t.digitar('[data-pedido-det=foro_capital]', 'Fortaleza/CE', { atraso: 60, depois: 1200 });
      await t.legenda('Em <b>Outras solicitações</b> (opcional), escreva qualquer outra tratativa.', { etapa: C, ms: 300 });
      await t.digitar('#c_minucias', 'Primeiro repasse adiantado em 5 dias.', { atraso: 30 });

      const D = '4 · Enviar e acompanhar';
      await t.legenda('Em Documentos, a convenção vem da análise. Sem ela, o portal avisa: o contrato não é assinado sem a convenção. Os documentos do síndico ficam para a Implantação.', { etapa: D, ms: 3400 });
      await t.legenda('<b>Enviar ao Jurídico</b>: sai o protocolo CT, e o Jurídico tem <b>72h úteis</b> para a minuta.', { etapa: D, ms: 400 });
      await t.clicar('#btEnviarCt', { depois: 2800 });
      await t.ir(`#/contratos/${cen.ctMinuta}`, 1800);
      await t.legenda('Quando a minuta chega, leve ao síndico. Pediu mudança? <b>Pedir ajuste</b>: volta para o Jurídico com mais 72h úteis.', { etapa: D, ms: 400 });
      await t.mostrar('#btAjusteCt', 2600);
      await t.legenda('Aprovou? <b>Síndico aprovou: pedir assinatura</b>. O Jurídico manda assinar, anexa a via assinada e registra as condições fechadas. Você é avisado em cada passo e, no fim, clica em <b>Solicitar implantação</b>.', { etapa: D, ms: 400 });
      await t.mostrar('#btPedirAssCt', 3600);
      await t.legenda('Todos os seus contratos, até os assinados, ficam em <b>Acompanhamento de demandas Jurídicas → Controle</b>.', { etapa: D, ms: 300 });
      await t.ir('#/acompanhamento-contratos/controle', 1800);
      await t.mostrar(menu('#/acompanhamento-contratos'), 2400, { dx: 0.3 });
    },
    resumo: ['<b>Nova solicitação</b> · escolha a análise', 'Condições, vigência, primeiro vencimento e objeções do síndico', '<b>Enviar ao Jurídico</b> · ajuste · <b>Contrato assinado</b>'],
  },
  {
    nome: 'contrato-elaborar',
    entrar: 'lara@myblue.com.br',
    inicio: '#/contratos/fila',
    async preparar(cen, base) {
      cen.ctFila = await contratoTut(base, 'Residencial Vila das Palmeiras');
      cen.ctAssinado = await contratoTut(base, 'Edifício Mirante do Sol', { ate: 'assinado' });
      cen.ctParaAssinar = await contratoTut(base, 'Condomínio Parque das Águas', { ate: 'para_assinar' });
    },
    abertura: ['Da fila do Jurídico ao contrato assinado, com as condições fechadas.', ['Assumir da fila', 'Pedidos com a resposta padrão', 'Minuta, ajustes e assinatura', 'Registrar as condições fechadas', 'Dashboard Jurídico']],
    async gravar(t, cen) {
      const A = '1 · Fila';
      await t.legenda('Quando o comercial envia, quem elabora recebe o aviso no sino e por e-mail. A <b>Fila do Jurídico</b> mostra o prazo de cada minuta.', { etapa: A, ms: 600 });
      await t.mostrar('#tbCt', 2600);
      await t.clicar(`#tbCt tr[data-id="${cen.ctFila}"]`, { depois: 1800 });
      await t.legenda('Clique em <b>Assumir</b>. Dá para passar para um colega a qualquer momento.', { etapa: A, ms: 400 });
      await t.clicar('#btAssumirCt', { depois: 2000 });

      const B = '2 · Minuta';
      await t.legenda('A solicitação mostra o que mudou da análise, os avisos do manual e as <b>objeções e solicitações do síndico, com a resposta padrão</b>.', { etapa: B, ms: 600 });
      await t.rolar(700);
      await t.pausa(2400);
      await t.legenda('Anexe a minuta em Documentos e clique em <b>Enviar minuta ao comercial</b>. Cada versão fica guardada.', { etapa: B, ms: 3200 });
      await t.legenda('Faltou informação? <b>Devolver com pendência</b>: o reenvio volta para você, com novo prazo.', { etapa: B, ms: 400 });
      await t.mostrar('#btPendCt', 2400);

      const S = '3 · Assinatura';
      await t.legenda('O que vai para assinatura fica no menu <b>Jurídico → Acompanhamento de demandas Jurídicas</b>.', { etapa: S, ms: 200 });
      await t.ir('#/acompanhamento-contratos/assinaturas', 1800);
      await t.mostrar(menu('#/acompanhamento-contratos'), 1600, { dx: 0.3 });
      await t.legenda('Quando o executivo informa que o síndico aprovou, a minuta aparece na aba <b>Assinaturas</b> como <b>Pronto para assinatura</b>.', { etapa: S, ms: 600 });
      await t.mostrar('#corpoCt section.painel', 2600);
      await t.legenda('Mande para assinatura e clique em <b>Enviado para assinatura</b> (com uma observação, se quiser). O executivo é avisado.', { etapa: S, ms: 400 });
      await t.clicar(`[data-acao-ass="para_assinar"][data-c="${cen.ctParaAssinar}"]`, { depois: 900 });
      await t.digitar('#mObsAssCt', 'Enviado pela Clicksign ao síndico.', { atraso: 40 });
      await t.clicar('#mEmAssOk', { depois: 2000 });
      await t.legenda('Voltou a via assinada? <b>Assinado</b>: anexe o contrato assinado ali mesmo. Sem convenção, o portal avisa para pedir antes de assinar.', { etapa: S, ms: 3200 });

      const C = '4 · Condições fechadas';
      await t.ir(`#/contratos/${cen.ctAssinado}`, 1800);
      await t.legenda('Com o contrato assinado anexado, você registra as <b>condições fechadas</b>. Elas vêm do pedido: corrija o que mudou na negociação.', { etapa: C, ms: 1200 });
      await t.mostrar('#fechadoCt', 2400);
      await t.digitar('#c_f_taxa_adm', '2,9', { atraso: 80 });
      await t.legenda('Foro e prazo de contestação já vêm com o que o síndico pediu. Para cada cláusula pedida, diga como ficou e, se quiser, a redação.', { etapa: C, ms: 800 });
      for (const sel of await t.p.$$('[data-clausula] [data-k=resultado]')) { await sel.scrollIntoViewIfNeeded(); await sel.selectOption('aceito'); await t.pausa(900); }
      await t.legenda('<b>Salvar</b> guarda sem concluir e mostra o que ainda falta: aqui, os <b>honorários</b> de cobrança extrajudicial.', { etapa: C, ms: 300 });
      await t.clicar('#btFechSalvar', { depois: 2600 });
      await t.clicar('input[name=c_f_honorarios_op][value="12"]', { depois: 900 });
      await t.legenda('<b>Concluir contrato</b>: o contrato fica como assinado e o executivo é avisado para <b>solicitar a implantação</b>, que já vem com essas condições.', { etapa: C, ms: 600 });
      await t.clicar('#btFechConcluir', { depois: 1000 });
      await t.clicar('#mOk', { depois: 2600 });
      const P = '5 · Dashboard Jurídico';
      await t.legenda('O <b>Dashboard Jurídico</b>, no menu Jurídico, mostra o mês ou o ano: solicitados, alterações, assinaturas e fechados, e a situação de agora.', { etapa: P, ms: 200 });
      await t.ir('#/dashboard-juridico', 1800);
      await t.mostrar(menu('#/dashboard-juridico'), 1600, { dx: 0.3 });
      await t.legenda('O <b>comparativo mês a mês</b>: solicitados, aguardando assinatura, em assinatura e assinados, com a diferença para o mês anterior.', { etapa: P, ms: 300 });
      await t.mostrar('.chart-ct svg', 3400);
      await t.rolar(700);
      await t.legenda('Depois, a situação de agora, os tempos médios e quem está com cada contrato. Os encerrados ficam em Acompanhamento de demandas Jurídicas → <b>Controle</b>.', { etapa: P, ms: 3200 });
    },
    resumo: ['<b>Assumir</b> · 72h úteis para a minuta', '<b>Enviar minuta</b> · ajustes · <b>Enviado para assinatura</b> · <b>Assinado</b>', 'Registre as condições fechadas · <b>Concluir</b> · Dashboard Jurídico'],
  },

  {
    nome: 'juridico-demandas-pedir',
    entrar: 'vera@myblue.com.br',
    inicio: '#/',
    async preparar(cen, base) { cen.dj = await demandasTut(base); },
    abertura: ['Tudo o que você pede ao Jurídico, com prazo e acompanhamento.', ['Abrir uma demanda', 'O prazo de entrega', 'Minhas demandas', 'Responder ao Jurídico']],
    async gravar(t, cen) {
      const A = '1 · Nova demanda';
      await t.legenda('Aditivo, rescisão, análise de contrato de fornecedor, parecer: o que você pede ao Jurídico fica em <b>Jurídico → Demandas Jurídicas</b>.', { etapa: A, ms: 300 });
      await t.clicar(menu('#/demandas-juridicas'), { depois: 1800, dx: 0.3 });
      await t.legenda('Clique em <b>Nova demanda</b>.', { etapa: A, ms: 200 });
      await t.clicar('#btNovaDj', { depois: 900 });
      await t.legenda('Escolha a <b>atividade</b>: cada uma tem o seu prazo em horas úteis (8h = 1 dia útil), contado a partir do dia seguinte.', { etapa: A, ms: 300 });
      await t.escolher('#djTipo', 'Aditivo (16h úteis)', { depois: 600 });
      await t.mostrar('#djPrazo', 2600);
      await t.legenda('Informe o <b>cliente</b> (a lista sugere os condomínios da Base de Clientes) e o que precisa ser feito.', { etapa: A, ms: 300 });
      await t.digitar('#djCliente', 'Residencial Vila das Palmeiras');
      await t.digitar('#djObjeto', 'Aditivo para incluir o seguro da obra na taxa extra', { atraso: 30 });
      await t.legenda('<b>Enviar ao Jurídico</b>: o Jurídico recebe o aviso na hora, e o portal mostra o número e o prazo de entrega.', { etapa: A, ms: 300 });
      await t.clicar('#djOk', { depois: 2600 });

      const B = '2 · Acompanhar';
      await t.legenda('Em <b>Minhas demandas</b> ficam todas as suas: a situação, o prazo, a entrega e se saiu dentro do prazo (SLA).', { etapa: B, ms: 600 });
      await t.mostrar('#tbDj', 3000);
      await t.legenda('O Jurídico mudou a situação? Você recebe o aviso. Esta está <b>Aguardando retorno</b>: o Jurídico precisa de algo seu.', { etapa: B, ms: 300 });
      await t.clicar(`#tbDj tr[data-id="${cen.dj.retornoVera}"]`, { depois: 1600 });
      await t.mostrar('.modal dl.info-ticket', 2600);
      await t.legenda('Responda pelo <b>comentário</b>: o Jurídico recebe o aviso, e tudo fica no histórico da demanda.', { etapa: B, ms: 300 });
      await t.digitar('#djComent', 'Ata enviada por e-mail agora há pouco.', { atraso: 35 });
      await t.clicar('#djComentOk', { depois: 2400 });
      await t.legenda('Contrato de garantia de condomínio novo continua na <b>Solicitação de Contrato</b>: ele aparece aqui sozinho.', { etapa: B, ms: 3400 });
    },
    resumo: ['<b>Jurídico → Demandas Jurídicas</b> · <b>Nova demanda</b>', 'Atividade, cliente e objeto · prazo em dias úteis', 'Acompanhe em <b>Minhas demandas</b> e responda pelo comentário'],
  },
  {
    nome: 'juridico-demandas-conduzir',
    entrar: 'lara@myblue.com.br',
    inicio: '#/demandas-juridicas/todas',
    async preparar(cen, base) {
      cen.dj = await demandasTut(base);
      cen.ctMinuta = await contratoTut(base, 'Edifício Mirante do Sol', { ate: 'minuta' });
    },
    abertura: ['A planilha de acompanhamento do Jurídico, dentro do portal.', ['Todas as demandas e as atrasadas', 'Responsável, situação e entrega', 'Lançar pelo solicitante', '% no SLA por atividade', 'Tabela de prazos']],
    async gravar(t, cen) {
      const A = '1 · Todas as demandas';
      await t.legenda('Em <b>Todas as demandas</b>, os números de agora. A lista abre nas em aberto, com os pedidos da <b>Solicitação de Contrato</b> junto.', { etapa: A, ms: 600 });
      await t.mostrar('#tilesDj', 3000);
      await t.legenda('<b>Atrasada</b> não é um status que alguém marca: é a demanda sem entrega com o prazo vencido. Clique no quadro para filtrar.', { etapa: A, ms: 300 });
      await t.clicar('[data-tile="atrasada"]', { depois: 1600 });

      const B = '2 · Conduzir';
      await t.clicar(`#tbDj tr[data-id="${cen.dj.atrasada}"]`, { depois: 1600 });
      await t.legenda('Escolha o <b>responsável</b> e mude a <b>situação</b>. Quem pediu recebe o aviso a cada mudança.', { etapa: B, ms: 300 });
      await t.escolher('#djResp', 'Lara Mendes', { depois: 700 });
      await t.escolher('#djStatus', 'Aguardando assinaturas', { depois: 900 });
      await t.legenda('Ao passar para <b>Aguardando assinaturas</b> ou <b>Concluído</b>, a data da entrega vem com hoje (dá para corrigir). É ela que conta no SLA.', { etapa: B, ms: 600 });
      await t.mostrar('#djEntrega', 1800);
      await t.clicar('#djSalvar', { depois: 2000 });

      const C = '3 · Lançar pelo solicitante';
      await t.legenda('Pedido que chegou por e-mail ou WhatsApp? Lance em <b>Nova demanda</b>, escolhendo quem pediu: o setor e o estado vêm do cadastro.', { etapa: C, ms: 300 });
      await t.clicar('#btNovaDj', { depois: 900 });
      await t.escolher('#djTipo', 'Parecer (24h úteis)', { depois: 500 });
      await t.digitar('#djCliente', 'Condomínio Solar do Bosque');
      await t.digitar('#djObjeto', 'Parecer sobre a cobrança de multa de mudança', { atraso: 30 });
      await t.escolher('#djSolic', 'Bruna Reis', { depois: 900 });
      await t.legenda('A <b>data da solicitação</b> pode ser de outro dia: o prazo é contado a partir dela.', { etapa: C, ms: 300 });
      await t.mostrar('#djData', 1800);
      await t.clicar('#djOk', { depois: 2400 });

      const D = '4 · Solicitação de Contrato';
      await t.legenda('Os contratos pedidos pelo comercial entram aqui sozinhos, com o prazo de 72h úteis da minuta. A primeira minuta enviada conta como a entrega.', { etapa: D, ms: 300 });
      await t.escolher('#fStDj', 'Em aberto', { depois: 600 });
      await t.escolher('#fOrDj', 'Só a Solicitação de Contrato', { depois: 1400 });
      await t.mostrar(`#tbDj tr[data-id="ct-${cen.ctMinuta}"]`, 2600);
      await t.escolher('#fOrDj', 'Lançadas aqui e contratos', { depois: 800 });

      const E = '5 · Indicadores';
      await t.legenda('Em <b>Indicadores (SLA)</b>, o % entregue no prazo por atividade e por mês, como no Resumo SLA da planilha, e por setor.', { etapa: E, ms: 300 });
      await t.clicar('nav.abas a[href="#/demandas-juridicas/indicadores"]', { depois: 1800 });
      await t.mostrar('#corpoDj section.painel table', 3600);
      await t.rolar(500);
      await t.pausa(1600);

      const F = '6 · Tabela de prazos';
      await t.legenda('Na <b>Tabela de prazos</b>, o Jurídico ajusta as horas de cada atividade. As demandas não entregues são recalculadas; as entregues guardam o SLA que tiveram.', { etapa: F, ms: 300 });
      await t.clicar('nav.abas a[href="#/demandas-juridicas/prazos"]', { depois: 1800 });
      await t.mostrar('#corpoDj table', 3200);
      await t.legenda('No dia do prazo e quando ele passa, quem é responsável recebe o aviso no sino e por e-mail. <b>Baixar planilha</b> leva a lista para o Excel.', { etapa: F, ms: 3600 });
    },
    resumo: ['<b>Todas as demandas</b> · atrasadas automáticas', 'Responsável e situação · a entrega conta no SLA', '<b>Indicadores (SLA)</b> e <b>Tabela de prazos</b>'],
  },

  /* ======================= Gestão do setor ======================= */
  {
    nome: 'gestao-usuarios',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/usuarios',
    abertura: ['Para coordenadores e supervisores.', ['Criar o acesso de alguém do setor', 'Liberar ferramentas', 'Redefinir a senha']],
    async gravar(t) {
      await t.legenda('Em <b>Gestão do setor → Usuários do setor</b> ficam as pessoas do seu setor.', { etapa: '1 · Usuários do setor', ms: 3400 });
      const N = '2 · Novo usuário';
      await t.legenda('Clique em <b>Novo usuário</b> e preencha o nome, o e-mail (que é o login), a data de nascimento e a de admissão.', { etapa: N, ms: 300 });
      await t.clicar('#btNovoUsu', { depois: 800 });
      await t.digitar('#uNome', 'Rita Campos');
      await t.digitar('#uEmail', 'rita@myblue.com.br');
      await t.legenda('A <b>data de nascimento</b> e a <b>data de admissão</b> são obrigatórias.', { etapa: N, ms: 300 });
      await t.preencherCampo('#uNasc', '1994-03-18');
      await t.preencherCampo('#uAdm', hoje());
      await t.legenda('O <b>setor</b> já vem marcado: a pessoa entra na equipe do setor na Central de Tickets.', { etapa: N, ms: 300 });
      await t.mostrar('input[name=uSetor]', 2600);
      await t.legenda('Marque as <b>ferramentas</b> do setor que a pessoa vai usar.', { etapa: N, ms: 300 });
      await t.clicar('input[name=uMod][value=credito]', { depois: 500 });
      await t.clicar('input[name=uMod][value=boletos]', { depois: 700 });
      await t.legenda('Deixe a senha em branco: o portal gera uma <b>temporária</b>. Clique em <b>Criar usuário</b>.', { etapa: N, ms: 1600 });
      await t.clicar('#btSalvarU', { depois: 1500 });
      await t.legenda('Copie os dados e envie para a pessoa. No 1º acesso ela cria a senha dela.', { etapa: N, ms: 300 });
      await t.mostrar('#btCopiar', 3000);
      await t.clicar(fecharModal, { depois: 1200 });
      const E = '3 · Editar';
      await t.legenda('Para liberar outra ferramenta ou redefinir a senha, clique na pessoa.', { etapa: E, ms: 300 });
      await t.clicar('#tbUsu tr:has-text("Davi Rocha")', { depois: 1000 });
      await t.clicar('input[name=uMod][value=boletos]', { depois: 800 });
      await t.legenda('<b>Redefinir senha</b> gera uma senha temporária nova. Para bloquear o acesso, desmarque <b>Usuário ativo</b>.', { etapa: E, ms: 400 });
      await t.mostrar('#btResetSenha', 2000);
      await t.mostrar('#uAtivo', 2000);
      await t.clicar('#btSalvarU', { depois: 2000 });
    },
    resumo: ['<b>Novo usuário</b>: nome, e-mail, nascimento, admissão e ferramentas', 'Envie a senha temporária para a pessoa', 'Clique na pessoa para liberar ferramentas ou redefinir a senha'],
  },

  {
    nome: 'gestao-ferramentas',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/modulos',
    abertura: ['Para coordenadores e supervisores.', ['Enviar o HTML novo de uma ferramenta', 'Voltar para uma versão anterior', 'Quem abre, como e com qual papel', 'Cadastrar uma ferramenta nova', 'Quem edita a carteira']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Ferramentas do setor</b> ficam as ferramentas dos seus setores. Clique numa delas.', { etapa: '1 · Ferramentas do setor', ms: 2600 });
      await t.clicar('tr[data-slug="boletos"]', { depois: 1200 });
      const H = '2 · Atualizar o HTML';
      await t.legenda('A ferramenta mudou? Envie o <b>arquivo .html novo</b> aqui. Quem abrir já recebe a versão nova.', { etapa: H, ms: 600 });
      await t.enviarArquivo('#zArq', '#inArq', cen.rec.html, { depois: 2600 });
      await t.legenda('A versão anterior fica guardada. Em <b>Versões anteriores</b>, <b>Usar esta</b> volta para ela.', { etapa: H, ms: 300 });
      await t.clicar('summary:has-text("Versões anteriores")', { depois: 1200 });
      await t.mostrar('[data-versao]', 2600);
      const Q = '3 · Quem abre e com qual papel';
      await t.legenda('Em <b>Quem abre e com qual papel</b>, marque quem usa a ferramenta. Coordenação e administração abrem sempre.', { etapa: Q, ms: 300 });
      await t.rolar(520, '#edAcessos');
      await t.clicar('.fundo-modal [data-filtro="setor"]', { depois: 900 });
      await t.clicar('.fundo-modal tr:has-text("Davi Rocha") [data-abre]', { depois: 900 });
      await t.legenda('Em <b>Todas as pessoas</b> você libera também gente de <b>outros setores</b>.', { etapa: Q, ms: 300 });
      await t.clicar('.fundo-modal [data-filtro="todas"]', { depois: 900 });
      await t.clicar('.fundo-modal tr:has-text("Marcos Lima") [data-abre]', { depois: 700 });
      await t.legenda('Em <b>Como</b>, escolha se a pessoa <b>edita</b> ou <b>só consulta</b>: quem só consulta vê tudo, mas não grava.', { etapa: Q, ms: 300 });
      await t.escolher('.fundo-modal tr:has-text("Marcos Lima") [data-como]', 'só consulta', { depois: 900 });
      await t.clicar('#btSalvarAcessos', { depois: 2200 });
      await t.legenda('Se a ferramenta tiver <b>papéis</b> (ex.: Gestão, Financeiro), eles aparecem em colunas na mesma tabela.', { etapa: Q, ms: 3200 });
      await t.clicar('.fundo-modal [data-fechar]', { depois: 900 });
      const N = '4 · Ferramenta nova';
      await t.legenda('<b>Nova ferramenta</b> cadastra uma ferramenta do seu setor: nome, setor e ícone.', { etapa: N, ms: 300 });
      await t.clicar('#btNovaFerr', { depois: 900 });
      await t.digitar('#nNome', 'Agenda do Crédito', { depois: 900 });
      await t.legenda('Ela fica <b>aguardando aprovação</b>: só a coordenação abre até a administração conferir o HTML e aprovar.', { etapa: N, ms: 3600 });
      await t.clicar('.fundo-modal [data-fechar]', { depois: 800 });
      const C = '5 · Carteira: quem edita';
      await t.legenda('<b>Carteira de condomínios: quem edita</b> mostra quem pode editar cada coisa na carteira, e por quê.', { etapa: C, ms: 300 });
      await t.clicar('#btCartAcessos', { depois: 2400 });
      await t.legenda('Na coluna do seu setor, você libera pessoas da equipe. O resto é configurado pela administração.', { etapa: C, ms: 300 });
      await t.rolar(620, '#edCart');
      await t.pausa(2600);
      await t.clicar('.fundo-modal [data-fechar]', { depois: 800 });
    },
    resumo: ['<b>Ferramentas do setor</b> → clique na ferramenta', 'Envie o HTML novo · <b>Versões anteriores</b> para voltar', '<b>Quem abre</b>: do setor ou de outros, edita ou só consulta, papel', '<b>Nova ferramenta</b>: aguarda a aprovação da administração', '<b>Carteira: quem edita</b>: libere pessoas na coluna do seu setor'],
  },

  {
    nome: 'gestao-equipe',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/equipes',
    abertura: ['Para coordenadores e supervisores.', ['Quem é líder do setor', 'Os tipos de demanda, com prazo e prioridade']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Equipe e tipos de demanda</b>, clique no seu setor.', { etapa: '1 · Equipe', ms: 2200 });
      await t.clicar('[data-setor]', { depois: 1200 });
      await t.legenda('A equipe vem do cadastro das pessoas. Marque quem é <b>líder</b>: o líder distribui os tickets do setor.', { etapa: '1 · Equipe', ms: 500 });
      await t.clicar(`input[name=eLider][value="${cen.id['bruna@myblue.com.br']}"]`, { depois: 900 });
      await t.clicar('#btSalvarEquipe', { depois: 1800 });
      const T = '2 · Tipos de demanda';
      await t.clicar('[data-setor]', { depois: 1200 });
      await t.legenda('Os <b>tipos de demanda</b> organizam a fila: cada um tem o prazo em <b>horas úteis</b> e a prioridade.', { etapa: T, ms: 600 });
      await t.digitar('#nCat', '2ª via de prestação de contas');
      await t.digitar('#nPrazo', '9');
      await t.escolher('#nPrio', { value: 'alta' });
      await t.clicar('#btAddCat', { depois: 2200 });
      await t.legenda('9 horas úteis = 1 dia útil. Para mudar um tipo, edite e clique em <b>Salvar tipos</b>.', { etapa: T, ms: 400 });
      await t.mostrar('#btSalvarCats', 2400);
      await t.legenda('Desmarque <b>ativo</b> para tirar um tipo da lista sem perder o histórico dos tickets.', { etapa: T, ms: 400 });
      await t.mostrar('[data-campo=ativo]', 2800);
      await t.clicar(fecharModal, { depois: 800 });
    },
    resumo: ['Clique no setor → marque os <b>líderes</b> e salve', 'Tipos de demanda: nome, prazo (horas úteis) e prioridade', 'Desative em vez de apagar'],
  },

  {
    nome: 'gestao-carteira',
    entrar: 'lia@myblue.com.br',
    inicio: '#/carteira',
    abertura: ['Para coordenadores e supervisores.', ['Trocar o responsável de um condomínio', 'Transferir a carteira de uma pessoa']],
    async gravar(t) {
      const C = '1 · Um condomínio';
      await t.legenda('Coordenador e supervisor trocam o responsável <b>do setor deles</b> na carteira. Clique no condomínio.', { etapa: C, ms: 300 });
      await t.clicar('#tbC tr:has-text("Ed. Aurora")', { depois: 1200 });
      await t.legenda('Só o campo do seu setor fica liberado. Escolha a pessoa (NOME - RAMAL) e salve.', { etapa: C, ms: 300 });
      await t.digitar('#cd_analista_cobranca', 'MARCOS LIMA - 4701', { atraso: 40 });
      await t.clicar('#btCdOk', { depois: 2000 });
      const T = '2 · Transferir';
      await t.legenda('Quando alguém sai ou a carteira é redistribuída, use <b>Transferir</b> na aba <b>Equipes</b>.', { etapa: T, ms: 300 });
      await t.clicar('nav.abas a[href="#/carteira/responsaveis"]', { depois: 1600 });
      await t.clicar('[data-transferir^="analista_cobranca|MARCOS"]', { depois: 1000 });
      await t.digitar('#trPara', 'ANA COSTA - 4702', { atraso: 40 });
      await t.legenda('Desmarque os condomínios que continuam com a pessoa e clique em <b>Transferir</b>.', { etapa: T, ms: 300 });
      await t.clicar('input[name=trC] >> nth=0', { depois: 500 });
      await t.clicar('input[name=trC] >> nth=1', { depois: 700 });
      await t.clicar('#btTrOk', { depois: 2400 });
      await t.legenda('Cada mudança fica no <b>histórico</b> do condomínio.', { etapa: T, ms: 2800 });
    },
    resumo: ['Clique no condomínio → troque o responsável do seu setor', 'Aba <b>Equipes</b> → <b>Transferir</b> a carteira', 'Tudo fica no histórico'],
  },

  /* ======================= Administração ======================= */
  {
    nome: 'admin-usuarios',
    entrar: 'admin@myblue.com.br',
    inicio: '#/admin/usuarios',
    abertura: ['Só para a administração.', ['Perfis: usuário, supervisor, coordenador, administrador', 'O setor no cadastro', 'Marcações de supervisão e da Central de Links']],
    async gravar(t) {
      await t.legenda('Em <b>Usuários e acessos</b> ficam todas as pessoas do portal: perfil, setor e ferramentas.', { etapa: '1 · Usuários', ms: 3200 });
      const N = '2 · Novo usuário';
      await t.clicar('#btNovoUsu', { depois: 800 });
      await t.digitar('#uNome', 'Otávio Neves');
      await t.digitar('#uEmail', 'otavio@myblue.com.br');
      await t.legenda('A <b>data de nascimento</b> e a <b>data de admissão</b> são obrigatórias.', { etapa: N, ms: 300 });
      await t.preencherCampo('#uNasc', '1988-07-02');
      await t.preencherCampo('#uAdm', hoje());
      await t.legenda('Escolha o <b>perfil</b>. Coordenador e supervisor gerenciam os setores marcados no cadastro.', { etapa: N, ms: 600 });
      await t.clicar('input[name=uPapel][value=coordenador]', { depois: 1400 });
      await t.legenda('Marque o <b>setor</b>: ele forma a equipe do setor na Central de Tickets.', { etapa: N, ms: 300 });
      await t.clicar('.fundo-modal label:has-text("Jurídico") input[name=uSetor]', { depois: 1200 });
      await t.legenda('Marcações extras: <b>supervisão da Central de Tickets</b> (todos os setores; já vem com coordenador e supervisor) e <b>Marketing — Central de Links</b>.', { etapa: N, ms: 300 });
      await t.mostrar('#uSup', 1800, { dx: 0.05 });
      await t.mostrar('#uLinks', 1800, { dx: 0.05 });
      await t.clicar('#btSalvarU', { depois: 1500 });
      await t.legenda('Envie a senha temporária para a pessoa por um canal seguro.', { etapa: N, ms: 2200 });
      await t.clicar(fecharModal, { depois: 1000 });
      await t.legenda('O perfil e as marcações aparecem na lista. Clique na pessoa para mudar.', { etapa: '3 · Editar', ms: 300 });
      await t.clicar('#tbUsu tr:has-text("Sueli Prado")', { depois: 1000 });
      await t.mostrar('#uSup', 2600, { dx: 0.05 });
      await t.legenda('<b>Tudo o que acessa</b> mostra num lugar só o que a pessoa pode: setores, tickets, Carteira e cada ferramenta.', { etapa: '3 · Editar', ms: 300 });
      await t.clicar('#btVerAcessos', { depois: 2600 });
      await t.clicar(fecharModal, { depois: 800 });
      await t.clicar(fecharModal, { depois: 800 });
    },
    resumo: ['Perfil + <b>setor</b> no cadastro definem o que a pessoa gerencia', 'Supervisão de tickets e Central de Links são marcações', '<b>Tudo o que acessa</b>: o que a pessoa pode, num lugar só'],
  },

  {
    nome: 'admin-modulos',
    entrar: 'admin@myblue.com.br',
    inicio: '#/admin/modulos',
    abertura: ['Só para a administração.', ['Cadastrar uma ferramenta nova', 'Enviar o HTML', 'Setores, envio em lote e backup']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Módulos e dados</b> ficam todas as ferramentas: setor, arquivo e onde os dados ficam.', { etapa: '1 · Módulos', ms: 3400 });
      const N = '2 · Nova ferramenta';
      await t.legenda('<b>Novo módulo</b> cadastra uma ferramenta nova: nome, setor e ícone.', { etapa: N, ms: 300 });
      await t.clicar('#btNovoMod', { depois: 800 });
      await t.digitar('#nNome', 'Controle de Contratos');
      await t.escolher('#nSetor', 'Jurídico');
      await t.escolher('#nIcone', { value: 'documento' });
      await t.digitar('#nDesc', 'Contratos e vencimentos do Jurídico.', { atraso: 26 });
      await t.clicar('#btCriarMod', { depois: 2200 });
      await t.legenda('Depois de criar, envie o <b>arquivo .html</b> da ferramenta.', { etapa: N, ms: 300 });
      await t.enviarArquivo('#zArq', '#inArq', cen.rec.html, { depois: 2600 });
      await t.legenda('Ferramenta nova já nasce <b>isolada</b>: roda separada do portal, sem a sessão de quem abre.', { etapa: N, ms: 300 });
      await t.mostrar('#mIsolada', 2400, { dx: 0.05 });
      await t.legenda('Na mesma janela: onde os dados ficam, quem abre e com qual papel e as versões anteriores.', { etapa: N, ms: 300 });
      await t.rolar(700, '.fundo-modal .modal-corpo');
      await t.pausa(1800);
      await t.clicar('.fundo-modal .modal-cab [data-fechar]', { depois: 1200 });
      const O = '3 · Outras ações';
      await t.legenda('<b>Setores</b> cria e renomeia setores. <b>Enviar vários HTMLs</b> publica cada arquivo no módulo certo.', { etapa: O, ms: 300 });
      await t.mostrar('#btSetores', 1800);
      await t.mostrar('#btLote', 1800);
      await t.legenda('<b>Backup do banco</b> baixa uma cópia de tudo. Faça com frequência.', { etapa: O, ms: 300 });
      await t.mostrar('#btBackup', 2600);
    },
    resumo: ['<b>Novo módulo</b> → envie o HTML (nasce isolada)', 'HTML da coordenação em ferramenta não isolada: <b>aprovar</b> na janela', '<b>Backup do banco</b> com frequência'],
  },
];

// ferramentas (cada uma precisa do HTML dela em FERRAMENTAS)
module.exports.push(...require('./roteiros-ferramentas'));
