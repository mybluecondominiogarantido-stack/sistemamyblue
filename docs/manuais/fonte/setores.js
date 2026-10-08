'use strict';
/*
 * Conteúdo dos manuais por setor.
 * Os "tipos de demanda" são SUGESTÕES para o administrador cadastrar em
 * Administração → Equipes e tipos de demanda (prazo em horas de expediente; 9 h = 1 dia útil).
 */

/*
 * Ferramentas. "abas": o que cada aba (ou parte da tela) da ferramenta faz; "rotina": passo a passo do mês.
 */
const FERRAMENTAS = {
  credito: {
    nome: 'Central de Ferramentas — Crédito',
    descricao: 'Reúne as ferramentas do dia a dia do Crédito. Cada uma monta um documento na hora, a partir dos dados ou arquivos que você informa.',
    dados: 'Não guarda dados no servidor: cada documento é montado na hora e baixado ou impresso.',
    abas: [
      ['Montador de prestação de contas', 'Monta a prestação de contas do condomínio.'],
      ['Recibos de entrega', 'Gera os recibos de entrega de documentos.'],
      ['Recibos de motoboy', 'Gera os recibos das entregas feitas por motoboy.'],
      ['Balancetes', 'Monta os balancetes dos condomínios.'],
      ['Planilha de moradores', 'Organiza a planilha de moradores do condomínio.'],
      ['Consumos de água e gás', 'Calcula e distribui os consumos de água e gás por unidade.'],
    ],
  },
  cobranca: {
    nome: 'Central de Ferramentas — Cobrança / Gestão',
    descricao: 'Reúne as ferramentas de gestão da Cobrança. As análises são feitas na hora, com os arquivos que você carrega.',
    dados: 'Não guarda dados no servidor: as análises são feitas na hora com os arquivos que você carrega.',
    abas: [
      ['Produtividade da equipe', 'Acompanha a produção de cada pessoa da equipe de cobrança.'],
      ['Geração de mailing', 'Monta listas de contato (mailing) a partir dos arquivos de cobrança.'],
      ['Análise de espólio', 'Apoia a análise de casos de espólio.'],
    ],
  },
  renegociacoes: {
    nome: 'Controle de Renegociações e Tickets',
    descricao: 'Controle próprio do CS para as renegociações de contrato, a perda de receita no exercício e os tickets do Sucesso do Cliente.',
    dados: 'Os registros ficam no banco do portal e são compartilhados pela equipe.',
    obs: 'Esta ferramenta é o controle próprio do CS. A <b>Central de Tickets</b> do portal é outra coisa: serve para as demandas <b>entre os setores</b> da MyBlue.',
    abas: [
      ['Renegociações', 'Registro de cada renegociação de contrato com o condomínio.'],
      ['Perda de receita no exercício', 'Quanto a MyBlue deixa de receber no ano com as renegociações.'],
      ['Tickets', 'Controle dos tickets do Sucesso do Cliente.'],
    ],
  },
  suprimentos: {
    nome: 'Controle de Pedidos — Suprimentos',
    descricao: 'Controle dos pedidos de compra: valores, forma de pagamento, parcelas, vencimentos e o que já foi pago. Os pagamentos saem às <b>terças e quintas-feiras</b>.',
    dados: 'Os pedidos ficam no banco do portal e são compartilhados pela equipe. Excluir um pedido só o remove da tela, como já acontecia antes.',
    tituloAbas: 'Partes da tela',
    abas: [
      ['Indicadores do topo', 'Os valores dos pedidos, incluindo o que está parcelado.'],
      ['Próxima janela de pagamento', 'O que sai na próxima terça ou quinta: quantos pedidos, quanto a pagar e quantos estão atrasados.'],
      ['Janelas de pagamento', 'Use <b>Ir para data</b> para ver os pedidos com vencimento em outra terça ou quinta.'],
      ['Pedidos do mês', 'Escolha o mês e o ano para ver só os pedidos daquele período, com o <b>apurado do mês</b>.'],
      ['Pedidos', 'Todos os pedidos, com filtro por situação (<b>em aberto</b>, <b>vencidos</b>, <b>pagos</b>) e o total exibido. Em cada pedido: editar, marcar como pago ou excluir.'],
      ['Novo pedido', 'Nº do pedido, valor total, descrição, forma de pagamento (<b>pagamento único</b> ou <b>em várias vezes</b>, com o número de parcelas e o vencimento de cada uma), situação. Os atalhos <b>Próx. terça</b> e <b>Próx. quinta</b> preenchem o vencimento.'],
    ],
    rotina: [
      'Ao receber um pedido aprovado, clique em <b>Novo pedido</b> e preencha número, valor, descrição e forma de pagamento.',
      'Se for parcelado, informe o número de parcelas e confira o vencimento de cada uma.',
      'Antes de cada terça e quinta, confira a <b>Próxima janela de pagamento</b> e os atrasados.',
      'Depois de pagar, marque o pedido (ou a parcela) como <b>pago</b>.',
    ],
  },
  parceiros: {
    nome: 'Prestação de Contas — Comissão de Parceiros',
    descricao: 'Calcula, registra e acompanha a comissão mensal dos parceiros. A <b>competência</b> é o mês dos valores; a comissão é paga no <b>mês seguinte</b>.',
    dados: 'Os lançamentos, os parceiros e os condomínios ficam no banco do portal e são compartilhados pela equipe.',
    abas: [
      ['Prestações do mês', 'Visão da competência escolhida: o total de comissão e quando será pago, quantos parceiros têm comissão apurada, quantos já foram lançados e pagos. Para cada parceiro: recorrência, boletos, venda e total, com o controle de <b>enviado por e-mail</b> e <b>pagamento</b>. Abre o <b>relatório de prestação de contas</b> do parceiro (condomínio a condomínio: Tx. de serviço recebida, tarifa bancária, multa, juros, encargos, base e comissão, com subtotais e o total geral), para imprimir ou salvar em PDF. Em <b>Manutenção</b>, apaga os lançamentos de competências antigas (parceiros e condomínios não são afetados).'],
      ['Lançamento', 'Onde se lançam os valores do mês, parceiro por parceiro: escolha o parceiro, anexe (opcional) os <b>PDFs dos balanços da garantidora</b> (os valores são lidos e preenchidos sozinhos) e confira, para cada condomínio da carteira dele, Tx. de serviço recebida, tarifa bancária, multa, juros, encargos e correção. Informe a tarifa bancária do mês (valor por boleto e quantidade de boletos emitidos) e marque a <b>venda</b> quando houver. A tela mostra a comissão prevista; depois clique em <b>Salvar</b> ou <b>Salvar e ver relatório</b>.'],
      ['Condomínios', 'A carteira: cada condomínio com o parceiro vinculado (ou dois, quando a comissão é compartilhada), o valor por boleto e o último lançamento. Cadastre, edite ou remova condomínios.'],
      ['Parceiros', 'Cadastro de cada parceiro: nome, UF, observação do contrato e as <b>condições da parceria</b>: percentual da comissão mensal; como a tarifa bancária entra (na base, excedente por boleto em valor cheio ou 10% do excedente, com o piso por boleto); se os encargos entram na base; a <b>comissão de venda</b> (sem cláusula, no 1º mês de arrecadação ou no mês subsequente, com percentual e base: 1ª Tx. de serviço ou 1ª Tx. de serviço + 1ª tarifa); categorias; e os condomínios da carteira dele.'],
    ],
    rotina: [
      'Confira os cadastros nas abas <b>Parceiros</b> e <b>Condomínios</b>. As comissões de novos condomínios aprovadas chegam pelo módulo Comissões de Novos Condomínios.',
      'Na aba <b>Lançamento</b>, para cada parceiro, anexe os balanços da garantidora, confira os valores de cada condomínio e salve.',
      'Na aba <b>Prestações do mês</b>, abra o relatório de cada parceiro, imprima ou salve em PDF e envie. Marque <b>enviado por e-mail</b>.',
      'Quando pagar, marque o <b>pagamento</b>. A comissão da competência é paga no mês seguinte.',
    ],
    obs: 'A <b>correção</b> fica registrada para conferência, mas nunca entra na base da comissão. O piso do boleto só vale para as regras de excedente.',
  },
  boletos: {
    nome: 'Controle de Emissão de Boletos',
    descricao: 'Supervisão de Crédito: acompanhamento da emissão dos boletos de cada condomínio, por competência, com meta de 10 dias antes do vencimento.',
    dados: 'Fica no banco do portal e é compartilhado por toda a equipe, ao vivo: o que uma pessoa marca aparece para as outras em poucos segundos. O histórico mostra quem fez cada alteração.',
    obs: 'Faça o <b>fechamento da competência</b> todo mês: ele bloqueia os registros do mês e gera o Excel de arquivo. Use <b>Salvar backup</b> no fechamento.',
    abas: [
      ['Painel', 'Números da competência: emitidos (e % da carteira), no prazo, emitidos com atraso, atrasados, meta em até 3 dias, pendentes e erros de emissão; o <b>fechamento da competência</b> e os emitidos por semana.'],
      ['Comparativo', 'Compara as competências fechadas entre si.'],
      ['Controle', 'A lista dos condomínios da competência: marcar a emissão (um a um ou em lote), desfazer, registrar erros de emissão e observações.'],
      ['Cadastro', 'Os condomínios acompanhados, com a regra de vencimento de cada um.'],
      ['Feriados', 'Os feriados, que não contam como dia útil no cálculo da meta.'],
      ['Histórico', 'Quem fez cada alteração e quando, com a opção de <b>desfazer</b>.'],
    ],
  },
  sindicos: {
    nome: 'Controle de Síndicos',
    descricao: 'Compara a extração do Vouch com a base de contatos dos síndicos e gera a lista do Marketing.',
    dados: 'A base de contatos fica no banco do portal e é compartilhada pela equipe, ao vivo. Cada edição fica no histórico da ferramenta.',
    abas: [
      ['1. Atualizar pelo Vouch', 'Cole as colunas Apelido e Síndico da extração do Vouch (ou carregue o arquivo .xlsx/.csv) e compare com a base. A ferramenta mostra o que mudou e só grava o que você confirmar.'],
      ['2. Base de contatos', 'A base dos síndicos, editável direto na tabela: telefone, e-mail, situação. Filtros de ativos, inativos (saíram), sem telefone e sem e-mail.'],
      ['3. Lista do Marketing', 'A lista pronta para o Marketing, para baixar em planilha.'],
      ['Ignorar', 'Condomínios que não devem gerar alerta na comparação.'],
      ['Histórico', 'Registro das importações, edições e downloads.'],
      ['Cópia de segurança', 'Baixar e restaurar uma cópia de toda a base.'],
    ],
  },
  comissoes: {
    nome: 'Comissões de Novos Condomínios',
    descricao: 'O caminho da comissão de cada condomínio novo, do comercial ao financeiro: a gestão comercial importa os condomínios que entraram no mês, o executivo informa se o condomínio veio por parceiro e qual comissão gera, a gestão aprova e o financeiro cadastra na Prestação de Contas.',
    dados: 'Os dados ficam no banco do portal e são compartilhados por quem tem acesso à ferramenta.',
    obs: 'Esta ferramenta tem papéis próprios (executivo, gestão comercial e financeiro), definidos dentro dela na aba <b>Acessos</b>. Quem ainda não tem papel vê um aviso pedindo a liberação à gestão comercial.',
    abas: [
      ['Comercial', 'A gestão comercial importa a <b>planilha de implantações do mês</b> (.xlsx, .xls ou .csv; o mês de entrada é sugerido pelo 1º vencimento). Cada executivo vê os condomínios dele e responde, em cada um, se ele <b>veio por parceiro</b>. Se veio, escolhe o parceiro e a comissão: <b>recorrência</b> (10% do que a MyBlue arrecada no condomínio, todo mês, ou 5% para cada um se dividir com outro parceiro) e/ou <b>comissão de venda</b> (50% da 1ª taxa administrativa, paga uma vez). Depois clica em <b>Enviar para aprovação</b>.'],
      ['Aprovação da gestão', 'A gestão comercial vê o que está aguardando aprovação e <b>aprova</b> (um a um ou todos) ou <b>devolve</b> ao executivo dizendo o que corrigir. Também acompanha todos os condomínios do mês, reabre uma aprovação ou remove uma linha importada por engano.'],
      ['Financeiro', 'Resumo do mês (aprovados com comissão, a lançar, recorrência, venda, sem comissão e ainda não aprovados) e a lista das comissões aprovadas. O financeiro <b>cadastra</b> cada uma na Prestação de Contas — Comissão de Parceiros (cria o vínculo do condomínio com o parceiro) ou marca <b>Já cadastrei manualmente</b>. A comissão é paga no mês seguinte ao de entrada.'],
      ['Acessos', 'Quem faz o quê no módulo: a gestão comercial define o papel de cada pessoa (executivo, gestão comercial ou financeiro) e liga o usuário ao nome do executivo na planilha.'],
    ],
    rotina: [
      '<b>Gestão comercial:</b> no início do mês, importa a planilha de implantações na aba Comercial.',
      '<b>Executivos:</b> respondem, em cada condomínio, se veio por parceiro e qual comissão, e enviam para aprovação.',
      '<b>Gestão comercial:</b> aprova ou devolve na aba Aprovação da gestão.',
      '<b>Financeiro:</b> na aba Financeiro, cadastra as comissões aprovadas na Prestação de Contas, que passa a calcular a comissão do parceiro.',
    ],
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
