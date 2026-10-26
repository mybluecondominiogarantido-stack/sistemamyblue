# Solicitação de Contrato

Da negociação fechada com o síndico ao contrato assinado. Substitui o formulário "Solicitação de Contrato MyBlue" do
Microsoft Forms e o e-mail com o PDF. O comercial pede a minuta a partir de uma análise de crédito liberada, quem
elabora os contratos (Jurídico) redige em até 72h úteis, a minuta vai e volta com os ajustes até a assinatura, e a
advogada registra as **condições fechadas**, que seguem para a Implantação. Telas próprias do portal, com os mesmos
padrões da Análise de Crédito e da Implantação, no grupo **Jurídico** do menu:

| Menu | Endereço | Abas |
|---|---|---|
| **Solicitação de Contrato** | `#/contratos` | Minhas solicitações, Fila do Jurídico (assumir), Diretoria, Quem elabora |
| **Acompanhamento de demandas Jurídicas** | `#/acompanhamento-contratos` | Assinaturas (quem elabora), Controle (todos os contratos, até os encerrados) |
| **Dashboard Jurídico** | `#/dashboard-juridico` | — (quem elabora e a diretoria) |

Os endereços antigos (`#/contratos/assinaturas`, `#/contratos/controle`, `#/contratos/painel`) levam à tela nova.

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, quem elabora, análises disponíveis, formulário, documentos, envio, Jurídico, diretoria, ajuste, assinado, condições fechadas, controle) e rotinas | `server/rotas/contratos.js` |
| Regras do formulário: o que vem da análise, o que falta, os avisos do manual, o que vai à diretoria, as condições fechadas, o que segue para a Implantação e o PDF | `server/contratos/formulario.js` |
| Cláusulas negociáveis (pedido, posição e resposta padrão do Jurídico) | `server/contratos/clausulas.js` |
| Tabelas `contratos`, `contrato_documentos`, `contrato_eventos`, `contrato_protocolos` (e `implantacoes.contrato_id`) | `server/db.js` |
| Permissão "Elaborar as minutas de contrato" (`contratos.elaborar`) | `server/regras.js` |
| PDF da solicitação (o gerador do Formulário de Implantação, com outro cabeçalho) | `server/implantacoes/formulario_pdf.py` |
| Telas | `public/app.js` (bloco Solicitação de Contrato) |
| Testes (dados fictícios) | `test/contratos-formulario.test.js`, `test/contratos-rotas.test.js` |

## Etapas

`rascunho` → `fila` (enviada, ninguém assumiu) → `em_elaboracao` → `minuta_enviada` (com o comercial: pede ajuste ou a
assinatura) → `para_assinar` (o Jurídico manda assinar) → `em_assinatura` → `conferencia` (a via assinada voltou, a
advogada registra as condições fechadas) → `assinado`. Fora do caminho: `pendencia` (falta informação, volta ao
comercial) e `cancelada`. O pedido de ajuste volta a solicitação para `em_elaboracao`, com a mesma pessoa.

## Quem faz o quê

- **Comercial:** quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis). Pede, preenche,
  anexa a convenção (quando a análise não trouxe), pede ajuste na minuta ou a assinatura.
- **Quem elabora:** as pessoas marcadas pela administração em **Solicitação de Contrato → Quem elabora** (permissão
  `contratos.elaborar`). Enquanto ninguém for marcado, a administração recebe. Qualquer uma delas assume da fila e pode
  passar para outra; quem assumiu devolve com pendência, anexa e envia a minuta e registra as condições fechadas.
- **Diretoria:** quem chancela análises de crédito. Decide o que o manual diz ser decisão dela antes da minuta.
- **Administração:** tudo.

## Regras

- **De onde vem:** análise do portal enviada, aprovada ou com ressalvas, sem reanálise enviada depois e sem solicitação
  aberta; análise anterior ao portal pelo PDF do retorno (o leitor da Implantação, `server/implantacoes/pdf.js`); ou
  condomínio de entrega, sem análise. A proposta da análise vale `validade_dias` da política (padrão 30): passou disso,
  a solicitação abre com um aviso para conferir as condições.
- **Formulário:** os 17 campos do Forms (o solicitante é quem está no portal). Vem preenchido com a análise, e o que
  mudar (taxa administrativa, boleto, vencimento, desconto) aparece como diferença. Mais o estado, a administradora,
  a taxa ordinária e a taxa extra (para o limite de 40%), o período mínimo, o pedido de fidelização, as **Objeções e
  Solicitações de modificação de contrato** (ao marcar uma, aparece a pergunta, quando há: pontualidade em *retirar*
  ou *adiar*, "para quando?" em texto livre; o prazo de contestação pedido pelo cliente, em dias; o foro, "Para qual
  foro?", que o comercial escreve, só capital do estado de origem do contrato) e as **Outras solicitações**
  (opcional). A resposta padrão do Jurídico de cada item só aparece para quem elabora, a diretoria e a administração. Os pedidos que saíram da lista (out/2026) ficam marcados
  `antigo` em `clausulas.js`: aparecem nas solicitações que já os tinham.
- **Obrigatórios para enviar:** os dados do formulário (CPF do síndico válido, e-mail, telefone, taxa, boleto, desconto,
  garantias, cashback, a **vigência (início do contrato)** e a **data do primeiro vencimento**: o dia dela é o dia de
  vencimento dos boletos). Sem CNPJ: a ciência dos 90 dias,
  a administradora e a ata da assembleia que autorizou a contratação.
- **Documentos:** o retorno e a convenção vêm da análise. Os documentos do síndico (atas, cadastros, RG…) **não** são
  pedidos aqui: são da Implantação (os que já tinham sido anexados continuam visíveis e seguem para ela).
- **Sem convenção:** não impede o envio, mas a solicitação avisa que o contrato não pode ser assinado sem ela, e a
  advogada é avisada na nova solicitação, no pedido de assinatura ("Pronto para assinatura (sem convenção)"), na aba
  Assinaturas e nas janelas de assinatura: ela pede a convenção antes de mandar assinar. Quando a convenção chega,
  quem assumiu é avisado.
- **Envio:** protocolo **CT-AAAA-MM-DD-NN** (sequencial por dia, Brasília). Prazo da minuta: **72h úteis = 3 dias de
  expediente** (`server/expediente.js`, pulando fim de semana e feriado), contado do envio; recomeça a cada ajuste e no
  reenvio depois de pendência. Passou do prazo, avisa (uma vez) quem assumiu, ou quem elabora se ninguém assumiu.
- **Diretoria:** taxa extra acima de 40% da ordinária, pedidos marcados como decisão da diretoria (ampliar a cobertura
  da taxa extra, limitar despesas reembolsáveis) e condomínio de entrega (taxa e boleto). A diretoria é avisada no envio;
  a minuta só sai depois da decisão. Não aprovado, a minuta segue o contrato padrão nesses pontos.
- **Minuta:** quem assumiu anexa e envia ao comercial; cada versão fica no histórico. Depois de um ajuste, só vai a
  minuta anexada depois do pedido.
- **Assinatura:** com a minuta aprovada pelo síndico, o comercial clica em *Síndico aprovou: pedir assinatura*. Quem
  elabora vê na aba **Assinaturas** (pronto para assinatura, em assinatura, registrar condições), manda assinar e marca
  *Enviado para assinatura* (com uma observação, se quiser). Quando a via assinada volta, marca
  *Assinado*, anexando ali mesmo o contrato assinado, e registra as condições fechadas (a procuração não é pedida). O comercial é avisado em cada passo.
- **Condições fechadas:** vêm do pedido (foro na capital do estado se pedido, o prazo de contestação pedido pelo
  cliente, a decisão da diretoria) e a advogada corrige o que mudou: taxa, boleto, desconto, limite da taxa
  extra, a **vigência** que foi fechada (vem a do pedido), período mínimo, fidelização, **honorários de cobrança extrajudicial**, foro, prazo de contestação e o
  resultado de cada cláusula pedida (aceito, em parte ou recusado, com a redação). Garantias, cashback e o primeiro
  vencimento são do executivo: valem sempre os do pedido (`comPedido`), e a advogada não os altera. Concluir leva a `assinado` e avisa o executivo para
  **solicitar a implantação** (veja abaixo). O Jurídico não abre a implantação.
- **Controle:** os cartões Atividades pendentes (na fila), Em análise do Jurídico (em elaboração), Aguardando retorno do
  solicitante (minuta com o comercial e pendência) e os demais da situação.
- **Contratos encerrados:** ficam em Acompanhamento de demandas Jurídicas → **Controle** (filtro "Assinado" ou busca). As condições ficam travadas; quem
  elabora usa **Corrigir condições**, com o motivo obrigatório. O histórico guarda o que mudou (de → para), e o
  executivo e a Implantação (quem conduz, ou a coordenação) são avisados.

## Dashboard Jurídico

Item próprio do menu Jurídico, para quem elabora e a diretoria (`GET /api/contratos/painel?ano=&mes=`; mês 0 = ano
todo, datas em Brasília):

- **No período:** solicitados, minutas enviadas (e % no prazo de 72h úteis), alterações pedidas, pedidos de assinatura,
  enviados para assinatura, fechados e cancelados.
- **Agora:** na fila, em elaboração (primeira minuta), em alteração (ajuste pedido), pendência com o comercial,
  aguardando o executivo (pedir assinatura ou ajuste), pronto para assinatura, em assinatura, registrar condições e os
  que passaram do prazo.
- No modelo do PartnerChip: cartões do período (o primeiro em destaque), filtro de ano em botões e o **comparativo mês a mês** do ano (gráfico de barras com dica ao passar o mouse e, em "Ver em tabela", a diferença para o mês anterior): solicitados,
  aguardando assinatura (assinatura pedida pelo executivo no mês), em assinatura (enviados para assinatura no mês) e
  assinados (via assinada anexada no mês). Clicar num mês filtra o período.
- Os tempos médios (até a primeira minuta, do pedido ao
  fechamento, alterações por contrato) e as contas por executivo e por responsável no Jurídico.

## Implantação

- **Quem solicita a implantação é o executivo.** Concluído o contrato, ele é avisado e clica em **Solicitar implantação**
  no próprio contrato (`POST /api/contratos/:id/implantacao`, só o executivo do contrato ou a administração). A
  implantação abre em rascunho, ligada ao contrato (`abrirDoContrato` em `server/rotas/implantacoes.js`): o formulário
  vem da análise (ou do PDF do retorno, ou da entrega, já com a aprovação da diretoria) com as condições fechadas por
  cima, e entram o contrato assinado, a convenção e o retorno da análise. Ele completa e envia ao setor Implantação.
  Também pode abrir pela própria Implantação (Nova implantação → a análise), que traz o contrato do mesmo jeito. Se o
  condomínio já tinha implantação quando o contrato foi concluído, ela só é ligada ao contrato.
- A implantação aberta de uma análise (ou do PDF) que tem solicitação de contrato traz os dados do contrato: as
  **condições fechadas valem sobre o pedido**. O contrato assinado entra nos documentos da implantação como "Contrato
  assinado", e a convenção, se a implantação ainda não tiver (documentos do síndico anexados antes também vão, nos tipos
  de lá).
- A implantação mostra o quadro **Condições fechadas no contrato** (com a marca da última correção) e avisa quando o
  formulário dela está diferente do contrato (taxa, boleto, desconto, início, vencimento). Aberta antes do contrato fechar, ela é ligada ao
  contrato na conclusão, e quem conduz é avisado.
- Sem contrato assinado no portal, a implantação continua abrindo, com um aviso.

## Manual do Contrato

As cláusulas negociáveis e as respostas padrão vêm do Manual do Contrato MyBlue (Jurídico) e
ficam em `server/contratos/clausulas.js`. Mudou o manual? Atualize esse arquivo (e os avisos em `avisos()` de
`server/contratos/formulario.js`).

## Tutoriais

No catálogo (`server/tutoriais.js`): `contrato-solicitar` (executivos, quem elabora e diretoria) e `contrato-elaborar`
(quem elabora). E a jornada de um condomínio fictício da análise de crédito até a Carteira, em dois vídeos:
`jornada-credito-implantacao` (pelo executivo: só a tela dele, com cartões "Enquanto isso" para o que os outros fazem) e
`jornada-credito-implantacao-equipe` (por quem executa: analista de crédito, advogada, coordenação e assistente da
Implantação). Os passos que cada vídeo não mostra são feitos pela API em `passosJor`. Roteiros em
`docs/tutoriais/fonte/roteiros.js`; no cenário de gravação, a advogada fictícia Lara Mendes.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Os nomes reais (executivos, advogadas, condomínios)
entram pelo portal e ficam no banco.
