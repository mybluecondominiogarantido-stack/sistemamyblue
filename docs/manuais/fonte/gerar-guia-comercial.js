'use strict';
/*
 * Gera o Guia de Preenchimento do Comercial (Guia-Preenchimento-Comercial.pdf): como o executivo de negócios preenche
 * a Análise de Crédito, a Solicitação de Contrato e a Implantação no portal, com as variações de cada caso.
 *
 *   node docs/manuais/fonte/gerar-guia-comercial.js
 *
 * As telas (com-*.jpg em fonte/img, dados fictícios) saem de capturar-comercial.js.
 */
const path = require('path');
const { fig, passos, dica, atencao, caixa, tabela, etq, documento, capVersoes, pdfTimbrado, playwright } = require('./padrao');

const VERSAO = '1.0';
const DATA = 'Outubro de 2026';
const ok = caixa('ok', 'Pronto');
const CSS = `
.fluxo { display: flex; flex-wrap: wrap; align-items: stretch; gap: 1.6mm; margin: 2mm 0 4mm; break-inside: avoid; }
.fluxo .p { flex: 1 1 0; min-width: 24mm; border: 1px solid var(--borda); border-top: 1.2mm solid var(--azul); background: #fff; padding: 2mm 2.4mm; font-size: 8.8pt; }
.fluxo .p .t { display: block; color: var(--escuro); font-weight: 700; font-size: 9.2pt; margin-bottom: .8mm; }
.fluxo .s { align-self: center; color: var(--azul); font-weight: 700; }
.intro { font-size: 11pt; }
`;
const fluxo = (etapas) => `<div class="fluxo">${etapas.map(([t, d]) => `<div class="p"><span class="t">${t}</span>${d}</div>`).join('<div class="s">›</div>')}</div>`;

const estrutura = [];

/* ======================= Visão geral ======================= */
estrutura.push({ cap: 'O caminho do condomínio no portal', html: `
<p class="intro">Este guia mostra, campo a campo, como o executivo de negócios preenche as três etapas do condomínio novo no portal:
a <b>Análise de Crédito</b>, a <b>Solicitação de Contrato</b> e a <b>Implantação</b>. Cada etapa começa quando a anterior termina.</p>
${fluxo([
    ['Análise de Crédito', 'Você pede, o analista calcula e libera o retorno em PDF.'],
    ['Solicitação de Contrato', 'Você pede o contrato. O Jurídico faz a minuta, o síndico aprova e o contrato é assinado.'],
    ['Condições fechadas', 'A advogada registra o que foi assinado. Você é avisado.'],
    ['Implantação', 'Você escolhe o contrato, completa o formulário e envia ao setor Implantação.'],
  ])}
<h2>A regra de ouro</h2>
<p><b>Sem contrato concluído no portal, não tem implantação.</b> A análise de crédito sozinha não abre implantação: o próximo passo
depois do retorno é sempre a Solicitação de Contrato. A única exceção é o contrato que já foi <b>assinado fora do portal</b>
(capítulo 9).</p>
<h2>Os casos e por onde cada um começa</h2>
${tabela(['Caso', 'Análise de Crédito', 'Solicitação de Contrato', 'Implantação'], [
    ['Condomínio novo (sem garantidora)', '<b>Nova solicitação</b> → Nova contratação', '<b>A partir de uma Análise de Crédito</b>', '<b>No portal</b>: escolha o contrato'],
    ['Portabilidade (sai de outra garantidora)', 'Portabilidade de garantidora, com a garantidora e a vigência atuais', 'A partir de uma Análise de Crédito', 'No portal'],
    ['Análise feita antes do portal, contrato ainda a fazer', 'Já existe: você tem o PDF do retorno', '<b>Análise feita antes do portal</b> (anexa o PDF)', 'No portal'],
    ['Contrato já assinado fora do portal', 'Já existe: você tem o PDF do retorno', 'Não passa por aqui', '<b>Fora do portal</b>: anexa o contrato e o retorno'],
    ['Condomínio de entrega (construtora entregando)', 'Não tem', '<b>Condomínio de entrega</b>: a diretoria aprova a taxa e o boleto', 'No portal, com a etiqueta "Entrega · taxa aprovada pela diretoria"'],
    ['Condomínio ainda sem CNPJ', 'Marque "Ainda não tem CNPJ"', 'Marque, confirme a ciência dos 90 dias e anexe a ata da assembleia', 'O CNPJ fica como pendência'],
  ])}
${dica('Em todas as etapas o portal mostra, no alto, a caixa <b>Para enviar, falta</b>: é a lista do que ainda precisa ser preenchido ou anexado. Clique em <b>Salvar rascunho</b> sempre que quiser parar e voltar depois.')}
` });

/* ======================= Análise de Crédito ======================= */
estrutura.push({ parte: 'Análise de Crédito' });
estrutura.push({ cap: 'Nova solicitação de análise', html: `
<p>No menu, <b>Análise de Crédito</b> mostra as suas solicitações, a situação de cada uma, o resultado e o prazo.</p>
${fig('com-cr-1-lista', 'Análise de Crédito → Minhas solicitações.')}
${passos(['Clique em <b>Nova solicitação</b>. O rascunho fica salvo até você enviar.', 'Preencha as seções 1 a 3 e anexe os documentos da seção 4.', 'Clique em <b>Enviar para análise</b>.'])}
${fig('com-cr-2-nova', 'A solicitação em branco, com a lista do que falta para enviar.')}
<h2>Identificação do condomínio</h2>
${fig('com-cr-3-identificacao', 'Identificação do condomínio.')}
${tabela(['Campo', 'Como preencher'], [
    ['Razão social e CNPJ', 'Como estão no cartão CNPJ. Condomínio ainda sem CNPJ (entrega de construtora): marque <b>Ainda não tem CNPJ</b>.'],
    ['UF e cidade', 'Do condomínio.'],
    ['Administradora', 'Quem administra hoje. Administração própria: escreva "Própria".'],
    ['Sistema de gestão condominial', 'O sistema da administradora (Superlógica, Gestart, ClasseCon…): ajuda o analista a ler o relatório.'],
    ['Garantidora atual e vigência', 'Só na <b>portabilidade</b>: quem garante hoje e até quando vai o contrato.'],
    ['Tipo de contratação', '<b>Nova contratação</b> (sem garantidora hoje) ou <b>Portabilidade de garantidora</b> (sai de outra para a MyBlue).'],
  ])}
<h2>Características da operação</h2>
${fig('com-cr-4-operacao', 'Unidades, taxas, água e gás e as taxas extras vigentes.')}
${tabela(['Campo', 'Como preencher'], [
    ['Unidades (UH)', 'O número total de unidades da convenção.'],
    ['Taxa ordinária e dia do vencimento', 'A taxa de condomínio por unidade (R$) e o dia em que vence hoje.'],
    ['Desconto de pontualidade', '<b>Não possui</b>, <b>Percentual</b> ou <b>Valor por unidade</b>, e o valor.'],
    ['Água + gás', 'A média mensal total e por unidade, e se compõe o boleto.'],
    ['Custo atual do boleto', 'Opcional. Sem a informação, o comparativo usa R$ 2,50.'],
    ['Taxas extras vigentes', '<b>Adicionar taxa extra</b>: descrição, <b>valor por unidade</b> (não o total), início, fim e se tem ata. Anexe a ata em Documentos.'],
  ])}
<h2>Síndico e isenções</h2>
${fig('com-cr-5-sindico', 'Síndico e isenções.')}
<ul>
  <li><b>Tipo de síndico</b>: condômino ou profissional (externo).</li>
  <li><b>Síndico isento?</b> Não, integral ou parcial (com o %).</li>
  <li><b>Subsíndico/conselheiros isentos</b>: some os percentuais (duas isenções de 50% contam como 1 unidade) e informe o <b>total de unidades isentas</b>.</li>
</ul>
` });
estrutura.push({ cap: 'Documentos, envio e retorno', html: `
<h2>Documentos</h2>
${fig('com-cr-6-documentos', 'Convenção, relatório de inadimplência e outros documentos.')}
${tabela(['Documento', 'O que é'], [
    ['Convenção registrada', 'A convenção registrada em cartório (Registro de Imóveis).'],
    ['Relatório de inadimplência', 'Contas a receber detalhado por competência, emitido há menos de 3 meses.'],
    ['Outros documentos', 'Atas de taxa extra, unidades retomadas, histórico, DRE dos últimos 12 meses.'],
  ])}
${atencao('Sem a convenção agora? Marque <b>A convenção será entregue antes da assinatura do contrato</b>: a análise sai com ressalva, e o contrato não é assinado sem ela.')}
<h2>Enviar</h2>
<p>Clique em <b>Enviar para análise</b>: sai o protocolo <b>AC-AAAA-MM-DD-NN</b> e o setor Análise de Crédito é avisado. A resposta vem
em até <b>24h úteis</b> a partir da documentação completa (<b>48h</b> quando vai à diretoria). Se faltar algo, a solicitação volta
para você com a lista de pendências, no sino e por e-mail: responda e reenvie.</p>
<h2>O retorno</h2>
${fig('com-cr-7-retorno', 'O retorno liberado: resultado, taxa administrativa, boleto e o PDF.')}
<ul>
  <li><b>Aprovada</b> ou <b>Aprovada com ressalvas</b>: siga para a Solicitação de Contrato. A proposta vale <b>30 dias</b>.</li>
  <li><b>Reprovada</b>: não segue para contrato.</li>
  <li>Proposta vencida, relatório novo ou mudança no condomínio: clique em <b>Solicitar reanálise</b>. O formulário vem preenchido e a reanálise recebe um protocolo novo.</li>
</ul>
` });

/* ======================= Solicitação de Contrato ======================= */
estrutura.push({ parte: 'Solicitação de Contrato' });
estrutura.push({ cap: 'De onde vem o condomínio', html: `
<p>Menu <b>Jurídico → Solicitação de Contrato</b> → <b>Nova solicitação</b>. A primeira pergunta é de onde vem o condomínio:</p>
${fig('com-ct-1-nova', 'A partir de uma Análise de Crédito: aparecem as suas análises aprovadas ou com ressalvas, ainda sem contrato.', 88)}
${tabela(['Origem', 'Quando usar', 'O que acontece'], [
    ['<b>A partir de uma Análise de Crédito</b>', 'A análise foi feita no portal.', 'Os dados da análise vêm preenchidos e podem ser ajustados. Proposta com mais de 30 dias aparece com aviso para conferir as condições.'],
    ['<b>Análise feita antes do portal</b>', 'Você tem o PDF do retorno, de antes do portal.', 'Anexe o PDF: o portal lê os dados e preenche o formulário.'],
    ['<b>Condomínio de entrega</b>', 'Construtora entregando, sem análise de crédito.', 'Você propõe a taxa e o boleto; a <b>diretoria aprova</b> antes da minuta. Sem CNPJ, anexe a ata da assembleia que autorizou a contratação.'],
  ])}
${fig('com-ct-1b-entrega', 'Condomínio de entrega.', 88)}
` });
estrutura.push({ cap: 'O formulário do contrato', html: `
${fig('com-ct-2-topo', 'No alto, os avisos do Manual do Contrato para conferir com o síndico.')}
<h2>Condomínio e síndico</h2>
${fig('com-ct-3-condominio', 'Condomínio e síndico.')}
<p>Nome, CNPJ, estado, cidade, administradora e os dados do síndico: nome, <b>CPF</b> (o portal confere na hora), e-mail e telefone com DDD.</p>
${atencao('Sem CNPJ: marque <b>O condomínio ainda não tem CNPJ</b> e <b>O síndico está ciente dos 90 dias</b> para regularizar. Até lá, o repasse vai para a conta da administradora, nunca para a do síndico. Anexe a ata da assembleia que autorizou a contratação.')}
<h2>Condições negociadas</h2>
${fig('com-ct-4-condicoes', 'Taxa, boleto, desconto, o que será garantido, taxa extra e cashback.')}
${tabela(['Campo', 'Como preencher'], [
    ['Taxa administrativa e boleto', 'O que foi negociado. Embaixo aparece o valor da análise, para comparar.'],
    ['Desconto de pontualidade', 'Não possui, percentual ou valor por unidade.'],
    ['O que iremos garantir', 'Marque tudo o que está na convenção e no regimento e foi aprovado em assembleia. Multas por descumprimento do regimento e locação a quem não é condômino não entram.'],
    ['Taxa ordinária e taxa extra por unidade', 'O portal mostra o % da taxa extra sobre a ordinária. Até 40% está coberto; acima, é decisão da diretoria.'],
    ['Cashback', 'Não, 5%, 10% ou outro, e sobre quais receitas incide.'],
  ])}
<h2>Vigência</h2>
${fig('com-ct-5-vigencia', 'Vigência, primeiro vencimento, período mínimo e fidelização.')}
<ul>
  <li><b>Vigência</b>: o início do contrato (ex.: 01/11/2026).</li>
  <li><b>Data do primeiro vencimento</b>: o dia desta data é o dia de vencimento dos boletos (ex.: 10/11/2026 → boletos todo dia 10).</li>
  <li><b>Período mínimo</b>: vazio é o padrão do contrato. Marque a <b>versão com fidelização</b> quando houver benefício a mais ou risco alto (na Paraíba, o contrato já é com fidelização).</li>
</ul>
` });
estrutura.push({ cap: 'Objeções do síndico, documentos e envio', html: `
<h2>Objeções e Solicitações de modificação de contrato</h2>
${fig('com-ct-6-objecoes', 'Marque só o que o síndico pediu e responda a pergunta de cada item.')}
${tabela(['Pedido do síndico', 'O que responder'], [
    ['Ampliar a cobertura de taxa extra além de 40% ' + etq('diretoria', 'ambar'), 'Até quantos % da ordinária. Não prometa percentual sem a diretoria.'],
    ['Retirar a política de pontualidade ' + etq('diretoria', 'ambar'), 'Só com o Jurídico e a diretoria.'],
    ['Adiar a política de pontualidade', 'Para quando: próxima assembleia ordinária, 30, 60 ou 90 dias.'],
    ['Ampliar o prazo para contestar a prestação de contas', 'O prazo pedido, em dias (ex.: 30).'],
    ['Mudar o foro (o padrão é Fortaleza/CE)', 'Para qual foro. Só pode ser a capital do estado do contrato (ex.: Natal/RN).'],
  ])}
<p>Os itens marcados <b>diretoria</b> passam por ela antes da minuta: ela é avisada no envio.</p>
<h2>Outras solicitações</h2>
<p>Opcional: o que mais foi combinado com o síndico (ex.: primeiro repasse adiantado em 5 dias).</p>
<h2>Documentos</h2>
${fig('com-ct-7-documentos', 'A análise vem vinculada; a convenção precisa estar aqui antes da assinatura.')}
<h2>Enviar e acompanhar</h2>
${passos([
    'Clique em <b>Enviar ao Jurídico</b>: sai o protocolo <b>CT-AAAA-MM-DD-NN</b>. O Jurídico tem <b>72h úteis</b> para a minuta.',
    'Chegou a minuta: leve ao síndico. Pediu mudança? <b>Pedir ajuste</b>. Aprovou? <b>Síndico aprovou: pedir assinatura</b>.',
    'O Jurídico manda assinar e anexa a via assinada. A advogada registra as <b>condições fechadas</b>.',
    'Você recebe o aviso <b>Contrato concluído: solicite a implantação</b>.',
  ])}
${fig('com-ct-8-minuta', 'Minuta com o comercial: Pedir ajuste ou Síndico aprovou: pedir assinatura.')}
` });

/* ======================= Implantação ======================= */
estrutura.push({ parte: 'Implantação' });
estrutura.push({ cap: 'Nova implantação: o contrato assinado', html: `
<p>Menu <b>Implantação</b> → <b>Nova implantação</b>. A pergunta é <b>onde o contrato foi assinado</b>.</p>
<h2>No portal</h2>
${fig('com-imp-1-portal', 'Aparecem só os seus contratos concluídos pelo Jurídico que ainda não têm implantação.', 88)}
<p>Escolha o contrato e clique em <b>Continuar para o formulário</b>. A implantação já vem com as condições fechadas, o contrato
assinado, a convenção e o retorno da análise. O mesmo vale pelo botão <b>Solicitar implantação</b>, dentro do contrato concluído.</p>
${dica('O contrato de condomínio de entrega aparece com a etiqueta <b>Entrega · taxa aprovada pela diretoria</b>.')}
<h2>Fora do portal</h2>
${fig('com-imp-2-fora', 'Anexe o contrato assinado e o retorno da análise: o portal lê o retorno e preenche o formulário.', 88)}
<p>Use só quando o contrato <b>já foi assinado fora do portal</b>. Se a análise estiver no portal, ou já tiver contrato no portal, o
caminho é a Solicitação de Contrato. Detalhes no capítulo 9.</p>
` });
estrutura.push({ cap: 'O formulário de implantação', html: `
${fig('com-imp-3-topo', 'No alto, as condições fechadas no contrato e o que falta para enviar.')}
<h2>Condições do contrato</h2>
${fig('com-imp-4-condicoes', 'Taxa, boleto, desconto, vigência e honorários vêm travados do contrato; o que será garantido e o 1º vencimento você ajusta.')}
<ul>
  <li><b>Travados</b> (valem os do contrato assinado): taxa administrativa, boleto, desconto de pontualidade, vigência, honorários e cashback.</li>
  <li><b>Você ajusta</b>, se o síndico pedir: o que será garantido e a data do primeiro vencimento (o dia dos boletos acompanha).</li>
</ul>
<h2>As outras seções</h2>
${tabela(['Seção', 'Como preencher'], [
    ['Condomínio', 'Confira nome, CNPJ, estado, unidades e dia do vencimento. Condomínio de entrega: marque e informe a construtora.'],
    ['Síndico', 'Tipo, isenção, nome, CPF, e-mail e telefone.'],
    ['Parceria', 'Diga se há e escolha o parceiro da base de comissão; o percentual é do setor Parceiros.'],
    ['Cashback e antecipação', 'Se foi negociada antecipação de valores: valor, data e se é permanente ou até quando.'],
    ['Administradora e contatos', 'A administradora, o consultor do condomínio e, no <b>+</b>, quantos contatos precisar.'],
  ])}
<h2>Documentos</h2>
${fig('com-imp-5-documentos', 'Obrigatórios para enviar, os que podem chegar depois e o que é da equipe de implantação.')}
${tabela(['Grupo', 'Documentos'], [
    ['<b>Obrigatórios para enviar</b>', 'Convenção do condomínio e Análise de Crédito (já vêm vinculadas), cadastro de moradores atualizado (Excel), ata de eleição do síndico e ata de previsão orçamentária.'],
    ['<b>Podem chegar depois</b>', 'RG/CPF ou CNH do síndico, conta bancária, comprovante de endereço do síndico e modelo do boleto anterior. Enquanto faltarem, você recebe um lembrete por e-mail a cada dia útil.'],
    ['<b>Da equipe de implantação</b>', 'A procuração.'],
  ])}
<h2>Enviar</h2>
<p>Clique em <b>Enviar ao setor Implantação</b>: sai o protocolo <b>IMP-AAAA-MM-DD-NN</b>, e a coordenação e a equipe são avisadas. Se o
setor devolver com pendência, você recebe a lista no sino e por e-mail: ajuste o formulário ou anexe o que falta e reenvie.</p>
` });
estrutura.push({ cap: 'Contrato assinado fora do portal', html: `
${fluxo([
    ['1. Nova implantação', 'Fora do portal: anexe o contrato assinado e o retorno da análise.'],
    ['2. Formulário', 'Preencha tudo, menos as condições do contrato.'],
    ['3. Enviar', 'O contrato vai à advogada; a implantação fica Com o Jurídico.'],
    ['4. Condições registradas', 'A implantação segue sozinha para o setor; você é avisado.'],
  ])}
${fig('com-imp-6-fora-topo', 'O formulário do contrato assinado fora do portal: o aviso no alto explica o caminho.')}
${fig('com-imp-7-fora-condicoes', 'Taxa, boleto, desconto, vigência e honorários: a advogada preenche a partir do contrato assinado.')}
<ul>
  <li>Você preenche o formulário <b>uma vez só</b>, no começo: condomínio, síndico, o que será garantido, o 1º vencimento, parceria, cashback, contatos e documentos (com o contrato assinado).</li>
  <li>Ao enviar, a implantação aparece como <b>Com o Jurídico · condições do contrato</b>, e a advogada é avisada.</li>
  <li>Registradas as condições, ela vai sozinha para o setor Implantação, e você recebe <b>Condições registradas</b> no sino e por e-mail.</li>
  <li>Se o Jurídico não seguir com o contrato, a implantação volta para você em rascunho, com o motivo.</li>
</ul>
${fig('com-imp-8-lista', 'Implantação → Minhas solicitações: a situação de cada uma.')}
${ok('Do pedido da análise ao envio ao setor Implantação, tudo fica no portal: os avisos chegam no sino e por e-mail, e cada etapa mostra o que falta.')}
` });

estrutura.push(capVersoes({
  intro: 'Este guia acompanha o portal: muda junto com as telas da Análise de Crédito, da Solicitação de Contrato e da Implantação.',
  como: ['As telas usam dados fictícios: <code>node docs/manuais/fonte/capturar-comercial.js &lt;pasta&gt;</code> e conversão para JPEG em <code>fonte/img</code>.',
    'Gere o PDF com <code>node docs/manuais/fonte/gerar-guia-comercial.js</code> e registre a versão abaixo.'],
  historico: [['1.0', '26/10/2026', 'Primeira versão: Análise de Crédito, Solicitação de Contrato e Implantação (no portal e fora dele), com as variações de cada caso.']],
}));

async function gerar() {
  const { chromium } = playwright();
  const br = await chromium.launch();
  const page = await br.newPage();
  const doc = documento({ chapeu: 'Guia · Comercial', titulo: 'Guia de Preenchimento do Comercial', sub: 'Análise de Crédito, Solicitação de Contrato e Implantação &nbsp;•&nbsp; MyBlue Condomínio Garantido',
    versao: VERSAO, data: DATA, fim: 'Guia', css: CSS }, estrutura);
  const destino = path.join(__dirname, '..', 'Guia-Preenchimento-Comercial.pdf');
  await pdfTimbrado(page, doc, destino);
  console.log('ok', path.relative(process.cwd(), destino));
  await br.close();
}

gerar().catch((e) => { console.error(e); process.exit(1); });
