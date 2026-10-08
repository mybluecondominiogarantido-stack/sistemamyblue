'use strict';
/*
 * Conteúdo dos manuais por setor.
 * Os "tipos de demanda" são SUGESTÕES para o administrador cadastrar em
 * Administração → Equipes e tipos de demanda (prazo em horas de expediente; 9 h = 1 dia útil).
 */

const FERRAMENTAS = {
  credito: {
    nome: 'Central de Ferramentas — Crédito',
    descricao: 'Montador de prestação de contas, recibos de entrega, recibos de motoboy, balancetes, planilha de moradores e consumos de água e gás.',
    dados: 'Não guarda dados no servidor: cada documento é montado na hora e baixado ou impresso.',
  },
  cobranca: {
    nome: 'Central de Ferramentas — Cobrança / Gestão',
    descricao: 'Produtividade da equipe, geração de mailing e análise de espólio.',
    dados: 'Não guarda dados no servidor: as análises são feitas na hora com os arquivos que você carrega.',
  },
  renegociacoes: {
    nome: 'Controle de Renegociações e Tickets',
    descricao: 'Renegociações de contrato, perda de receita no exercício e controle de tickets do Sucesso do Cliente.',
    dados: 'Os registros ficam na planilha da ferramenta (Google ou banco do portal, conforme a administração definir) e são compartilhados pela equipe.',
    obs: 'Esta ferramenta é o controle próprio do CS e continua funcionando como hoje. A <b>Central de Tickets</b> do portal é outra coisa: serve para as demandas <b>entre os setores</b> da MyBlue.',
  },
  suprimentos: {
    nome: 'Controle de Pedidos — Suprimentos',
    descricao: 'Central de pedidos do setor de Suprimentos: pedidos, parcelas e vencimentos.',
    dados: 'Os pedidos ficam na planilha da ferramenta e são compartilhados pela equipe. Excluir um pedido só o remove da tela, como já acontecia antes.',
  },
  parceiros: {
    nome: 'Prestação de Contas — Comissão de Parceiros',
    descricao: 'Lançamento e prestação de contas das comissões de parceiros, organizado por ano e mês.',
    dados: 'Os lançamentos ficam na planilha da ferramenta e são compartilhados pela equipe.',
  },
  boletos: {
    nome: 'Controle de Emissão de Boletos',
    descricao: 'Supervisão de Crédito: acompanhamento da emissão dos boletos de cada condomínio, com meta de 10 dias antes do vencimento. Painel, comparativo entre meses, controle, cadastro, feriados e histórico.',
    dados: 'Fica no banco do portal e é compartilhado por toda a equipe, ao vivo: o que uma pessoa marca aparece para as outras em poucos segundos. O histórico mostra quem fez cada alteração.',
    obs: 'Faça o <b>fechamento da competência</b> todo mês: ele bloqueia os registros do mês e gera o Excel de arquivo. Use <b>Salvar backup</b> no fechamento.',
  },
  sindicos: {
    nome: 'Controle de Síndicos',
    descricao: 'Compara a extração do Vouch com a base de contatos dos síndicos e gera a lista do Marketing.',
    dados: 'A base de contatos fica no banco do portal e é compartilhada pela equipe, ao vivo. Cada edição fica no histórico da ferramenta.',
  },
  comissoes: {
    nome: 'Comissões de Novos Condomínios',
    descricao: 'Controle das comissões sobre os novos condomínios fechados.',
    dados: 'Os dados ficam no banco do portal e são compartilhados por quem tem acesso à ferramenta.',
    obs: 'Esta ferramenta tem regras próprias de quem pode o quê, dentro dela.',
  },
  partnerchip: {
    nome: 'PartnerChip — Resultados',
    descricao: 'Painel de resultados dos parceiros.',
    dados: 'Os dados ficam no banco do portal e são compartilhados por quem tem acesso à ferramenta.',
  },
};

// p: prioridade sugerida; h: prazo em horas de expediente
const SETORES = [
  {
    nome: 'Administrativa/Financeira', arquivo: 'administrativa-financeira',
    papel: 'Cuida das rotinas administrativas e financeiras da MyBlue: pagamentos, notas fiscais, reembolsos e contas da empresa. É responsável também por Suprimentos, Parceiros e Comissões de Novos Condomínios.',
    ferramentas: [],
    // subáreas sob a responsabilidade da Administrativa/Financeira (no portal, Suprimentos e Parceiros recebem tickets como setores próprios)
    subareas: [
      {
        nome: 'Suprimentos', setorPortal: 'Suprimentos',
        papel: 'Compras de materiais e serviços: cotações, pedidos, parcelas e vencimentos.',
        ferramentas: ['suprimentos'],
        recebe: [
          ['Pedido de compra', 18, 'media', 'Item, quantidade, especificação e para quando precisa.'],
          ['Cotação', 27, 'media', 'Item/serviço e quantos orçamentos são necessários.'],
          ['Compra urgente', 4, 'urgente', 'Explique a urgência; informe o item e o local de entrega.'],
          ['Material de escritório', 27, 'baixa', 'Lista de itens e quantidades.'],
        ],
      },
      {
        nome: 'Parceiros', setorPortal: 'Parceiros',
        papel: 'Relacionamento com parceiros e prestação de contas das comissões dos parceiros.',
        ferramentas: ['parceiros'],
        recebe: [
          ['Dúvida sobre comissão', 18, 'media', 'Parceiro, mês de referência e o valor em dúvida.'],
          ['Cadastro de parceiro', 18, 'media', 'Dados do parceiro e dados bancários (anexe documentos).'],
          ['Prestação de contas do mês', 27, 'media', 'Parceiro e mês.'],
        ],
      },
      {
        nome: 'Comissões de Novos Condomínios',
        papel: 'Controle e pagamento das comissões sobre os novos condomínios fechados.',
        ferramentas: ['comissoes'],
        recebe: [
          ['Comissão de novo condomínio', 27, 'media', 'Condomínio, data de fechamento e quem indicou ou vendeu.'],
        ],
      },
    ],
    recebe: [
      ['Pagamento a fornecedor', 18, 'media', 'Anexe a nota/boleto e informe vencimento e centro de custo.'],
      ['Emissão de nota fiscal', 9, 'alta', 'Cliente, CNPJ, valor, competência e descrição do serviço.'],
      ['Reembolso de despesas', 27, 'media', 'Anexe os comprovantes; informe a data e o motivo.'],
      ['Pagamento urgente', 4, 'urgente', 'Use só para vencimento no mesmo dia; explique o motivo.'],
      ['Dúvida financeira / conciliação', 27, 'baixa', 'Período, conta e o lançamento em questão.'],
    ],
    abre: [
      ['Jurídico', 'análise de contratos com fornecedores'],
      ['Crédito', 'informações de prestação de contas dos condomínios'],
    ],
  },
  {
    nome: 'Cobrança', arquivo: 'cobranca',
    papel: 'Recupera os valores em atraso dos condomínios: boletos, acordos, negativações e acompanhamento da inadimplência.',
    ferramentas: ['cobranca'], carteira: 'analista de cobrança',
    recebe: [
      ['2ª via de boleto', 4, 'alta', 'Condomínio, unidade, mês de referência e para quem enviar.'],
      ['Proposta de acordo', 18, 'media', 'Unidade, meses em atraso e a proposta do condômino.'],
      ['Negativação / baixa de negativação', 9, 'alta', 'Unidade, valor e comprovante de pagamento (para baixa).'],
      ['Relatório de inadimplência', 27, 'baixa', 'Condomínio e período desejado.'],
      ['Dúvida de cobrança do síndico', 9, 'media', 'Condomínio e a dúvida; anexe o que o síndico enviou.'],
    ],
    abre: [
      ['Jurídico', 'cobrança judicial, notificação extrajudicial, espólio'],
      ['Crédito', 'repasses e balancetes'],
      ['CS', 'retorno ao síndico sobre acordos e inadimplência'],
    ],
  },
  {
    nome: 'Comercial', arquivo: 'comercial',
    papel: 'Prospecta e fecha novos condomínios clientes e cuida das propostas comerciais.',
    ferramentas: ['partnerchip'],
    recebe: [
      ['Proposta comercial', 18, 'media', 'Condomínio, nº de unidades, taxa atual e contato do síndico.'],
      ['Visita / reunião com síndico', 27, 'media', 'Endereço, data sugerida e quem acompanha.'],
      ['Dúvida sobre cliente em negociação', 9, 'media', 'Nome do condomínio e a dúvida.'],
    ],
    abre: [
      ['Implantação', 'novo condomínio fechado (início da implantação)'],
      ['Jurídico', 'minuta e revisão de contrato'],
      ['Marketing', 'apresentações e materiais comerciais'],
      ['Crédito', 'análise de crédito do condomínio'],
      ['Administrativa/Financeira', 'comissões de novos condomínios fechados'],
    ],
  },
  {
    nome: 'Crédito', arquivo: 'credito',
    papel: 'Prepara prestações de contas, balancetes, recibos e controles de consumo dos condomínios.',
    ferramentas: ['credito', 'boletos', 'sindicos'], carteira: 'assistente de crédito',
    recebe: [
      ['Prestação de contas', 27, 'media', 'Condomínio e mês de referência.'],
      ['Balancete', 27, 'media', 'Condomínio e período.'],
      ['Recibo (entrega / motoboy)', 9, 'alta', 'O que foi entregue, para quem e quando.'],
      ['Consumo de água e gás', 18, 'media', 'Condomínio, mês e as leituras (anexe a planilha ou foto).'],
      ['Planilha de moradores', 18, 'baixa', 'Condomínio e o que precisa ser atualizado.'],
    ],
    abre: [
      ['Cobrança', 'situação de inadimplência para a prestação de contas'],
      ['CS', 'retorno ao síndico'],
      ['Administrativa/Financeira', 'conferência de pagamentos'],
    ],
  },
  {
    nome: 'CS', arquivo: 'cs',
    papel: 'Sucesso do Cliente: relacionamento com síndicos e condomínios, renegociações de contrato e retenção.',
    ferramentas: ['renegociacoes'],
    recebe: [
      ['Reclamação de cliente', 4, 'urgente', 'Condomínio, quem reclamou, o que aconteceu e o que já foi feito.'],
      ['Solicitação do síndico', 9, 'alta', 'Condomínio e o pedido; anexe a mensagem do síndico.'],
      ['Renegociação de contrato', 18, 'media', 'Condomínio, contrato atual e o que o cliente pede.'],
      ['Retorno ao cliente', 9, 'media', 'O que precisa ser comunicado e a quem.'],
    ],
    abre: [
      ['Cobrança', 'acordos, boletos e inadimplência de unidades'],
      ['Crédito', 'prestação de contas e balancetes pedidos pelo síndico'],
      ['Jurídico', 'questões contratuais do cliente'],
      ['Implantação', 'ajustes no cadastro do condomínio'],
    ],
  },
  {
    nome: 'Implantação', arquivo: 'implantacao',
    papel: 'Coloca os novos condomínios em operação: cadastro, unidades, moradores e passagem para os setores.',
    ferramentas: [],
    recebe: [
      ['Implantação de novo condomínio', 45, 'alta', 'Contrato assinado, contato do síndico, data de início e documentos.'],
      ['Cadastro de unidades e moradores', 18, 'media', 'Anexe a planilha de unidades/moradores.'],
      ['Ajuste de cadastro', 9, 'media', 'Condomínio, o que está errado e o dado correto.'],
    ],
    abre: [
      ['Crédito', 'início da prestação de contas do novo condomínio'],
      ['Cobrança', 'carteira inicial de inadimplência'],
      ['CS', 'passagem do cliente após a implantação'],
    ],
  },
  {
    nome: 'Jurídico', arquivo: 'juridico',
    papel: 'Contratos, cobrança judicial, notificações e pareceres.',
    ferramentas: [],
    recebe: [
      ['Análise / minuta de contrato', 27, 'media', 'Anexe o contrato ou a proposta e destaque os pontos de atenção.'],
      ['Cobrança judicial', 45, 'media', 'Unidade, débito atualizado e histórico de tentativas de acordo.'],
      ['Notificação extrajudicial', 18, 'alta', 'Destinatário, motivo e documentos de apoio.'],
      ['Parecer / consulta', 27, 'media', 'A pergunta objetiva e o contexto.'],
    ],
    abre: [
      ['Cobrança', 'débitos atualizados e histórico de cobrança'],
      ['Administrativa/Financeira', 'custas e pagamentos de processos'],
      ['CS', 'retorno ao síndico sobre ações'],
    ],
  },
  {
    nome: 'Máquina de Vendas', arquivo: 'maquina-de-vendas',
    papel: 'Geração e qualificação de oportunidades (leads), automações e funil de vendas.',
    ferramentas: [],
    recebe: [
      ['Qualificação de lead', 9, 'alta', 'Nome do condomínio, contato e origem do lead.'],
      ['Relatório do funil', 27, 'baixa', 'Período e o recorte desejado.'],
      ['Ajuste em automação / integração', 18, 'media', 'O que deve mudar e um exemplo do problema.'],
    ],
    abre: [
      ['Comercial', 'lead qualificado para proposta'],
      ['Marketing', 'campanhas e materiais'],
    ],
  },
  {
    nome: 'Marketing', arquivo: 'marketing',
    papel: 'Comunicação da MyBlue: artes, campanhas, redes sociais, comunicados e materiais comerciais.',
    ferramentas: [],
    recebe: [
      ['Arte / peça gráfica', 27, 'media', 'Formato, tamanho, texto e prazo de uso.'],
      ['Comunicado a condôminos', 18, 'media', 'Condomínio(s), texto-base e canal (e-mail, mural, WhatsApp).'],
      ['Publicação em redes sociais', 18, 'baixa', 'Tema, data desejada e materiais de apoio.'],
      ['Material comercial / apresentação', 27, 'media', 'Público, objetivo e informações que devem constar.'],
    ],
    abre: [
      ['Comercial', 'informações para materiais'],
      ['Máquina de Vendas', 'resultados de campanhas'],
    ],
  },
  {
    nome: 'Supervisão', arquivo: 'supervisao', supervisao: true,
    papel: 'Acompanha a operação de todos os setores: prazos, filas, gargalos e redistribuição das demandas.',
    ferramentas: [],
    recebe: [
      ['Escalonamento (ticket travado)', 4, 'urgente', 'Nº do ticket travado e por que precisa de intervenção.'],
      ['Autorização de exceção', 9, 'alta', 'O que precisa ser autorizado e o motivo.'],
      ['Conferência de processo', 27, 'media', 'Processo, setor e o problema observado.'],
    ],
    abre: [
      ['Qualquer setor', 'pedidos de correção, informações e relatórios'],
    ],
  },
  {
    nome: 'Gerência', arquivo: 'gerencia', supervisao: true,
    papel: 'Direção da operação: aprovações, decisões e acompanhamento dos indicadores de todos os setores.',
    ferramentas: [],
    recebe: [
      ['Aprovação', 9, 'alta', 'O que precisa ser aprovado, valores e documentos.'],
      ['Decisão / orientação', 18, 'media', 'Contexto, opções e recomendação do setor.'],
      ['Relatório gerencial', 27, 'media', 'Indicadores e período.'],
    ],
    abre: [
      ['Qualquer setor', 'pedidos, relatórios e acompanhamento'],
    ],
  },
];

module.exports = { SETORES, FERRAMENTAS };
