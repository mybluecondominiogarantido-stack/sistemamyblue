# Solicitação de Contrato

Da negociação fechada com o síndico ao contrato assinado. Substitui o formulário "Solicitação de Contrato MyBlue" do
Microsoft Forms e o e-mail com o PDF. O comercial pede a minuta a partir de uma análise de crédito liberada, quem
elabora os contratos (Jurídico) redige em até 72h úteis, a minuta vai e volta com os ajustes até a assinatura, e a
advogada registra as **condições fechadas**, que seguem para a Implantação. Tela própria do portal (menu
**Solicitação de Contrato**), com os mesmos padrões da Análise de Crédito e da Implantação.

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, quem elabora, análises disponíveis, formulário, documentos, envio, Jurídico, diretoria, ajuste, assinado, condições fechadas, controle) e rotinas | `server/rotas/contratos.js` |
| Regras do formulário: o que vem da análise, o que falta, os avisos do manual, o que vai à diretoria, as condições fechadas, o que segue para a Implantação e o PDF | `server/contratos/formulario.js` |
| Cláusulas negociáveis (pedido, posição e resposta padrão do Jurídico) e o que não se promete | `server/contratos/clausulas.js` |
| Tabelas `contratos`, `contrato_documentos`, `contrato_eventos`, `contrato_protocolos` (e `implantacoes.contrato_id`) | `server/db.js` |
| Permissão "Elaborar as minutas de contrato" (`contratos.elaborar`) | `server/regras.js` |
| PDF da solicitação (o gerador do Formulário de Implantação, com outro cabeçalho) | `server/implantacoes/formulario_pdf.py` |
| Telas | `public/app.js` (bloco Solicitação de Contrato) |
| Testes (dados fictícios) | `test/contratos-formulario.test.js`, `test/contratos-rotas.test.js` |

## Etapas

`rascunho` → `fila` (enviada, ninguém assumiu) → `em_elaboracao` → `minuta_enviada` → `conferencia` (contrato assinado
anexado, aguardando as condições fechadas) → `assinado`. Fora do caminho: `pendencia` (falta informação, volta ao
comercial) e `cancelada`. O pedido de ajuste volta a solicitação para `em_elaboracao`, com a mesma pessoa.

## Quem faz o quê

- **Comercial:** quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis). Pede, preenche,
  anexa os documentos do síndico, pede ajuste na minuta e anexa o contrato assinado e a procuração.
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
  a taxa ordinária e a taxa extra (para o limite de 40%), o período mínimo, o pedido de fidelização e os **pedidos do
  síndico**: ao marcar uma cláusula negociável, aparece a resposta padrão do Jurídico.
- **Obrigatórios para enviar:** os dados do formulário (CPF do síndico válido, e-mail, telefone, taxa, boleto, desconto,
  garantias, cashback, início, vencimento e as minúcias; sem nada diferente, "Nenhuma"). Sem CNPJ: a ciência dos 90 dias,
  a administradora e a ata da assembleia que autorizou a contratação.
- **Documentos do síndico** (convenção, regimento, ata de eleição, atas das taxas, cadastro de proprietários e de
  locatários, RG/CPF e comprovante de endereço do síndico): não travam o contrato, mas travam a operação. Ficam como
  pendência, com o aviso no sino no envio e um e-mail por dia útil ao executivo até chegarem. A convenção e o retorno da
  análise vêm da análise.
- **Envio:** protocolo **CT-AAAA-MM-DD-NN** (sequencial por dia, Brasília). Prazo da minuta: **72h úteis = 3 dias de
  expediente** (`server/expediente.js`, pulando fim de semana e feriado), contado do envio; recomeça a cada ajuste e no
  reenvio depois de pendência. Passou do prazo, avisa (uma vez) quem assumiu, ou quem elabora se ninguém assumiu.
- **Diretoria:** taxa extra acima de 40% da ordinária, pedidos marcados como decisão da diretoria (ampliar a cobertura
  da taxa extra, limitar despesas reembolsáveis) e condomínio de entrega (taxa e boleto). A diretoria é avisada no envio;
  a minuta só sai depois da decisão. Não aprovado, a minuta segue o contrato padrão nesses pontos.
- **Minuta:** quem assumiu anexa e envia ao comercial; cada versão fica no histórico. Depois de um ajuste, só vai a
  minuta anexada depois do pedido.
- **Assinado:** o comercial anexa o contrato assinado e a procuração (ou confirma que ela está no mesmo arquivo). A
  advogada é avisada para registrar as condições fechadas.
- **Condições fechadas:** vêm do pedido (foro na capital do estado se pedido, 30 dias de contestação se pedido, a
  decisão da diretoria) e a advogada corrige o que mudou: taxa, boleto, desconto e início, garantias, limite da taxa
  extra, cashback, início, vencimento, período mínimo, fidelização, foro, prazo de contestação e o resultado de cada
  cláusula pedida (aceito, em parte ou recusado, com a redação). Concluir leva a `assinado` e avisa o executivo.

## Implantação

- A implantação aberta de uma análise (ou do PDF) que tem solicitação de contrato traz os dados do contrato: as
  **condições fechadas valem sobre o pedido**. O contrato assinado entra nos documentos da implantação como "Contrato
  assinado", e os documentos do síndico, nos tipos de lá (as atas das taxas como ata de previsão orçamentária, o cadastro
  dos proprietários como cadastro de moradores; o que não tem tipo próprio entra como "outro").
- A implantação mostra o quadro **Condições fechadas no contrato**. Aberta antes do contrato fechar, ela é ligada ao
  contrato na conclusão, e quem conduz é avisado.
- Sem contrato assinado no portal, a implantação continua abrindo, com um aviso.

## Manual do Contrato

As cláusulas negociáveis, as respostas padrão e o que não se promete vêm do Manual do Contrato MyBlue (Jurídico) e
ficam em `server/contratos/clausulas.js`. Mudou o manual? Atualize esse arquivo (e os avisos em `avisos()` de
`server/contratos/formulario.js`).

## Tutoriais

No catálogo (`server/tutoriais.js`): `contrato-solicitar` (executivos, quem elabora e diretoria) e `contrato-elaborar`
(quem elabora). Roteiros em `docs/tutoriais/fonte/roteiros.js`; no cenário de gravação, a advogada fictícia Lara Mendes.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Os nomes reais (executivos, advogadas, condomínios)
entram pelo portal e ficam no banco.
