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
    video: true,
    nome: 'Central de Ferramentas — Crédito',
    descricao: 'Reúne as automações do dia a dia do Crédito. Cada ferramenta lê o arquivo recebido (PDF ou Excel) e devolve o documento pronto: PDF, planilha no modelo da Vouch ou ZIP.',
    dados: 'Não guarda dados no servidor: tudo roda no navegador, e cada documento é montado na hora e baixado.',
    tituloAbas: 'Ferramentas da central',
    abas: [
      ['Montador de Prestação de Contas', 'Condomínio Garantido e Não Garantido: junta relatórios, comprovantes e protocolos em um único PDF.'],
      ['Recibo de Entrega (RN)', 'Lê o relatório de garantia e gera um recibo em PDF por condomínio.'],
      ['Recibos Nobremotoboys', 'Entrega de boletos: lê a planilha e gera um recibo em PDF por condomínio (ZIP).'],
      ['Automação de Balancetes', 'Organiza o balancete recebido no formato aceito pela Vouch (Padrão / Gestart).'],
      ['Planilha de Moradores', 'Transforma o cadastro recebido no modelo de importação da Vouch, com a aba de pendências (quem está sem CPF, telefone ou e-mail).'],
      ['Consumos (Água e Gás)', 'Casa o consumo recebido (PDF ou Excel) com o modelo de unidades da Vouch.'],
      ['Divisor de Recibos (Gráfica)', 'Separa o PDF de protocolos de entrega e reconcilia os boletos com cada responsável.'],
    ],
    obs: 'O botão <b>Ferramentas</b> volta para a lista; <b>Abrir em nova aba</b> usa a ferramenta em tela cheia.',
  },
  cobranca: {
    nome: 'Central de Ferramentas — Cobrança / Gestão',
    descricao: 'Reúne as ferramentas de gestão da Cobrança. As análises são feitas na hora, com os arquivos que você carrega.',
    dados: 'Não guarda dados no servidor: as análises são feitas na hora com os arquivos que você carrega.',
    abas: [
      ['Produtividade da equipe', 'Acompanha a produção de cada pessoa da equipe de cobrança.'],
      ['Geração de mailing', 'Monta listas de contato (mailing) a partir dos arquivos de cobrança.'],
    ],
  },
  renegociacoes: {
    video: true,
    nome: 'Controle de Renegociações e Tickets',
    descricao: 'Controle próprio do CS para as renegociações de contrato, a perda de receita no exercício e os tickets do Sucesso do Cliente.',
    dados: 'Os registros ficam no banco do portal e são compartilhados pela equipe.',
    obs: 'Esta ferramenta é o controle próprio do CS. A <b>Central de Tickets</b> do portal é outra coisa: serve para as demandas <b>entre os setores</b> da MyBlue. '
      + 'A ligação entre as duas é automática: ao salvar uma renegociação como <b>Fechado</b>, o portal abre um ticket <i>Renegociação fechada</i> para a <b>assistente de crédito</b> do condomínio na Carteira, com as condições fechadas e o PDF do relatório de garantia anexado (quando você anexar). '
      + 'O condomínio é procurado na Carteira pelo nome e pela UF; se não for achado, o ticket vai para o líder do Crédito e você recebe um aviso para conferir o nome. '
      + 'Mudou alguma condição depois? Salve de novo: o mesmo ticket recebe um comentário com o antes e o depois (e é reaberto, se já estava resolvido). Acompanhe em <b>Central de Tickets → Abertos por mim</b>.',
    abas: [
      ['Renegociações', 'Registro de cada renegociação de contrato com o condomínio, inclusive o tipo de negociação e, na antecipação, os dias de antecipação e de vencimento (tudo fica no banco do portal). Salvar como <b>Fechado</b> abre o ticket para a assistente de crédito.'],
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
        'Se o parceiro tem regra de boleto, preencha, em cada condomínio, o <b>valor por boleto</b> e a <b>quantidade de boletos emitidos</b>.',
        'Confira a <b>comissão prevista</b> e clique em <b>Salvar</b> ou <b>Salvar e ver relatório</b>.',
      ], atencao: 'A <b>correção</b> fica registrada para conferência, mas nunca entra na base da comissão. Nas regras de <b>excedente por boleto</b>, o repasse é (valor por boleto − piso) × quantidade de boletos emitidos: a tarifa bancária do balanço não entra nessa conta. Ao salvar, os valores gravam por cima do que já existia; se um condomínio ficar sem valores, a ferramenta pede confirmação antes de apagar o lançamento dele.' },
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
    dados: 'Fica no banco do portal e é compartilhado por toda a equipe, ao vivo: o que uma pessoa marca aparece para as outras em poucos segundos. O histórico mostra quem fez cada alteração. Os condomínios vêm da <b>Carteira de condomínios</b> do portal.',
    obs: 'Faça o <b>fechamento da competência</b> todo mês: ele bloqueia os registros do mês e gera o Excel de arquivo. Use <b>Salvar backup</b> no fechamento. Condomínio novo, distrato, responsável e vencimento se mudam na <b>Carteira</b>, não no Cadastro da ferramenta.',
    abas: [
      ['Painel', 'Números da competência: emitidos (e % da carteira), no prazo, emitidos com atraso, atrasados, meta em até 3 dias, pendentes e erros de emissão; o <b>fechamento da competência</b> e os emitidos por semana.'],
      ['Comparativo', 'Compara as competências fechadas entre si.'],
      ['Controle', 'A lista dos condomínios da competência: marcar a emissão (um a um ou em lote), desfazer, registrar erros de emissão e observações.'],
      ['Cadastro', 'Os condomínios acompanhados, com responsável, UF e regra de vencimento. Vêm da <b>Carteira de condomínios</b>: o que muda lá chega aqui sozinho (veja <i>Cadastro pela Carteira</i>). Um ajuste feito só aqui volta a ficar igual à Carteira quando ela mudar aquele dado.'],
      ['Distratados', 'Os condomínios encerrados (distratados na Carteira), com a data em que saíram do controle e a última emissão registrada; os sem data aparecem em destaque.'],
      ['Feriados', 'Os feriados, que não contam como dia útil no cálculo da meta.'],
      ['Histórico', 'Quem fez cada alteração e quando, com a opção de <b>desfazer</b>. O que veio da Carteira aparece como <i>Carteira: …</i>.'],
    ],
    comoUsar: [
      { titulo: 'Cadastro pela Carteira de condomínios', quem: 'Coordenação do Crédito (ou administração)', onde: 'portal: Gestão do setor → Ferramentas do setor → Controle de Emissão de Boletos', passos: [
        'Na janela da ferramenta, a seção <b>Cadastro pela Carteira de condomínios</b> compara o cadastro do controle com a Carteira. Cada condomínio fica vinculado pelo <b>ID Vouch</b>.',
        '<b>Nomes parecidos</b> (mesmo condomínio com outra grafia): marque os que são o mesmo. Os de UF diferente vêm desmarcados; desmarcado fica para depois.',
        '<b>Novos na Carteira</b> entram a partir da <b>primeira competência ainda sem emissão</b>, ou do mês seguinte à vigência, quando ela é mais recente (o 1º boleto sai pela Implantação).',
        '<b>Mudanças da Carteira</b>: distrato, responsável, UF, vencimento ou nome. O distratado sai do controle a partir da mesma competência; os meses em andamento ficam como estão, inclusive o vencimento (marcado como <i>manual</i>).',
        '<b>No controle e não na Carteira</b>: marque os que devem sair do controle.',
        'Clique em <b>Aplicar no controle</b>. Na primeira vez, isso liga o automático.',
      ], dica: 'Depois da primeira conferência, toda mudança na Carteira e toda competência criada (<i>Criar próximo mês</i>) chegam sozinhas ao controle. Nomes parecidos e condomínios fora da Carteira continuam esperando a conferência na janela.' },
    ],
  },
  comissoes: {
    video: true,
    nome: 'Comissões de Novos Condomínios',
    descricao: 'O caminho da comissão de cada condomínio novo, do comercial ao financeiro: a gestão comercial puxa da Carteira de condomínios os que entraram na vigência, o executivo informa se o condomínio veio por parceiro e qual comissão gera, a gestão aprova e o financeiro cadastra na Prestação de Contas.',
    dados: 'Os dados ficam no banco do portal e são compartilhados por quem tem acesso à ferramenta.',
    abas: [
      ['Comercial', 'A lista dos condomínios do mês (ID Vouch, executivo, ADM, vencimento): cada executivo vê os seus e informa a comissão de cada um.'],
      ['Aprovação da gestão', 'O botão <b>Puxar da carteira</b>, o que está aguardando aprovação (para aprovar ou devolver) e todos os condomínios do mês.'],
      ['Financeiro', 'O resumo do mês e as comissões aprovadas, para cadastrar na Prestação de Contas — Comissão de Parceiros.'],
      ['Acessos', 'Quem faz o quê no módulo: executivo, gestão comercial ou financeiro.'],
      ['Topo', 'O <b>mês de entrada</b> dos condomínios e o botão <b>Excel do mês</b>, que baixa a planilha do mês.'],
    ],
    comoUsar: [
      { titulo: 'Dar acesso e definir os papéis', quem: 'Gestão comercial', onde: 'aba Acessos', passos: [
        'Primeiro, a pessoa precisa ter a ferramenta liberada no portal (Usuários e acessos, pela administração ou pelo coordenador do setor) e abrir o módulo uma vez. Só então ela aparece na aba Acessos.',
        'Na aba <b>Acessos</b>, marque os <b>papéis</b> da pessoa: <b>executivo</b>, <b>gestão comercial</b> ou <b>financeiro</b>.',
        'Para o executivo, escolha em <b>Executivo na planilha</b> o nome dele como aparece no campo <b>Executivo de negócios</b> da Carteira de condomínios.',
      ], dica: 'Enquanto ninguém for definido como gestão, todos que abrem o módulo veem todas as abas.' },
      { titulo: 'Puxar os condomínios da carteira', quem: 'Gestão comercial', onde: 'aba Aprovação da gestão', passos: [
        'Os condomínios novos entram antes na <b>Carteira de condomínios</b>, pela aba <b>Adicionar novos</b> (planilha de implantação), com ID Vouch, vigência e executivo de negócios.',
        'Na Comissões, clique em <b>Puxar da carteira</b> e escolha a <b>vigência</b> (mês de entrada dos condomínios).',
        'Confira a lista: ID Vouch, condomínio, UF, vencimento, ADM e executivo vêm da carteira. Os <i>sem executivo</i> só a gestão vê e responde, até completar na carteira.',
        'Clique em <b>Puxar para a Comissões</b>. Cada executivo passa a ver os condomínios dele.',
      ], dica: 'Puxar de novo a mesma vigência atualiza os dados vindos da carteira (executivo, ADM…) sem apagar as respostas.' },
      { titulo: 'Informar a comissão de um condomínio', quem: 'Executivo', onde: 'aba Comercial', passos: [
        'Na lista dos seus condomínios (use a busca por condomínio, ADM ou parceiro), clique no condomínio.',
        'Responda <b>Este condomínio veio por parceiro?</b>: <b>Não tem parceiro</b> (sem comissão) ou <b>Sim, tem parceiro</b>.',
        'Escolha o <b>parceiro na lista</b> (os cadastrados na Prestação de Contas). Se a ADM informada sugerir um parceiro, confirme. Se ele ainda não estiver na lista, peça ao Financeiro, por um ticket no portal, para cadastrá-lo.',
        'Marque a comissão: <b>Recorrência</b> (<i>Só este parceiro</i>: 10% do que a MyBlue arrecada no condomínio, todo mês; ou <i>Dividido com outro parceiro</i>: 5% para cada um, escolhendo o segundo parceiro) e/ou <b>Comissão de venda</b> (50% da 1ª taxa administrativa, paga uma vez).',
        'Se quiser, escreva uma <b>observação para a gestão</b> e clique em <b>Enviar para aprovação</b>.',
      ], dica: 'Se a gestão devolver, o condomínio aparece com <b>Devolvido pela gestão</b> e o motivo. Corrija e envie de novo.' },
      { titulo: 'Aprovar ou devolver', quem: 'Gestão comercial', onde: 'aba Aprovação da gestão', passos: [
        'Em <b>Aguardando sua aprovação</b>, confira a comissão informada, quem respondeu e a observação.',
        'Clique em <b>Aprovar</b>, ou em <b>Aprovar todos</b> para aprovar a fila inteira.',
        'Se algo estiver errado, clique em <b>Devolver</b> e escreva <b>o que precisa ser corrigido</b>. O executivo vê o motivo.',
        'Em <b>Todos os condomínios do mês</b>, acompanhe as respostas, <b>reabra</b> uma aprovação ou remova um condomínio puxado por engano.',
      ] },
      { titulo: 'Cadastrar na Prestação de Contas', quem: 'Financeiro', onde: 'aba Financeiro', passos: [
        'Confira o resumo do mês: aprovados com comissão, a lançar, recorrência, venda, sem comissão e ainda não aprovados.',
        'Em <b>Comissões aprovadas</b>, cada linha mostra a situação: <i>Parceiro não cadastrado</i>, <i>Pronto para cadastrar</i> ou <i>Cadastrado</i>. Para respostas antigas com parceiro fora da lista, escolha o parceiro cadastrado ou <b>+ Cadastrar novo parceiro na Prestação de Contas</b> (nome e UF já vêm preenchidos; condições padrão).',
        'Clique em <b>Cadastrar</b>, confira o <b>nome do condomínio na Prestação de Contas</b> e os <b>vínculos que serão criados</b>, e confirme. Para vários de uma vez: <b>Cadastrar todos prontos</b>.',
        'Se você já fez o cadastro direto na Prestação de Contas, use <b>Já cadastrei manualmente</b>.',
        'Comissão de venda: marque a venda no <b>1º lançamento</b> do condomínio na Prestação de Contas (aba Lançamento).',
      ], dica: '"Cadastrar" cria o condomínio e o vínculo com o parceiro na Prestação de Contas, que passa a calcular a comissão. O pagamento é no mês seguinte ao de entrada.' },
    ],
    rotina: [
      '<b>Gestão comercial:</b> no início do mês, puxa da carteira os condomínios da vigência.',
      '<b>Executivos:</b> informam a comissão de cada condomínio e enviam para aprovação.',
      '<b>Gestão comercial:</b> aprova ou devolve.',
      '<b>Financeiro:</b> cadastra as aprovadas na Prestação de Contas.',
    ],
  },
  partnerchip: {
    video: true,
    nome: 'PartnerChip — Resultados',
    descricao: 'Painel de resultados dos parceiros para o Financeiro, o Comercial e a Diretoria: carteira, comissão apurada, paga e a pagar, por ano, a partir da Prestação de Contas.',
    dados: 'Os números vêm da Prestação de Contas — Comissão de Parceiros. O painel recalcula quando alguém com acesso à Prestação de Contas o abre; quem tem só o PartnerChip vê a última apuração.',
    abas: [
      ['Visão geral', 'Comissão apurada no ano, pago, a pagar, parceiros ativos e condomínios na carteira; o gráfico de apurado e pago por mês.'],
      ['Parceiros', 'Cada parceiro com carteira, regra, apurado, pago, a pagar e a situação da última competência. Clique no parceiro para abrir a <b>ficha</b>: regras do contrato, condomínios e o histórico de prestações.'],
      ['Condomínios', 'Cada condomínio com o(s) parceiro(s), a comissão do último mês e do ano.'],
      ['Filtros e Excel', 'Ano, estado, categoria e busca; <b>Excel</b> exporta o painel.'],
    ],
  },
  patrocinio: {
    video: true,
    nome: 'Central de Patrocínio',
    descricao: 'Recibos de patrocínio de eventos dos condomínios: emite o recibo com a faixa e o valor calculados pelo rateio (VOP) e acompanha envio, assinatura e pagamento.',
    dados: 'Os recibos ficam no banco do portal e são compartilhados pela equipe.',
    abas: [
      ['Novo recibo', 'Anexe o relatório de garantia (PDF) para ler nome, CNPJ e rateio, ou preencha à mão. A faixa VOP e o valor a pagar saem sozinhos (até R$ 15 mil: R$ 150; R$ 15–40 mil: R$ 200; R$ 40–70 mil: R$ 250; R$ 70–100 mil: R$ 350; acima: R$ 400). <b>Salvar e baixar PDF</b> guarda e baixa o recibo; <b>Copiar e-mail</b> monta o texto para o síndico.'],
      ['Recibos', 'Por mês: o que falta enviar, aguardando assinatura, a pagar e pagos. Em cada linha, marque <b>enviado</b>, <b>assinado</b> e <b>pago</b>; baixe o PDF de novo, edite ou veja o histórico.'],
      ['Resultados', 'Lançado e pago no ano, a pagar, recibos sem assinatura, condomínios patrocinados, o gráfico por mês e o andamento das etapas. Exporta para Excel.'],
    ],
  },
  viagens: {
    video: true,
    nome: 'Gestão de Viagens',
    descricao: 'Viagens a trabalho, da solicitação ao que foi pago: cotações de hospedagem, passagens e locação, ajuda de custo automática, aprovação e o dashboard de gastos.',
    dados: 'As viagens ficam no banco do portal e são compartilhadas pela equipe, ao vivo.',
    abas: [
      ['Viagens', 'Indicadores (em cotação, aguardando aprovação, viagens e gasto do mês) e a lista com filtros por mês e situação. <b>Nova viagem</b> abre o cadastro: dados da viagem (ou importação do pedido em PDF), itens com uma ou mais <b>cotações</b> (marque a escolhida) e a <b>ajuda de custo</b> (diária pela região do destino × dias).'],
      ['Etapas', '<b>Em cotação</b> → <b>Enviar para aprovação</b> → quem aprova <b>aprova</b>, <b>reprova</b> (com motivo) ou volta para cotação → depois da viagem, informe o <b>valor pago</b> de cada item e marque <b>Realizada</b>. Viagens aprovadas podem ser canceladas ou editadas (voltam para aprovação).'],
      ['Dashboard de gastos', 'Gasto total, realizado, previsto e economia nas cotações, por tipo de despesa, setor, colaborador e mês.'],
      ['Configurações', 'Diária da ajuda de custo por região, como contar os dias e a lista de setores.'],
    ],
  },
  // as regras e os percentuais ficam só na ferramenta (fora do repositório) e no banco do portal: aqui, nada de valores
  premiacoes: {
    video: true,
    nome: 'Gestão de Premiações',
    descricao: 'Metas e comissões de todos os setores num lugar só: o lançamento do mês, o dashboard, o resumo por pessoa, o fechamento e o envio dos demonstrativos para cada pessoa em Minhas Premiações.',
    dados: 'Os dados ficam no banco do portal. Só abre quem a administração liberar; cada pessoa vê o próprio demonstrativo em Minhas Premiações. As regras e percentuais ficam na própria ferramenta (aba Parâmetros) e no manual da ferramenta, entregue à gestão de premiações.',
    abas: [
      ['Dashboard', 'Total do mês, comissão e % atingido por setor, evolução mês a mês, metas do Comercial e a carteira de Crédito e Cobrança. Pendências do mês num quadro só.'],
      ['Resumo', 'O que cada pessoa recebe e de onde vem cada valor, o fechamento por setor (rascunho, conferido, aprovado, pago), os ajustes manuais com motivo e o envio dos demonstrativos.'],
      ['Planilhas do mês', 'Pedir as planilhas do mês (Crédito, Implantação, metas dos setores; a Cobrança não tem planilha: vem do Acompanhamento de Resultados). O pedido vai para o coordenador do setor, que recebe um aviso só e envia a planilha de cada pessoa da equipe em Minhas Premiações; quando todas estão enviadas, a gestão recebe um aviso só no sino e importa no quadro da pessoa com <b>Importar e conferir</b>.'],
      ['Comercial', 'Em dois passos: a <b>planilha de implantações</b> (entram os contratos com data de contrato no mês, com o executivo de cada um) e os <b>relatórios de garantia</b> da Vouch (os valores entram no contrato pelo CNPJ). Cada executivo abre a lista dos condomínios dele, com a média ponderada da taxa adm. e a faixa; também a gerência e a coordenação comercial.'],
      ['Crédito, Cobrança e Implantação', 'O envio dos boletos, a Cobrança puxada do <b>Acompanhamento de Resultados</b> (escolha a <b>vigência</b>, a competência dos vencimentos analisados que aparece no demonstrativo, e clique em <b>Puxar do Acompanhamento de Resultados</b>: entram os condomínios apurados de cada analista, iguais aos de “Minha carteira”) e a Implantação pela planilha completa da assistente (Implantados, Documentação e Onboarding). Depois de revisar, <b>Mostrar só os que não bateram</b> filtra o que ficou fora da meta.'],
      ['Supervisão e coordenação', 'Calculada sozinha a partir das equipes.'],
      ['Metas dos setores', 'Uma aba por setor (Sucesso do Cliente, Marketing, Jurídico, Administrativo…) com as métricas do mês. Sucesso do Cliente importa a planilha “Para Preencher”; Administrativo, o acompanhamento de atividades (% de SLA de cada métrica); Marketing, o <b>Balanço de Marketing</b> em PDF (as tabelas em imagem são lidas e conferidas com o resumo do próprio PDF). Uma meta pode ser % de outra (ex.: qualificados = 10% dos leads, arredondado).'],
      ['Configuração', '<b>Pessoas e salários</b> (login de cada pessoa no portal, diretoria e o atalho <b>lançar ›</b> para o quadro da pessoa), <b>Parâmetros</b> com as regras e <b>Importar</b> (cópia de segurança e começar do zero).'],
    ],
    rotina: [
      'Abra o mês na competência e, em <b>Planilhas do mês</b>, peça as planilhas (o pedido vai para o coordenador de cada setor).',
      'Conforme chegam os avisos, <b>Importar e conferir</b> cada planilha. No Comercial, envie a planilha de implantações e depois os relatórios de garantia.',
      'Confira no Dashboard e no Resumo; cada setor passa por conferido e aprovado.',
      'Feche o mês e clique em <b>Enviar para todos</b>: cada pessoa recebe o aviso e vê o demonstrativo em Minhas Premiações.',
      'Acompanhe quem abriu e quem clicou em <b>Estou ciente</b> no quadro de envio do Resumo.',
    ],
  },
  repasses: {
    video: true,
    nome: 'Controle de Repasses',
    descricao: 'Os valores repassados aos condomínios, dia a dia: lança o arquivo exportado do sistema com a conferência pronta (já lançado, conta nova ou diferente da cadastrada, apelido fora da carteira), corrige o dia, gera a planilha do Financeiro e mostra o ano, o mês, cada condomínio e o que está atrasado.',
    dados: 'Os lançamentos, as contas bancárias, as regras de repasse e os vencimentos diferenciados ficam no banco do portal e são compartilhados pela equipe (atualiza a cada 20 s). Responsável, UF, situação, razão social e CNPJ vêm da <b>Base de Clientes</b> (carteira do portal).',
    abas: [
      ['Repasses do dia', 'A <b>próxima janela de repasse</b> (lançamentos, valor e atrasados) e os próximos 14 dias. Passo <b>1 · Lançar repasses</b>: arraste o arquivo do sistema (.xls, .xlsx, .csv ou texto colado) ou use <b>Adicionar lançamento</b>; cada linha vem conferida (já lançado vem desmarcado; conta nova ou diferente da cadastrada: <b>Usar a cadastrada</b> ou <b>Cadastrar esta conta</b>) e <b>Gravar no portal</b> grava, com <b>Desfazer</b> logo depois. Passo <b>2 · Conferir e corrigir o dia</b>: escolha o dia, clique na linha para corrigir valor, data, apelido, descrição ou conta, marque a <b>ocorrência</b> (estorno, conta errada, duplicado, pendente, suspenso, cancelado) e use <b>Sugerir contas vazias</b>. Passo <b>3 · Enviar ao Financeiro</b>: confere as pendências e baixa a planilha do dia (ou abre o e-mail). Passo 4 (opcional): confere com o extrato do banco.'],
      ['Visão geral', 'Total do ano por tipo (normais, antecipações, não garantidos, compra do passivo), contas de terceiros e programado, os gráficos e a evolução mês a mês, e o valor por responsável.'],
      ['Visão mensal', 'O mês escolhido no topo: realizado e a realizar, o calendário (dias com repasse, programados, sem repasse e feriados) e os quadros por tipo, responsável, UF e os 10 maiores condomínios.'],
      ['Condomínios', '<b>Repasses por mês</b> de cada condomínio (busca e só contas de terceiros), <b>Contas bancárias</b>, <b>Regras de repasse</b> (antecipações e repasses mensais previstos no contrato) e o <b>Histórico</b> de cada condomínio.'],
      ['Alertas', 'Condomínios ativos sem repasse no prazo (dia útil seguinte ao vencimento), os pendentes e suspensos <b>para cobrar</b> (com <b>Marcar como feito</b>), apelidos fora da carteira, pendências e possíveis duplicidades.'],
      ['Base de dados', 'O que está guardado no banco do portal, a leitura da carteira (<b>Atualizar carteira</b>), a importação de planilhas e os avisos da base (sem responsável, fora da carteira).'],
    ],
    obs: 'O quadro <b>Hoje</b>, no topo, avisa antecipações a gerar, repasses mensais do dia e regras vencendo; <b>Semana para o Financeiro</b> baixa a semana inteira. Regras de repasse e cadastro de contas são só da coordenação/supervisão. <b>Exportar anual</b> e <b>Exportar mensal</b> baixam as visões em Excel.',
  },
  gestaoCredito: {
    video: true,
    nome: 'Central de Ferramentas — Gestão Crédito',
    descricao: 'As ferramentas de repasses da coordenação de Crédito: a Conciliação de Repasses (planilha do dia × lançamentos do Protheus e × pagamentos do banco, com o registro de divergências) e o Divisor de Comprovantes. As duas usam a Carteira do portal e a mesma planilha de repasses do dia.',
    dados: 'Os arquivos são lidos no navegador. As conciliações registradas e as divergências, com tratativas e ajustes, ficam no banco do portal, compartilhadas pela equipe; os comprovantes não saem da página.',
    tituloAbas: 'Ferramentas da central',
    abas: [
      ['Conciliação de Repasses · Lançamentos (Protheus)', 'Planilha de repasses do dia (Excel ou PDF) × listagem de Pedidos de Compra do Protheus (MATA121, PDF ou Excel): o que foi previsto e não lançado, com valor diferente ou sem previsão.'],
      ['Conciliação de Repasses · Pagamentos (Banco)', 'Planilha do dia × consulta de pagamentos do Itaú do mesmo dia (Excel ou PDF): o que <b>faltou pagar</b>, o que foi pago com <b>valor diferente</b>, tentativas não efetuadas e pagamentos sem previsão. Casa pelo valor exato e pelo nome (e CNPJ da Carteira). <b>Registrar conciliação</b> guarda o dia; <b>Baixar Excel do dia</b> leva o resultado.'],
      ['Conciliação de Repasses · Divergências e Conciliações', 'O registro de divergências de todos os dias (pendentes, abertas, em análise, resolvidas), com a tratativa e o histórico de cada uma, <b>✓ Ajuste feito</b> (uma ou várias de uma vez), a divergência manual e a exportação em Excel; as conciliações registradas, dia a dia.'],
      ['Divisor de Comprovantes', 'Planilha do dia (recomendado) + um ou mais PDFs de comprovantes: cada página é identificada pelo CNPJ, pelo valor e pelo nome, com o condomínio e a assistente de crédito da Carteira; a conferência mostra repasses sem comprovante e comprovantes fora da planilha. <b>Baixar ZIP</b> gera uma pasta por responsável (ou o ZIP de uma assistente).'],
    ],
    obs: 'Comprovantes com valor repetido no dia ou de contas de terceiros ficam pendentes para você confirmar; os não identificados vão para a pasta “Não identificados”.',
  },
  hsmCredito: {
    video: true,
    nome: 'Biblioteca de HSM — Crédito e Implantação',
    descricao: 'As mensagens padrão do Crédito e da Implantação para síndicos, condôminos, administradoras e a equipe interna (grupo de WhatsApp, WhatsApp privado ou e-mail). A pessoa filtra, abre a mensagem, lê as instruções de envio e copia o texto. O que está <b>[entre colchetes]</b> muda a cada envio.',
    dados: 'As mensagens, as sugestões e a contagem de cópias ficam no banco do portal e são compartilhadas pela equipe, ao vivo. Na primeira abertura, quem pode gravar carrega a base inicial de mensagens que vem no HTML (aos poucos; se for interrompida, continua na próxima abertura).',
    abas: [
      ['Crédito', 'As mensagens das assistentes de crédito por categoria (emissão dos boletos, comunicados, repasses e contas, dúvidas de condôminos, titularidade e espólios, acesso ao app, relacionamento, assinaturas e patrocínios, sobre a MyBlue), com filtros de <b>para quem</b> (síndico e administração, condômino, equipe interna) e de <b>canal</b>, a busca e o quadro <b>Mais usadas no mês</b> (da equipe, para a gestão; as suas, para os demais), com Copiar direto. Ao abrir a mensagem, o quadro amarelo <b>Antes de enviar</b> traz as instruções (para quem, cópia, assunto, anexos), que não entram no texto copiado.'],
      ['Implantação', 'As mensagens da Implantação, na ordem das etapas do condomínio novo: 1. Boas-vindas, 2. Reunião de onboarding, 3. Documentação, 4. Comunicados, 5. Primeiro boleto, 6. Acesso ao app e site, 7. Casos especiais. Mesmos filtros, busca e Copiar.'],
      ['Sugestões', 'Quem não é da gestão sugere ajustes (botão <b>Sugerir ajuste</b> na mensagem) ou mensagens novas (<b>+ Sugerir nova mensagem</b>), com o motivo, e acompanha a resposta. A gestão vê todas: <b>Revisar</b> compara o texto atual com o sugerido; <b>Aprovar e publicar</b> troca na hora; <b>Recusar</b> exige um comentário.'],
      ['Nova mensagem (gestão)', 'Botão ao lado das abas: já vem com o setor (Crédito ou Implantação), a categoria e os filtros da tela. Tem título, categoria, canal, para quem, tags, texto com <b>prévia de como fica no WhatsApp</b> e <b>Instruções de envio</b>.'],
      ['Configurações (gestão)', 'Editar, arquivar e restaurar mensagens; as cópias de cada uma por mês (ordenar por mais ou menos copiadas) e <b>Exportar Excel</b> ou <b>PDF</b> com as duas abas.'],
    ],
    obs: 'Quem cadastra, edita e aprova é quem tem o papel <b>Gestão</b> (identificador <code>gestao_credito</code>), dado no portal em <b>Quem abre e com qual papel</b> — a coordenação também precisa recebê-lo. Sem o papel, a pessoa busca, copia e envia sugestões; com acesso só de consulta, só busca e copia.',
  },
  resultados: {
    video: true,
    nome: 'Acompanhamento de Resultados',
    descricao: 'Meta da Cobrança Administrativa por condomínio e por analista: receber, em até 30 dias do vencimento efetivo, 30% das unidades garantidas que estavam devendo no vencimento. O objetivo do setor é ter 90% dos condomínios na meta. A gestão importa a exportação do dia; cada analista acompanha a própria carteira e registra os envios, as cobranças e as observações.',
    dados: 'Os condomínios e a analista de cada um vêm da <b>Carteira de condomínios</b> do portal (só os ativos). Os resultados, registros e notas ficam no banco do portal, compartilhados ao vivo. O arquivo exportado do Vouch não é guardado: o portal lê, calcula e descarta. O resultado de cada analista é puxado pela <b>Gestão de Premiações</b> (Cobrança).',
    abas: [
      ['Visão geral', 'Carteira, condomínios na meta e o <b>% na meta</b> (objetivo 90%), o quadro de cada analista (clique para filtrar), os <b>não batidos</b> do mês, o <b>quadro por vencimento</b> e as <b>últimas atualizações</b> desde a importação anterior (quem pagou, acordos novos, quem entrou ou saiu da meta).'],
      ['Analítico', 'Mês a mês por competência e os condomínios em atenção: reincidentes, pela 1ª vez e recuperados.'],
      ['Carteiras', 'Os condomínios agrupados por vencimento: inicial, % de inadimplência, meta, atual, recebidos, resultado, envios no grupo, última cobrança e pendências. Filtros por analista, vencimento e situação; marque vários para registrar envios, cobrança ou criticidade de uma vez. Clique no condomínio para o <b>detalhe</b>: números, histórico de 6 meses, acordos, unidades em aberto e pagas, notas e o <b>registro da analista</b>.'],
      ['Envios em massa', 'Envios da gestão pelo WhatsApp: escolha analistas, vencimentos e situação; cada condomínio marcado ganha uma cobrança “pela gestão”.'],
      ['Importar', 'Exportação <b>Boletos</b> do Vouch do dia (período, filtros e colunas indicados na tela; CSV ou Excel). A prévia mostra a data de corte, as competências atualizadas e o que muda; <b>Confirmar importação</b> grava. Em <b>Fechamento dos meses</b>, <b>Fechar</b> congela o mês (não é mais recalculado).'],
      ['Ajustes de cadastro', 'Unidades retiradas do inicial, nomes do Vouch sem cadastro, condomínios ativos sem boletos e os feriados usados no vencimento efetivo.'],
      ['Ver como', 'A gestão vê a tela de cada analista: <b>Meu progresso</b>, <b>O que fazer hoje</b> (1º e 2º envio da inadimplência no grupo, atrasados e observações obrigatórias) e <b>Minha carteira</b>.'],
    ],
    obs: 'A analista é reconhecida pelo nome: o nome dela no portal tem de ser igual ao da coluna <b>Analista de cobrança</b> da Carteira. Quem abre e não é analista entra como gestão. O 1º envio da inadimplência no grupo é previsto no vencimento e o 2º, 5 dias depois (no próximo dia útil, se cair em fim de semana ou feriado); condomínio fora da meta com o prazo encerrado (ou com 7 dias ou menos) exige observação.',
  },
  mailing: {
    video: true,
    nome: 'Ajuste de Mailing',
    descricao: 'Arruma os telefones do mailing da Cobrança: lê o arquivo (.xlsx) com as colunas <b>Condomínio</b>, <b>Unidade</b>, <b>Prop. Nome</b> (ou <b>Resp. Nome</b>) e <b>Contatos</b> e gera as planilhas prontas para a ferramenta de disparo e para salvar os contatos.',
    dados: 'Não guarda nada: o arquivo é lido no navegador e as planilhas são montadas na hora e baixadas.',
    abas: [
      ['Carregar o mailing', 'Solte o .xlsx na área do topo (ou clique para escolher). Vale só a primeira aba do arquivo. Aparecem o nome do arquivo e quantas linhas, condomínios e números foram lidos.'],
      ['Ajuste de mailing', 'Um número por linha, no padrão <b>+55 DDD número</b>: tira parênteses, espaços e traços, separa os números que estavam juntos na mesma célula (vírgula, ponto e vírgula, barra ou quebra de linha) e põe o 9 no celular de 8 dígitos. <b>Com variável</b> gera as colunas <b>prop1</b> (nome do condomínio, como está no mailing) e <b>Contatos</b>; <b>Sem variável</b>, só <b>Contatos</b>. <b>Gerar planilha</b> baixa o Excel.'],
      ['Contatos para salvar', 'Planilha com <b>telefone</b> (55 + DDD + número, sem o +), <b>nome</b> e <b>grupo</b> (vazio). O nome junta a unidade, os dois primeiros nomes do proprietário (ou do responsável, se não houver) e o condomínio sem “Condomínio”, “Edifício”, “Residencial” e afins. <b>Gerar “Novos contatos”</b> baixa um arquivo por condomínio; com mais de um, todos num .zip.'],
    ],
    obs: 'Linhas sem condomínio ou sem contato ficam de fora. Telefone fixo também entra na lista (a ferramenta não separa fixo de celular). Se faltar a coluna Condomínio ou Contatos, aparece o aviso “Não achei as colunas Condomínio/Contatos”.',
  },
  espolio: {
    video: true,
    nome: 'Análise de Espólio',
    descricao: 'Decide, pela Política de Análise de Espólio, quais unidades com titular falecido saem da garantia (<b>Excluir</b>) e quais seguem <b>Em acompanhamento</b>, da solicitação da Implantação ou da Cobrança até a ficha da análise e as reanálises a cada 90 dias.',
    dados: 'Solicitações, análises, fichas, evidências e a base do Power BI ficam no banco do portal, compartilhados pela equipe e com o histórico de quem fez cada ação. A carteira de condomínios vem do portal. Os relatórios (PDF e Excel) são lidos no navegador.',
    abas: [
      ['Dashboard', 'Espólios sinalizados, análises do mês, pendências (solicitações sem análise concluída e reanálises vencidas), exclusões e implantação atrasada; o resultado por mês, as próximas reanálises, os condomínios com mais exclusões e o <b>Resumo mensal</b>.'],
      ['Solicitações', 'Caixa de entrada da gestão. Abra a solicitação para conferir condomínio, solicitante e unidades; <b>Iniciar análise</b> abre a análise já preenchida, <b>Devolver</b> pede correção com o motivo. <b>Registrar solicitação</b> lança um pedido que chegou por e-mail ou telefone.'],
      ['Análise', '1) <b>Documentos</b>: relatório consolidado de inadimplência do <b>Vouch</b> (PDF, conferido com o total do relatório), a <b>inadimplência anterior</b> (PDF da administradora anterior, planilha padrão ou o resultado da skill leitura-inadimplencia-myblue) e o <b>Power BI</b> (vem da base do dia); cada um pode ser marcado como inexistente. 2) Condomínio e contrato. 3) Cada unidade recebe <b>Excluir</b> ou <b>Em acompanhamento</b> pela regra da política; clicando na unidade, as evidências e o ajuste manual (com motivo). <b>Concluir análise</b> gera a ficha e oferece o ticket para quem guarda a ficha na pasta.'],
      ['Solicitar análise e Minhas solicitações', 'Para quem pede (Implantação ou solicitante avulso): nova solicitação com as unidades de titular falecido (ou importando a extração de unidades do Vouch), o quadro de condomínios em implantação a verificar (<b>Sem espólio</b> ou <b>Solicitar análise</b>) e o andamento de cada pedido, com a ficha quando concluída.'],
      ['Fila de acompanhamento', 'Um condomínio por linha com as unidades em acompanhamento e o prazo da reanálise (90 dias). <b>Selecionar vencidos</b> e <b>Reanalisar</b>: anexe os PDFs do Vouch (o condomínio é reconhecido pelo cabeçalho); na reanálise só o Vouch conta (3 ou mais taxas → Excluir). Clicando no nome, o histórico e a evolução das unidades. Exporta a fila em CSV.'],
      ['Acessos', 'Os papéis na ferramenta (Gestão, Implantação, Solicitante avulso): é a mesma lista da janela da ferramenta no portal, <b>Quem abre e com qual papel</b>.'],
      ['Configurações', 'A carteira e os tickets, a <b>base do Power BI</b> do dia (Excel ou CSV com Condomínio, Idade e Resultado), a carga inicial da planilha antiga e o texto das regras da política.'],
    ],
    obs: 'Regras da 1ª análise (implantação e avulso), na ordem: Vouch + débito anterior → Excluir; sem Vouch → Em acompanhamento; só Vouch → decide o BI e a vigência. Faltando um insumo, a unidade fica com <b>pendência 5.5</b> e a análise não conclui até anexar o documento ou ajustar com motivo.',
  },
  hsm: {
    video: true,
    nome: 'Biblioteca de HSM',
    descricao: 'As mensagens padrão da Cobrança, num lugar só: a pessoa busca, abre a mensagem como ela fica no WhatsApp e copia para colar na conversa. O que está <b>[entre colchetes]</b> muda a cada envio e deve ser trocado antes de enviar.',
    dados: 'As mensagens, as sugestões e a contagem de cópias ficam no banco do portal e são compartilhadas pela equipe, ao vivo. Na primeira abertura a ferramenta carrega a base inicial de mensagens que vem no próprio HTML.',
    abas: [
      ['Buscar mensagens', 'As mensagens da biblioteca por categoria (com a etapa da cobrança: Preventiva, Educativa ou Assertiva) e a busca por título, texto ou tag. Clicar na mensagem mostra o texto inteiro como no WhatsApp; <b>Copiar</b> leva o texto para a área de transferência. Analistas veem também <b>Sugerir ajuste</b>; a gestão vê <b>Editar</b>.'],
      ['Templates do sistema', 'Os modelos cadastrados na ferramenta de disparo do WhatsApp, só para consulta (as variáveis {{1}}, {{2}} são preenchidas por ela). Mudar o texto aqui não altera o template lá: a mudança precisa ser feita também na ferramenta de disparo.'],
      ['Sugestões', 'Analistas: <b>Minhas sugestões</b> e <b>+ Sugerir nova mensagem</b>, com o motivo; acompanham se foi aprovada ou recusada (com o comentário da gestão) e podem retirar uma pendente. Gestão: as sugestões de todos; <b>Revisar</b> mostra o texto atual ao lado do sugerido, <b>Aprovar e publicar</b> troca na hora e <b>Recusar</b> exige um comentário.'],
      ['Configurações (gestão)', '<b>+ Nova mensagem</b> (Biblioteca ou Templates do sistema, categoria, etapa, tags e texto), <b>Editar</b>, <b>Arquivar</b> e restaurar; as cópias de cada mensagem no mês (ordenar por mais ou menos copiadas) e <b>Exportar Excel</b> ou <b>PDF</b> da biblioteca inteira.'],
    ],
    obs: 'Quem edita e aprova é quem tem o papel <b>Gestão</b> (identificador <code>gestao_administrativa</code>), dado no portal em <b>Quem abre e com qual papel</b> — a coordenação também precisa recebê-lo. Sem o papel, a pessoa busca, copia e envia sugestões; com acesso só de consulta, só busca e copia.',
  },
  curadoria: {
    video: true,
    nome: 'Curadoria da Base — Painel de Campanhas',
    descricao: 'Gestão das campanhas de recuperação dos condomínios com Resultado negativo, pela escada da Política de Curadoria da Base: quem vai para campanha, com qual desconto (50% na 1ª, 70% na 2ª, 100% a partir da 3ª), e o resultado de cada campanha.',
    dados: 'Os arquivos do Power BI (Analítico e rating) são lidos no navegador e valem só durante a sessão. O painel guarda no banco do portal, compartilhado pela equipe, só as campanhas, as marcações e o histórico dos condomínios que passaram por campanha.',
    abas: [
      ['Visão geral', 'Condomínios atendidos, efetividade das campanhas (quantos melhoraram e quantos positivaram), resultado recuperado e negativos sem projeção de melhoria; a evolução por mês de início e a <b>efetividade por campanha</b>, comparada com os negativos que ficaram de fora.'],
      ['Campanhas', 'Top 3 do ano, campanhas ativas e o histórico. No <b>detalhe</b>: o resultado de cada condomínio, os relatórios para a Cobrança e para a Diretoria, <b>Editar campanha</b> e o <b>Analítico de fim</b>, que encerra a campanha (positivado, em recuperação ou em agravamento). <b>Cadastrar campanha manualmente</b> registra campanhas feitas fora do painel.'],
      ['Condomínios', 'Os condomínios que passaram por campanha, com resultado, tendência de 6 meses e classificação. A <b>ficha</b> mostra o Resultado mês a mês (faixas marcam as campanhas), as campanhas, as leituras guardadas e as <b>marcações e destino</b> para a Reunião de Resultado.'],
      ['Avaliação', '1 · envie o <b>Analítico</b> do Power BI (Condomínio, Idade, VOP, Inadimplência, Resultado) e, se quiser, o <b>rating</b> (resultado acumulado mês a mês). 2 · cada condomínio é classificado pela escada: campanha, monitoramento, curadoria plena ou positivo; filtre, ordene e ajuste o desconto. 3 · marque os condomínios, confira início, fim e nome e clique em <b>Registrar campanha</b>.'],
      ['Configurações', 'Os limites da tendência de 6 meses (variação estável e melhora mínima) e o nome do responsável que sai nos relatórios.'],
    ],
    obs: 'Indicados para campanha: inadimplência a partir de 1,5 vez o VOP mensal, “positivou e negativou” (dentro da janela de 13 meses) ou de 13 a 18 meses em piora. Acima de 18 meses e ainda negativo vai para a <b>curadoria plena</b> (Reunião de Resultado). Sem a coluna de idade no Analítico, as regras de 13 e 18 meses não são aplicadas.',
  },
  brindes: {
    video: true,
    nome: 'Controle de Brindes',
    descricao: 'Estoque de brindes do Marketing (sacolas, canetas, cadernetas, bonés, panfletos e kits), com retiradas por pedido: quem pede escolhe os itens, a aprovadora aprova e reserva, o almoxarifado confirma a entrega, e a reposição é sugerida pelo consumo.',
    dados: 'Itens, movimentações, pedidos, compras, kits e demandas ficam no banco do portal, compartilhados ao vivo. O saldo é sempre calculado pelo livro de movimentações: o pedido pendente não mexe no estoque, a aprovação reserva e só a entrega confirmada dá a saída.',
    abas: [
      ['Painel', 'Itens para repor, pedidos aguardando aprovação e entrega, saídas do mês; o saldo de cada item (físico, reservado, <b>disponível</b> = físico − reservado, <b>projetado</b> com as demandas futuras, ponto de pedido e sugestão de compra), a curva de consumo e as pendências.'],
      ['Solicitar', 'Novo pedido: setor, data desejada, evento, finalidade e os itens ou <b>kits</b>; o disponível já desconta o que está reservado. <b>Enviar para aprovação</b>.'],
      ['Pedidos', 'Filtros <b>Aguardando você</b>, pendentes, aprovados, entregues e rejeitados/cancelados. No pedido, a aprovadora <b>aprova e reserva</b> (pode aprovar menos, com justificativa) ou <b>rejeita</b> com o motivo; o almoxarifado <b>confirma a entrega</b>, que baixa o estoque. Ninguém aprova o próprio pedido; cada pedido guarda o histórico.'],
      ['Estoque', 'Itens com consumo por dia, ruptura prevista e situação (OK, Reposição, Crítico); <b>Entrada</b>, <b>Ajuste</b> (com motivo), <b>Inventário</b>, <b>Compra</b> e novo item. No item, a sugestão de compra e <b>Registrar compra</b>; em <b>Compras em aberto</b>, <b>Receber</b> lança a entrada. Também <b>Kits</b>, <b>Demandas futuras</b> e importar o saldo inicial.'],
      ['Relatórios', 'Consumo por item, setor e evento, histórico de aprovações, compras pendentes, inventário, divergências, livro de movimentações e curva de consumo, por período, em CSV ou Excel.'],
      ['Configurações', 'Quem aprova, quem entrega (almoxarifado), quem recebe os alertas de reposição e quem administra; o intervalo dos lembretes, a cobertura da sugestão de compra e a lista de setores.'],
    ],
    obs: 'O alerta de reposição dispara quando o projetado chega ao ponto de pedido (o maior entre o mínimo do item e consumo × prazo de reposição + segurança) e é verificado quando alguém da gestão abre a ferramenta.',
  },

};

// p: prioridade sugerida; h: prazo em horas de expediente
const SETORES = [
  {
    nome: 'Administrativa/Financeira', arquivo: 'administrativa-financeira',
    papel: 'Cuida das rotinas administrativas e financeiras da MyBlue: pagamentos, notas fiscais, reembolsos, contas da empresa, patrocínios de eventos dos condomínios e viagens a trabalho. É responsável também por Suprimentos, Parceiros e Comissões de Novos Condomínios.',
    ferramentas: ['patrocinio', 'viagens', 'premiacoes'],
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
      'O Comercial fecha um condomínio novo e a implantação o cadastra na <b>Carteira de condomínios</b> (Adicionar novos). No início do mês, a gestão comercial puxa da carteira, em <b>Comissões de Novos Condomínios</b>, os condomínios da vigência.',
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
    ferramentas: ['cobranca', 'resultados', 'curadoria', 'espolio', 'hsm', 'mailing'], carteira: 'analista de cobrança',
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
    tambem: [
      '<b>Solicitação de Contrato</b> (menu do portal): fechada a negociação, o executivo pede a minuta a partir da análise liberada, com as condições e as objeções e solicitações do síndico. O Jurídico tem 72h úteis; a minuta vai e volta com os ajustes até a assinatura (acompanhe em <i>Jurídico → Acompanhamento de demandas Jurídicas</i>), e com o contrato assinado e as condições registradas pelo Jurídico você clica em <b>Solicitar implantação</b>, no próprio contrato (ou em <i>Implantação → Nova implantação → No portal</i>): ela já vem com as condições fechadas. Toda implantação começa de um contrato: contrato assinado <b>fora do portal</b> entra em <i>Nova implantação → Fora do portal</i>, com o retorno da análise, e o Jurídico registra as condições antes de seguir ao setor.',
      '<b>Comissões de Novos Condomínios</b>: o condomínio fechado entra na Carteira com a <b>vigência</b> e o <b>executivo de negócios</b>. No início do mês a gestão comercial clica em <i>Puxar da carteira</i> e escolhe a vigência; cada executivo vê os condomínios dele, informa se tem parceiro (só da lista; parceiro novo é pedido ao Financeiro por ticket) e a gestão aprova. O passo a passo está no <b>Manual do Portal – Setor Administrativa/Financeira</b> (subárea Comissões de Novos Condomínios).',
    ],
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
    ferramentas: ['credito', 'boletos', 'repasses', 'gestaoCredito', 'hsmCredito'], carteira: 'assistente de crédito',
    recebe: [
      ['Prestação de contas', 27, 'media', 'Condomínio e mês de referência.'],
      ['Balancete', 27, 'media', 'Condomínio e período.'],
      ['Recibo (entrega / motoboy)', 9, 'alta', 'O que foi entregue, para quem e quando.'],
      ['Consumo de água e gás', 18, 'media', 'Condomínio, mês e as leituras (anexe a planilha ou foto).'],
      ['Planilha de moradores', 18, 'baixa', 'Condomínio e o que precisa ser atualizado.'],
      ['Renegociação fechada', 9, 'alta', 'Aberto sozinho pelo portal quando o CS fecha uma renegociação no Controle de Renegociações, já com as condições (tipo de negociação, taxa e tarifa antes → depois, VOP, boletos, fidelização, vigência e antecipação) e o PDF do relatório de garantia anexado. Se elas mudarem depois, o mesmo ticket recebe um comentário com o antes e o depois.'],
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
      ['Crédito', 'prestação de contas e balancetes pedidos pelo síndico (a renegociação fechada vai sozinha, pelo Controle de Renegociações)'],
      ['Jurídico', 'questões contratuais do cliente'],
      ['Implantação', 'ajustes no cadastro do condomínio'],
    ],
  },
  {
    nome: 'Implantação', arquivo: 'implantacao',
    papel: 'Coloca os novos condomínios em operação: cadastro, unidades, moradores e passagem para os setores.',
    ferramentas: [],
    tambem: [
      '<b>Painel de implantação</b> (menu do portal): só quem foi designada edita (outra pessoa, com autorização da coordenação); prazo de <b>3 dias úteis</b> para concluir depois de assumir, com pausa em pendência ou impedimento; linha do tempo de cada implantação; onboarding com data e hora e <b>convite do Outlook</b> (1h, Teams) para a assistente, o setor CS e o síndico; 1º vencimento vindo do formulário, ao lado do vencimento padrão; documento recebido direto do síndico ou da administradora; o onboarding pode ficar para depois da conclusão, com justificativa se o prazo vencer.',
      '<b>Ficha de transição</b>: abre na conclusão já preenchida; a Implantação completa os campos em azul e envia ao Crédito em até <b>5 dias úteis</b>; devolução com pergunta, até 3 versões e PDF de cada versão no papel timbrado.',
      '<b>Pós-implantação</b> (na implantação e no Painel de atividades): espólios em <b>2 dias úteis</b> depois de assumir (solicitação na <b>Análise de Espólio</b>; a coordenação de cobrança devolve), levantamento de pendências em <b>1 dia útil</b> depois dos boletos (PDF da Planilha de moradores pelo WhatsApp, salvo no CPD) e a <b>1ª prestação de contas</b> em <b>5 dias úteis</b> depois do repasse (Montador, salva no CPD). Lembretes e alertas como os da ficha.',
      '<b>Painel de implantação</b>: <b>Dashboard</b> (indicadores, prazo para concluir por assistente, metas e as pendências de onboarding e documentação), <b>Painel de atividades</b> (Fila, Mês vigente, <b>Controle</b> com a planilha completa e Excel, Pós-implantação) e <b>Depois da conclusão</b> (Aguardando Carteira, fichas de transição e antecipações enviadas ao <b>Controle de Repasses</b>), com os parâmetros que a coordenação ajusta.',
      '<b>Carteira de condomínios → Adicionar novos</b>: o coordenador ou supervisor da Implantação envia o <i>Controle de Implantações</i> (.xlsx ou .csv, como está), escolhe a <b>vigência</b> e cadastra cada condomínio novo com <b>ID Vouch</b> (obrigatório), apelido, executivo de negócios e CNPJ. É dessa carteira que a Comissões de Novos Condomínios puxa os condomínios de cada vigência. O passo a passo está no <b>Manual do Portal – Geral</b>, capítulo da Carteira.',
    ],
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
    tambem: [
      '<b>Solicitação de Contrato</b> (menu do portal): quem a administração marca em <i>Quem elabora</i> recebe os pedidos do comercial, assume da fila, redige a minuta em até 72h úteis, responde aos ajustes e, com o contrato assinado, registra as <b>condições fechadas</b> (em <i>Acompanhamento de Contratos → Assinaturas</i>); o executivo é avisado e solicita a implantação, que vem com elas. Contrato assinado fora do portal chega direto em Assinaturas, pela implantação: registradas as condições, ela segue sozinha para o setor Implantação. Os números ficam no <b>Dashboard Jurídico</b>. O que o manual reserva à diretoria passa por ela antes da minuta.',
    ],
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
    ferramentas: ['brindes'],
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
