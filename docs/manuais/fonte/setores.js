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
    video: true,
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
    video: true,
    nome: 'Controle de Pedidos — Suprimentos',
    descricao: 'Controle dos pedidos de compra: valores, forma de pagamento (à vista ou parcelado), vencimentos e o que já foi pago. Os pagamentos saem às <b>terças e quintas-feiras</b>.',
    dados: 'Os pedidos ficam no banco do portal e são compartilhados pela equipe. Excluir um pedido só o remove da tela, como já acontecia antes.',
    abas: [
      ['Pedidos', 'Indicadores (em aberto, vence em 7 dias, vencidos, pagos), o quanto está à vista e parcelado, e a lista de todos os pedidos, com filtros (todos, à vista, parcelado; em aberto, vencidos, pagos) e busca. Cada parcela aparece como uma linha.'],
      ['Pedidos do mês', 'Escolha o ano e o mês para ver só os pedidos daquele período: em aberto, vencidos, pagos e o total do mês.'],
      ['Janelas de pagamento', 'Os pagamentos saem às terças e quintas. Mostra a <b>próxima janela</b> (quantos pedidos, quanto a pagar e quantos atrasados), os dias da semana com o que vence em cada um e a lista dos <b>atrasados</b>. <b>Ir para data</b> abre outra janela.'],
      ['Botões do topo', '<b>Novo pedido</b> lança um pedido; <b>Exportar</b> baixa a planilha dos pedidos; o botão de atualizar busca o que os colegas lançaram.'],
    ],
    comoUsar: [
      { titulo: 'Lançar um pedido à vista', passos: [
        'Clique em <b>Novo pedido</b>.',
        'Preencha o <b>Nº do pedido</b>, o <b>Valor total</b> e a <b>Descrição / fornecedor</b>.',
        'Em <b>Forma de pagamento</b>, deixe <b>À vista</b>.',
        'Informe o <b>Vencimento</b>. Os atalhos <b>Próx. terça</b> e <b>Próx. quinta</b> preenchem a próxima janela de pagamento.',
        'Deixe a <b>Situação</b> em <i>Em aberto</i> (ou <i>Pago</i>, se já foi pago) e clique em <b>Salvar pedido</b>.',
      ] },
      { titulo: 'Lançar um pedido parcelado', passos: [
        'Clique em <b>Novo pedido</b> e preencha número, valor total e descrição.',
        'Em <b>Forma de pagamento</b>, escolha <b>Parcelado</b>.',
        'Informe o <b>Nº de parcelas</b>. O portal sugere um vencimento por mês; ajuste a data de cada parcela em <b>Vencimento de cada parcela</b>.',
        'Confira o resumo (ex.: 3× de R$ 900,00) e clique em <b>Salvar pedido</b>. Cada parcela vira uma linha na lista, com o próprio vencimento.',
      ], fig: ['sup-3-parcelado', 'Novo pedido parcelado: número de parcelas e o vencimento de cada uma.'] },
      { titulo: 'Ver o que pagar na terça ou na quinta', passos: [
        'Abra a aba <b>Janelas de pagamento</b>.',
        'O quadro <b>Próxima janela de pagamento</b> mostra o dia, quantos pedidos, quanto pagar e quantos estão atrasados.',
        'Clique num dia para ver os pedidos dele, ou use <b>Ir para data</b>. Os atrasados aparecem em <b>Pedidos atrasados</b>.',
      ], fig: ['sup-5-janelas', 'Janelas de pagamento: próxima janela, os dias da semana e os pedidos atrasados.'] },
      { titulo: 'Marcar como pago, desfazer e corrigir', passos: [
        'Na lista (aba <b>Pedidos</b>, <b>Pedidos do mês</b> ou nos atrasados da janela), clique no <b>✓</b> do pedido ou da parcela para marcar como <b>pago</b>.',
        'Marcou por engano? Num pedido pago, o botão <b>↻</b> volta para <i>em aberto</i>.',
        'Para corrigir valor, descrição ou vencimento, clique no <b>lápis</b>, altere e salve.',
      ], fig: ['sup-1-pedidos', 'Aba Pedidos: indicadores, à vista × parcelado e a lista com as ações (✓ pago, lápis editar).'] },
      { titulo: 'Conferir um mês', passos: [
        'Abra a aba <b>Pedidos do mês</b> e escolha o ano e o mês.',
        'Os quadros mostram o que está em aberto, vencido e pago no mês e o total. Use os filtros e a busca para achar um pedido.',
        'Para levar para uma planilha, clique em <b>Exportar</b>.',
      ], fig: ['sup-4-mes', 'Pedidos do mês.'] },
    ],
  },
  parceiros: {
    video: true,
    nome: 'Prestação de Contas — Comissão de Parceiros',
    descricao: 'Calcula, registra e acompanha a comissão mensal dos parceiros. A <b>competência</b> é o mês dos valores; a comissão é paga no <b>mês seguinte</b>.',
    dados: 'Os lançamentos, os parceiros e os condomínios ficam no banco do portal e são compartilhados pela equipe.',
    abas: [
      ['Prestações do mês', 'Visão da competência escolhida: o total de comissão e quando será pago, quantos parceiros têm comissão apurada, quantos já foram lançados e pagos. Para cada parceiro: recorrência, boletos, venda e total, com o controle de <b>enviado por e-mail</b> e <b>pagamento</b>, o <b>Relatório</b> (prestação de contas condomínio a condomínio, para imprimir ou baixar em PDF) e <b>Baixar todos os PDFs (ZIP)</b>. Em <b>Manutenção</b>, apaga os lançamentos de competências antigas.'],
      ['Lançamento', 'Onde se lançam os valores do mês, parceiro por parceiro, com a leitura automática dos <b>PDFs dos balanços da garantidora</b> e a comissão prevista.'],
      ['Condomínios', 'A carteira: cada condomínio com o parceiro vinculado (ou dois, quando a comissão é compartilhada), o valor por boleto e o último lançamento.'],
      ['Parceiros', 'O cadastro de cada parceiro com as <b>condições da parceria</b> (percentual, tarifa bancária, piso do boleto, encargos, comissão de venda), categorias e a carteira dele.'],
    ],
    comoUsar: [
      { titulo: 'Cadastrar um parceiro', onde: 'aba Parceiros', passos: [
        'Clique em <b>Cadastrar parceiro</b>.',
        'Em <b>Identificação</b>, preencha o <b>nome do parceiro</b>, a UF e a <b>observação do contrato</b>.',
        'Em <b>Condições da parceria</b>, informe o <b>percentual</b> da comissão mensal e escolha: <b>Tarifa bancária</b> (<i>entra na base</i>, <i>excedente por boleto (valor cheio)</i> ou <i>10% do excedente por boleto</i>) com o <b>piso do boleto</b>; <b>Encargos</b> (<i>entram na base</i> ou <i>fora da base</i>); <b>Comissão de venda</b> (<i>sem cláusula</i>, <i>1º mês de arrecadação</i> ou <i>mês subsequente</i>), o <b>% venda</b> e a <b>base da venda</b> (<i>1ª Tx. Serviço</i> ou <i>1ª Tx. Serviço + 1ª tarifa</i>).',
        'Marque as <b>categorias</b> do parceiro.',
        'Em <b>Condomínios da carteira</b> (opcional), escreva um condomínio por linha. Se a comissão for dividida com outro parceiro, escreva <b>(5%)</b> depois do nome. Se o condomínio já existir, o parceiro é adicionado a ele.',
        'Clique em <b>Cadastrar parceiro</b>.',
      ], dica: '<b>Categorias em massa</b> e <b>Sugerir pelo cadastro</b> ajudam a classificar vários parceiros de uma vez.' },
      { titulo: 'Cadastrar ou corrigir um condomínio', onde: 'aba Condomínios', passos: [
        'Clique em <b>+ Condomínio</b> (ou no condomínio, para editar).',
        'Informe o <b>nome</b> e o <b>valor por boleto</b>.',
        'Em <b>Parceiros vinculados</b>, use <b>Adicionar parceiro</b>. Com dois parceiros, a comissão é compartilhada (o 2º parceiro precisa ser diferente).',
        'Clique em <b>Salvar</b>.',
      ] },
      { titulo: 'Lançar o mês de um parceiro', onde: 'aba Lançamento', passos: [
        'Escolha a <b>competência</b> (o mês dos valores) e o <b>parceiro</b>. Aparecem os condomínios da carteira dele.',
        'Em <b>Balanços da garantidora</b>, clique para escolher ou arraste os <b>PDFs</b> do mês. Os valores são lidos e preenchidos sozinhos. Condomínios fora da carteira ou PDFs ilegíveis aparecem avisados.',
        'Confira, para cada condomínio, <b>Tx. Serviço Recebida</b>, <b>Tarifa Bancária</b>, <b>Multa</b>, <b>Juros</b>, <b>Encargos</b> e <b>Correção</b>. Marque a <b>venda</b> no mês em que ela deve ser paga.',
        'Preencha a <b>tarifa bancária do mês</b>: valor por boleto e quantidade de boletos emitidos.',
        'Confira a <b>comissão prevista</b> e clique em <b>Salvar</b> ou <b>Salvar e ver relatório</b>.',
      ], atencao: 'A <b>correção</b> fica registrada para conferência, mas nunca entra na base da comissão. O piso do boleto só vale para as regras de excedente: o parceiro recebe <b>(valor por boleto − piso) × quantidade de boletos emitidos</b>; a tarifa bancária do balanço não entra nessa conta.' },
      { titulo: 'Gerar, enviar e pagar a prestação de contas', onde: 'aba Prestações do mês', passos: [
        'Escolha a <b>competência</b>. O topo mostra o total de comissão e o mês em que será paga.',
        'Na linha do parceiro, clique em <b>Relatório</b>, confira e use <b>Imprimir</b> ou <b>Baixar PDF</b> (depois, <b>← Voltar</b>). Para todos de uma vez: <b>Baixar todos os PDFs (ZIP)</b>, um PDF por parceiro.',
        'Envie o PDF ao parceiro e marque <b>Enviado por e-mail</b>, com a data.',
        'Quando pagar, marque <b>Pagamento</b>, com a data e o valor pago.',
        'Precisa corrigir um valor? Use o <b>lápis</b> (Editar valores) na linha do parceiro.',
      ], dica: 'Use a busca e os filtros (enviados, pagos) para ver o que falta enviar ou pagar.' },
      { titulo: 'Limpar competências antigas', onde: 'aba Prestações do mês → Manutenção', passos: [
        'Em <b>Manter a partir de</b>, escolha o mês e o ano.',
        'Clique em <b>Apagar anteriores</b>. Somem os lançamentos e o controle de envio e pagamento das competências anteriores. Parceiros e condomínios não são afetados.',
      ], atencao: 'Não há como desfazer. Antes, baixe os PDFs das competências que vai apagar.' },
    ],
    rotina: [
      'Confira os cadastros nas abas <b>Parceiros</b> e <b>Condomínios</b> (as comissões de novos condomínios aprovadas chegam pelo módulo Comissões de Novos Condomínios).',
      'Na aba <b>Lançamento</b>, lance cada parceiro com os balanços da garantidora.',
      'Na aba <b>Prestações do mês</b>, gere os relatórios, envie e marque <b>enviado por e-mail</b>.',
      'No mês seguinte, ao pagar, marque o <b>pagamento</b>.',
    ],
  },
  boletos: {
    video: true,
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
    video: true,
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
    abas: [
      ['Comercial', 'A lista dos condomínios do mês: a gestão comercial importa a planilha de implantações; cada executivo vê os seus e informa a comissão de cada um.'],
      ['Aprovação da gestão', 'O que está aguardando aprovação, para aprovar ou devolver, e todos os condomínios do mês.'],
      ['Financeiro', 'O resumo do mês e as comissões aprovadas, para cadastrar na Prestação de Contas — Comissão de Parceiros.'],
      ['Acessos', 'Quem faz o quê no módulo: executivo, gestão comercial ou financeiro.'],
      ['Topo', 'O <b>mês de entrada</b> dos condomínios e o botão <b>Excel do mês</b>, que baixa a planilha do mês.'],
    ],
    comoUsar: [
      { titulo: 'Dar acesso e definir os papéis', quem: 'Gestão comercial', onde: 'aba Acessos', passos: [
        'Primeiro, a pessoa precisa ter a ferramenta liberada no portal (Usuários e acessos, pela administração ou pelo coordenador do setor) e abrir o módulo uma vez. Só então ela aparece na aba Acessos.',
        'Na aba <b>Acessos</b>, marque os <b>papéis</b> da pessoa: <b>executivo</b>, <b>gestão comercial</b> ou <b>financeiro</b>.',
        'Para o executivo, escolha em <b>Executivo na planilha</b> o nome dele como aparece na planilha de implantações.',
      ], dica: 'Enquanto ninguém for definido como gestão, todos que abrem o módulo veem todas as abas.' },
      { titulo: 'Importar os condomínios do mês', quem: 'Gestão comercial', onde: 'aba Comercial', passos: [
        'Clique em <b>Importar planilha do mês</b> (ou arraste o arquivo) e escolha a <b>planilha de implantações</b> (.xlsx, .xls ou .csv).',
        'Confira o <b>mês de entrada dos condomínios</b> (sugerido pelo 1º vencimento) e o resumo: o que é <i>novo</i> e o que <i>atualiza</i>.',
        'Clique em <b>Importar</b>. Cada executivo passa a ver os condomínios dele.',
      ] },
      { titulo: 'Informar a comissão de um condomínio', quem: 'Executivo', onde: 'aba Comercial', passos: [
        'Na lista dos seus condomínios (use a busca por condomínio, ADM ou parceiro), clique no condomínio.',
        'Responda <b>Este condomínio veio por parceiro?</b>: <b>Não tem parceiro</b> (sem comissão) ou <b>Sim, tem parceiro</b>.',
        'Escolha o <b>parceiro</b>. Se a ADM informada sugerir um parceiro, confirme. Se ele ainda não estiver cadastrado, use <b>Outro — parceiro ainda não cadastrado</b> e escreva o nome.',
        'Marque a comissão: <b>Recorrência</b> (<i>Só este parceiro</i>: 10% do que a MyBlue arrecada no condomínio, todo mês; ou <i>Dividido com outro parceiro</i>: 5% para cada um, escolhendo o segundo parceiro) e/ou <b>Comissão de venda</b> (50% da 1ª taxa administrativa, paga uma vez).',
        'Se quiser, escreva uma <b>observação para a gestão</b> e clique em <b>Enviar para aprovação</b>.',
      ], dica: 'Se a gestão devolver, o condomínio aparece com <b>Devolvido pela gestão</b> e o motivo. Corrija e envie de novo.' },
      { titulo: 'Aprovar ou devolver', quem: 'Gestão comercial', onde: 'aba Aprovação da gestão', passos: [
        'Em <b>Aguardando sua aprovação</b>, confira a comissão informada, quem respondeu e a observação.',
        'Clique em <b>Aprovar</b>, ou em <b>Aprovar todos</b> para aprovar a fila inteira.',
        'Se algo estiver errado, clique em <b>Devolver</b> e escreva <b>o que precisa ser corrigido</b>. O executivo vê o motivo.',
        'Em <b>Todos os condomínios do mês</b>, acompanhe as respostas, <b>reabra</b> uma aprovação ou remova uma linha importada por engano.',
      ] },
      { titulo: 'Cadastrar na Prestação de Contas', quem: 'Financeiro', onde: 'aba Financeiro', passos: [
        'Confira o resumo do mês: aprovados com comissão, a lançar, recorrência, venda, sem comissão e ainda não aprovados.',
        'Em <b>Comissões aprovadas</b>, cada linha mostra a situação: <i>Parceiro não cadastrado</i>, <i>Pronto para cadastrar</i> ou <i>Cadastrado</i>. Se o parceiro não estiver cadastrado, cadastre-o antes na Prestação de Contas (aba Parceiros).',
        'Clique em <b>Cadastrar</b>, confira o <b>nome do condomínio na Prestação de Contas</b> e os <b>vínculos que serão criados</b>, e confirme. Para vários de uma vez: <b>Cadastrar todos prontos</b>.',
        'Se você já fez o cadastro direto na Prestação de Contas, use <b>Já cadastrei manualmente</b>.',
        'Comissão de venda: marque a venda no <b>1º lançamento</b> do condomínio na Prestação de Contas (aba Lançamento).',
      ], dica: '"Cadastrar" cria o condomínio e o vínculo com o parceiro na Prestação de Contas, que passa a calcular a comissão. O pagamento é no mês seguinte ao de entrada.' },
    ],
    rotina: [
      '<b>Gestão comercial:</b> no início do mês, importa a planilha de implantações.',
      '<b>Executivos:</b> informam a comissão de cada condomínio e enviam para aprovação.',
      '<b>Gestão comercial:</b> aprova ou devolve.',
      '<b>Financeiro:</b> cadastra as aprovadas na Prestação de Contas.',
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
    // como a comissão de um condomínio novo passa de uma ferramenta para a outra
    fluxo: [
      'O Comercial fecha um condomínio novo. No início do mês, a gestão comercial importa a planilha de implantações em <b>Comissões de Novos Condomínios</b>.',
      'O executivo informa se o condomínio veio por parceiro e qual comissão gera; a gestão comercial aprova ou devolve.',
      'O financeiro, na aba <b>Financeiro</b> das Comissões, clica em <b>Cadastrar</b>: o condomínio e o vínculo com o parceiro são criados na <b>Prestação de Contas — Comissão de Parceiros</b>.',
      'A partir daí, a subárea Parceiros lança o condomínio todo mês junto com a carteira do parceiro (aba <b>Lançamento</b>), gera o relatório, envia e marca o pagamento, que sai no mês seguinte ao da competência.',
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
