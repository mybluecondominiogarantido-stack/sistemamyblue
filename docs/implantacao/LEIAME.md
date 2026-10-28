# Implantação

Do contrato assinado à Carteira. **Toda implantação começa de um contrato assinado**: o comercial escolhe um contrato
concluído no portal (Solicitação de Contrato) ou anexa o contrato assinado fora do portal com o retorno da análise,
preenche o formulário (o antigo Formulário de Implantação do Microsoft Forms) e anexa os documentos; o setor **Implantação** conduz;
a coordenação confirma a entrada na Carteira. Tela própria do portal (menu **Painel de implantação**), com os mesmos
padrões da Análise de Crédito.

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, contratos disponíveis, contrato assinado fora do portal, formulário, documentos, envio ao setor ou ao Jurídico, avisos) | `server/rotas/implantacoes.js` |
| Regras do formulário: o que vem da análise, o que falta, o que fica pendente, o comparativo | `server/implantacoes/formulario.js` |
| Tabelas `implantacoes`, `implantacao_documentos`, `implantacao_eventos`, `implantacao_protocolos` (`implantacao_liberacoes` guarda só o histórico das liberações antigas) | `server/db.js` |
| Lembretes: fila sem designação (4h úteis), prazo para iniciar vencido, pendências do executivo (uma vez por dia útil) — roda a cada 10 min | `criarRotinasImplantacao` em `server/rotas/implantacoes.js`, ligado em `server/index.js` |
| Setor no dia a dia: quem edita (autorizações), pausas e prazo para concluir, onboarding depois de concluir, documento recebido sem arquivo, Obs. do Controle, Cobrar e a rotina dos prazos | `server/rotas/implantacoes-setor.js`; prazos em dias úteis em `server/implantacoes/prazos.js`; tabelas `implantacao_autorizacoes` e `implantacao_pausas` |
| Ficha de transição (montagem, envio, devolução, versões, PDF e rotina do prazo) | `server/implantacoes/ficha.js` e `server/rotas/implantacoes-ficha.js`; tabelas `implantacao_fichas` e `implantacao_ficha_versoes` |
| Antecipação → Controle de Repasses | `server/rotas/implantacoes-antecipacoes.js`; tabela `implantacao_antecipacoes` |
| Pós-implantação (espólios, levantamento de pendências, 1ª prestação de contas, rotina dos prazos) | regras em `server/implantacoes/pos.js`; rotas e rotina em `server/rotas/implantacoes-pos.js`; coluna `implantacoes.pos` |
| Painel de implantação: dados do Dashboard, Painel de atividades e Depois da conclusão (mês vigente, controle, metas, antecipações, fichas, pós-implantação, prazo para concluir, parâmetros, cobrança de documentos, Excel) | `server/rotas/implantacoes-acompanhamento.js`; regras em `server/implantacoes/metas.js`; tabela `implantacao_parametros`; .xlsx em `server/xlsx.js` |
| Convite do onboarding no Outlook (agenda do Microsoft 365) | `server/implantacoes/convite.js`; agenda em `server/email.js`; coluna `implantacoes.onboarding_convite` |
| Telas | `public/app.js` (Painel de implantação, tela da implantação e ficha de transição) |
| Testes (dados fictícios) | `test/implantacoes-formulario.test.js`, `test/implantacoes-rotas.test.js`, `test/implantacoes-metas.test.js`, `test/implantacoes-setor.test.js`, `test/implantacoes-pos.test.js` |

## Regras

- **De onde vem (Nova implantação → "Onde o contrato foi assinado?"):**
  - **No portal:** a lista (`GET /api/implantacoes/contratos`) traz os contratos concluídos (assinados, com as condições
    fechadas registradas pela advogada) do executivo que ainda não têm implantação; a administração vê os de todos. O
    de condomínio de entrega vem marcado "Entrega · taxa aprovada pela diretoria". Escolhido o contrato, a implantação abre
    por `POST /api/contratos/:id/implantacao` (o mesmo botão **Solicitar implantação** do contrato).
  - **Fora do portal:** contrato assinado fora do portal (veja abaixo). A análise de crédito sozinha não abre mais
    implantação, nem há prazo de 90 dias ou liberação do gestor da Análise de Crédito: análise do portal segue para a
    Solicitação de Contrato.
- **Formulário:** vem preenchido com o contrato e a análise. A análise fica ao lado de cada campo, e o que
  mudar (taxa administrativa, boleto, unidades, taxa ordinária, vencimento, desconto, isenção do síndico) aparece como
  diferença para o setor e o gestor. A convenção e o retorno da análise (PDF) entram nos documentos.
- **Obrigatórios para enviar:** os dados do formulário e quatro documentos: convenção, cadastro de moradores (Excel),
  ata de eleição do síndico e ata de previsão orçamentária.
- **Podem chegar depois:** RG/CPF ou CNH do síndico, conta bancária, comprovante de endereço do síndico, modelo do boleto
  anterior, procuração (e o CNPJ, no condomínio de entrega sem CNPJ). No envio, o executivo recebe a lista no sino; depois, um e-mail
  por dia útil até chegar. Quando um pendente chega, quem conduz (ou a coordenação) é avisado.
- **Parceria:** o executivo só diz se há e escolhe o parceiro da base de comissão (ferramenta *Prestação de Contas —
  Comissão de Parceiros*, coleção `partners`); o percentual é do setor Parceiros. Com a ferramenta ainda na planilha
  Google, a lista fica vazia e o nome é digitado.
- **Envio:** protocolo **IMP-AAAA-MM-DD-NN** (sequencial por dia, horário de Brasília). Avisos (sino e e-mail): a
  coordenação ("Nova implantação", aguardando designação) e a equipe ("Chegou uma nova implantação").

## Setor Implantação

- **Designação:** a coordenação designa cada pedido para alguém do setor (dá para redesignar). Quem recebe é avisado
  (sino e e-mail) e tem **8h úteis** para iniciar (expediente de `server/expediente.js`; fim de semana e feriado não
  contam). Sem designação, a coordenação recebe um lembrete a cada **4h úteis**; prazo para iniciar vencido avisa,
  uma vez, a coordenação e quem foi designado.
- **As 5 etapas:** documentação conferida, cadastro no Vouch (o ID vai para a Carteira; ID já usado na Carteira é
  recusado), onboarding (a marcar, marcado, síndico MyBlue ou realizado; marcado e realizado com **data e hora
  obrigatórias** e quem fez — começa com quem conduz), emissão de boletos (com o **1º vencimento**, obrigatório ao
  marcar "Boletos emitidos") e envio (digital, físico ou ambos; vai para a Carteira como forma de envio). Concluir com
  as outras 4 etapas feitas e o 1º vencimento; o onboarding pode ficar para depois.
- **Vencimento padrão e 1º vencimento:** dois campos do formulário. O **vencimento padrão** (dia) é o do condomínio e é
  o que vai para a Carteira; o **1º vencimento** (data) é o do primeiro boleto, que pode sair em outro dia por causa da
  implantação. Na etapa Emissão de boletos o 1º vencimento já vem do formulário e a assistente altera se ficou definida
  outra data (a tela mostra "alterado · no formulário …"); o prazo do onboarding, a pós-implantação e a ficha de
  transição seguem a data da etapa. Sem o vencimento padrão, vale o dia do 1º vencimento.
- **Convite do onboarding no Outlook:** ao salvar o onboarding como **marcado**, o portal cria uma reunião de **1h com
  link do Teams** no calendário da caixa que envia os avisos (`EMAIL_REMETENTE`), para quem conduz (e quem faz, se for
  outra pessoa), as **pessoas do setor CS** (sem a liderança) e o **síndico** (e-mail do formulário). Mudar a data ou a
  hora atualiza o convite; voltar para "a marcar" ou "síndico MyBlue" cancela. Pede o Microsoft 365 configurado e a
  permissão **Calendars.ReadWrite** (aplicativo) no app do Entra ID, restrita à caixa remetente; sem ela, o onboarding
  salva e a tela mostra por que o convite não saiu.
- **Quem edita:** a equipe toda vê todas as implantações; só **quem foi designada** edita (as de outra pessoa aparecem
  com 🔒). Outra pessoa da equipe edita com **autorização da coordenação**: pedida pela própria pessoa (com o motivo) ou
  dada direto, com escopo (**tudo**, **só as etapas** ou **só documentos e ficha**) e prazo opcional. A coordenação
  recusa (com resposta) e revoga quando quiser; tudo fica no histórico. Coordenação e administração editam todas.
- **Prazo para concluir:** `concluir_dias` (**3**) dias úteis depois de assumir. Um dia útil conta quando o prazo não
  estava pausado no começo dele. **Pausa** com a pendência com o comercial (abre e fecha sozinha; no reenvio, quem
  conduz é avisada de que o prazo voltou a contar) ou com um **impedimento** marcado por quem conduz (motivo e detalhe;
  a coordenação é avisada, sem precisar aprovar). Para retomar, **Resolvido: retomar o prazo**, dizendo o que foi
  resolvido; o prazo continua de onde parou. Impedimento aberto há 3 dias úteis: lembrete "ainda está impedida?".
  Lembrete 1 dia útil antes e no dia; atrasada, um alerta por dia útil a quem conduz e à coordenação (com **Cobrar**).
  Concluir com impedimento aberto encerra a pausa.
- **Documento recebido direto pela Implantação** (do síndico, da administradora ou de outra pessoa, sem passar pelo
  executivo): **Anexar** guarda o arquivo; **Marcar recebido** registra de quem veio (`recebido_de`) com observação
  obrigatória. Conta como recebido na data (pendências e meta de documentação) e a cobrança do executivo para. Dá
  para desfazer a marcação; o arquivo, se chegar depois, é anexado normalmente.
- **Documentos do comercial:** antes do primeiro envio, o comercial anexa, troca e tira. Depois do envio, anexa só o que
  falta: o que já anexou fica com cadeado e não é trocado nem tirado (409). Se estiver errado, quem conduz devolve com
  pendência marcando o documento (`documentos` na pendência): ele volta a faltar e o comercial anexa o certo.
- **Conferências do portal:** diferenças com a análise, CPF do síndico, CNPJ e o cadastro de moradores (Excel/CSV): nº
  de unidades contra o formulário e linhas com CPF/CNPJ inválido.
- **Pendência:** quem conduz devolve ao comercial com a lista do que falta (sino e e-mail), e pode marcar documentos
  anexados errados, que voltam a faltar; o reenvio volta para a mesma pessoa.
- **Cobrar (coordenação):** a conclusão, a ficha de transição, o **onboarding** e cada etapa da pós-implantação vão para
  quem conduz (e quem tem autorização), no sino e por e-mail (`POST /api/implantacoes/:id/cobrar` com `qual`).
- **Onboarding depois de concluir:** dá para concluir com o onboarding pendente; o alerta fica na implantação até
  registrar. Vencido o prazo do onboarding sem ele, quem conduz escreve a **justificativa** (a coordenação é avisada
  por dia útil até justificar); a meta fica como não batida mesmo justificada.
- **Conclusão:** avisa a coordenação ("Pronta para a Carteira") e abre a **ficha de transição**. Com parceria, o condomínio entra na Prestação de
  Contas (coleção `condos`) ligado ao parceiro com comissão 0% (`vinculosJSON`), e o setor Parceiros é avisado para
  cadastrar a condição; se o condomínio já existir lá, ou o parceiro não estiver na base, o aviso diz o que conferir.
- **Carteira:** a coordenação confere os dados sugeridos (ID Vouch, nome sugerido, UF, vencimento padrão, vigência,
  administradora, forma de envio, executivo, razão social, CNPJ e o **nome, telefone e e-mail do síndico**, do
  formulário e obrigatórios) e confirma; o portal recusa ID ou CNPJ que já estão na
  Carteira. Os responsáveis (cobrança, extrajudicial, crédito) são escolhidos depois, na ficha do condomínio. O Controle
  de Emissão de Boletos acompanha, como em qualquer condomínio novo da Carteira.

## Ficha de transição

Abre na conclusão, já preenchida (`server/implantacoes/ficha.js`) com o formulário, a análise, o contrato, as etapas e os
documentos, em 8 partes: informações gerais, financeiras (2.1 consumo, 2.2 taxa extra, 2.3 fundo de reserva, 2.4
reservas e outras receitas), não garantidos (taxas do contrato e unidades), conta bancária e repasse, documentos
(anexados e conferidos pela Implantação), cashback, particularidades e outras observações (já com a Obs. do Controle).
O que só a Implantação sabe vai nos **campos em azul**; o resto não se edita na ficha (corrige-se no formulário ou na
etapa, e a ficha acompanha).

- **Envio:** à assistente de crédito do condomínio na Carteira (`assistente_credito`, pelo nome, no setor Crédito);
  sem ela, à **supervisão de Crédito**, que escolhe (e o portal grava na Carteira quando o condomínio entrar). Antes
  do envio, a tela diz para quem vai (`ficha.para`); o botão é "Enviar para <assistente>" ou "Enviar à supervisão de
  Crédito". Aviso no
  sino e por e-mail; ela confirma o recebimento ou **devolve com uma pergunta**. Quem conduz responde sem mudar a ficha
  ou envia uma nova versão.
- **Versões:** cada envio guarda a ficha como foi (`implantacao_ficha_versoes`); a partir da 2ª, com o motivo. Até
  **3**; mais, só com a liberação da coordenação (com motivo). PDF de cada versão no papel timbrado
  (`GET /api/implantacoes/:id/ficha.pdf?versao=N`, arquivo com `-vN`).
- **Prazo:** `ficha_dias` (**5**) dias úteis da conclusão até o **primeiro envio**; devolução e nova versão não reabrem.
  Lembrete 1 dia útil antes e no dia; atrasada, alerta por dia útil a quem conduz e à coordenação (Cobrar).
- Tela: `#/implantacao/:id/ficha` (a assistente de crédito entra pelo link do aviso).

## Pós-implantação

Depois de assumir e de emitir os boletos, a Assistente de Implantação (quem conduz) faz três etapas, com prazo em dias
úteis (`server/implantacoes/pos.js`). Os arquivos não passam pelo portal: ficam no CPD, na pasta do condomínio.

| Etapa | Começa | Prazo | Termina |
|---|---|---|---|
| Espólios | ao assumir | `espolio_dias` (**2**) | ao abrir a solicitação na ferramenta **Análise de Espólio** (verificação no Assertiva + documento) |
| Levantamento de pendências | na emissão dos boletos (etapa marcada) | `pendencias_dias` (**1**) | ao marcar *Enviado no WhatsApp e salvo no CPD* ou *Cadastro completo, nada a enviar* (o PDF sai da Central de Ferramentas, Planilha de moradores) |
| 1ª prestação de contas | no repasse: 1º dia útil depois do 1º vencimento | `prestacao_dias` (**5**) | ao marcar *Enviada ao condomínio* (feita no Montador, Central de Ferramentas). A implantação faz só a 1ª |

- **Espólios:** o portal acha a solicitação sozinho na coleção `solicitacoes` da Análise de Espólio (mesmo CNPJ, ou
  mesmo nome sem CNPJ, aberta a partir do envio ao setor); o prazo conta até a primeira. A devolutiva da coordenação de
  cobrança aparece ao lado (com a coordenação, concluída com o resultado, ou **devolvida**: reabrir a solicitação na
  ferramenta). Sem solicitação achada, a assistente informa o protocolo à mão.
- **Avisos:** lembrete 1 dia útil antes e no dia; atrasada, alerta por dia útil a ela e à coordenação, por etapa
  (`implantacoes.pos.avisos`). A coordenação cobra pela implantação ou pelo Painel de atividades → Pós-implantação.
- **Quem marca:** quem conduz, quem tem autorização (tudo ou só as etapas) e a coordenação; dá para desfazer.
- **Vale para** as implantações do portal assumidas a partir de `pos_marco` (Parâmetros); o histórico importado fica de fora.
- API: `POST /api/implantacoes/:id/pos/:etapa` (`espolio` com `{ protocolo }`, `pendencias` com `{ situacao }`,
  `prestacao`; `{ acao: 'desfazer' }` desfaz) e `POST /api/implantacoes/:id/cobrar` com `qual` = `espolio`,
  `pendencias` ou `prestacao`. O detalhe traz `setor.pos`; o Painel de implantação, `pos`.

## Antecipação → Controle de Repasses

Em Depois da conclusão → Antecipações, a equipe marca e envia a antecipação negociada no formulário (valor, data, dia,
prazo e o mês final). No Controle de Repasses (ferramenta `repasses`), quem tem o papel **Gestor** cadastra a regra (com
ajuste ou não) ou devolve com o motivo; a situação volta para a implantação. Se o formulário mudar depois do cadastro,
a aba mostra e reenvia como **atualização**, com o antes e o depois. Dá para desfazer o envio antes da decisão. API:
`GET /api/repasses/antecipacoes`, `POST /api/repasses/antecipacoes/:id/cadastrar` `{ regra_id, valor, dia, modo, fim, obs }`
e `.../devolver` `{ motivo }` (liberadas para a ferramenta isolada em `server/seguranca.js`).

## Painel de implantação

Menu **Painel de implantação**: uma tela só (a antiga lista da Implantação e o antigo Acompanhamento), aberta por função.
Os endereços antigos (`#/acompanhamento/...`, `#/implantacao/fila`, `todas`, `carteira`) levam ao lugar novo.

| Função | Abre em | Vê |
|---|---|---|
| Gestão (coordenação e administração) | Dashboard | tudo, com Designar, Cobrar, Carteira e o botão **Parâmetros** |
| Diretoria | Dashboard | as mesmas telas, **só consulta** (o servidor não deixa agir) |
| Assistente de implantação (setor) | Painel de atividades → Fila, filtrado para ela ("ver o setor todo" limpa o filtro) | Dashboard com a carteira dela e o percentual das metas |
| Comercial (executivo) | Minhas solicitações | situação de cada pedido, "Falta de você" e Responder / Enviar documentos / Abrir |

- **Dashboard** (só indicadores): contratos, % médio, concluídos, em andamento e não iniciados; progresso por etapa;
  contratos e concluídos por mês; **Prazo para concluir** (concluídas no prazo, tempo médio e uma tabela por
  assistente com contratos, % médio, concluídas, tempo e no prazo — `linhas[].concluir`); metas de onboarding e de
  documentação em %; por UF e por executivo; **Pendências para acompanhar** (onboarding, do limite mais curto, com
  Cobrar; documentação, com Cobrar o executivo e marcar à mão) e o desempenho do mês na pós-implantação (gestão).
- **Painel de atividades:** **Fila** (em aberto, do que pede ação primeiro: selos das 5 etapas, prazo para concluir e
  pendências), **Mês vigente**, **Controle** e **Pós-implantação**.
- **Depois da conclusão:** **Aguardando Carteira** (gestão), **Fichas de transição** e **Antecipações**.
- **Sem informação repetida:** cada número aparece num lugar só; o Dashboard aponta para a lista no Painel de atividades.

- **% concluído:** etapas feitas ÷ 5 (concluída ou na Carteira = 100%). Faixas: concluída, só falta o onboarding, 60–99%,
  40–59% e abaixo de 40%.
- **Visual:** cabeçalho com **Dados do portal** e **Excel** (baixa a tela aberta, com os filtros, em .xlsx); ano em
  pílulas, mês, assistente, executivo e busca, **lembrados por pessoa** (com *Limpar filtros*); abas e visões com
  contadores do que pede atenção.
- **Controle:** as colunas da planilha *Controle Implantações*, com o **protocolo do portal** no lugar do Nº, cabeçalho e
  duas colunas fixas, ordenação por coluna; a **Obs.** quem conduz (e a coordenação) escreve na célula e ela vai para a
  ficha de transição.
- **Fichas de transição:** situação (a enviar, enviada, devolvida, recebida), versão, assistente de crédito e o prazo de 5
  dias úteis, com Cobrar para a coordenação.
- **Pós-implantação:** uma linha por implantação com as três etapas (espólios, pendências, 1ª prestação de contas),
  pílulas em aberto, atrasadas, vencem hoje ou amanhã e concluídas; Cobrar por etapa (coordenação). Veja a seção acima.
- **Mês vigente:** contratos que começam no mês, na ordem do 1º vencimento (previsto — o primeiro dia de vencimento a
  partir do início do contrato — até o setor informar). Do dia da virada (25) em diante, mostra o mês seguinte.
- **Meta de onboarding:** em até **30 dias depois do 1º vencimento**. "Síndico MyBlue" conta como batida; "A marcar"
  entra na carteira com o prazo correndo. Carteira = quem é responsável pela implantação (mesmo quando outra pessoa faz
  o onboarding). Meta **90%**: atingida com as batidas; em andamento se batidas + as que estão no prazo chegam lá.
- **Meta de documentação:** convenção, ata de eleição, ata da taxa ordinária (previsão orçamentária) e procuração em até
  **60 dias da data da documentação** (envio do formulário de implantação). Vale a data do primeiro envio de cada
  documento no portal. A coordenação pode **marcar à mão** (bateu ou faltou, com motivo), e voltar ao cálculo.
- **Cobrança de documentos:** só ao **executivo** (sem usuário no portal, a quem pediu), no sino e por e-mail; pelo botão
  Cobrar (setor) e sozinha, uma vez, quando faltam 3 dias para o limite. Fica no histórico da implantação.
- **Antecipações:** as negociadas no formulário, por mês de início do contrato; marcar e enviar ao Controle de
  Repasses, com a situação de lá.
- **Parâmetros:** prazos (30 e 60 dias; concluir em 3 e ficha em 5 dias úteis; pós-implantação: espólios 2, pendências
  1 e prestação de contas 5 dias úteis, para as assumidas a partir de 27/10/2026), meta (90%), virada (25), data-marco (01/07/2026, envios anteriores ficam fora das
  metas) e os documentos da meta. Só a coordenação e a administração alteram; cada mudança vale a partir de uma data e
  fica no histórico (`implantacao_parametros`): cada implantação usa a regra que valia no dia do envio.

## Histórico das planilhas (importação)

Em **Painel de implantação → Parâmetros → Importar o histórico das planilhas** (coordenação e administração), o portal recebe o
*Formulário de implantação* (todas as respostas do Forms) e o *Controle Implantações* (.csv ou .xlsx, como o Excel salva),
confere e mostra a prévia antes de gravar. Regras (`server/implantacoes/importacao.js`), as mesmas das fórmulas da planilha:

- a linha do Controle aponta a resposta pela coluna **Nº FORM (Ref.)**, que é a linha no Forms (resolve os Nº repetidos);
- Obs. com "teste" ou "desconsiderar" fica de fora; o mesmo condomínio (nome) repetido no ano vale pelo envio mais
  recente; mesmo CNPJ com nome diferente fica, com aviso;
- datas em número do Excel e "set-26" são convertidas; a UF sai do texto livre do estado; executivo pelo e-mail (ou
  nome), "implantado por" pela equipe do setor e o condomínio na Carteira pelo CNPJ (ou nome); o que não acha fica escrito,
  com aviso; implantação que já está no portal (mesmo CNPJ) vale a do portal;
- linhas do Controle entram com as etapas, a Obs., o % (100% = Na Carteira, senão em andamento) e, com "DOC. SIM", os
  documentos da meta como recebidos sem arquivo na DATA DOC.; respostas que não estão no Controle (anos anteriores) entram
  como concluídas, só como histórico.

As importadas ficam com `origem = 'planilha'`, o **Nº** do formulário e a etiqueta *planilha*. São histórico: contam no
Painel e nas metas da época (onboarding "REALIZADO" sem data conta como batido), mas não geram avisos, prazos, cobranças,
ficha de transição nem envio ao Controle de Repasses, e não entram na fila nem em "minhas". A que ficou em andamento dá para
atualizar e concluir (sem avisos), também pelo **Editar** da aba Controle (quem conduz e a coordenação); a data do
onboarding não é exigida. Ao concluir, o portal procura o condomínio na Carteira (ligado na importação, ID Vouch, CNPJ
ou nome): achou, a implantação só é ligada ao cadastro (nada é criado, não duplica); não achou (ex.: contratos que
ainda vão começar), fica **Concluída · aguardando a Carteira** e a coordenação confirma a entrada, com a conferência de
ID e CNPJ repetidos. O ID "planilha-N" é provisório (a planilha só dizia que o Vouch foi feito) e não vai para a Carteira.
Cada importação é um lote (`implantacao_importacoes`): **Desfazer importação** apaga o
que ninguém editou no portal. Os arquivos não ficam guardados: só o que foi importado.

## Contrato

A implantação aberta de uma análise que tem **Solicitação de Contrato** (`docs/contratos/LEIAME.md`) vem com os dados
do contrato: as condições fechadas pela advogada valem sobre o pedido do comercial. O contrato assinado e os documentos
do síndico entram nos documentos (tipo "Contrato assinado" e os tipos equivalentes daqui). A tela mostra o quadro
**Condições fechadas no contrato** (foro, fidelização, cláusulas negociadas); se o contrato fechar depois, a
implantação é ligada a ele na conclusão. Sem implantação, o executivo é avisado e clica em **Solicitar implantação** no
contrato (`abrirDoContrato`): abre em rascunho, já com as condições fechadas.
O que vem das condições fechadas no contrato (taxa administrativa, boleto, desconto de pontualidade, vigência,
honorários e cashback, em `CAMPOS_FECHADOS_IMPLANTACAO`) não muda na implantação: a tela trava e o servidor mantém o do
contrato. **O que será garantido** e o **primeiro vencimento** também vêm do contrato, mas o comercial ajusta na
implantação (o síndico às vezes muda o vencimento); o dia de vencimento dos boletos acompanha a data do primeiro
vencimento. Os documentos
que vieram da análise ou do contrato (convenção, retorno da análise, contrato assinado) ficam marcados `vinculado`: não
se trocam nem se removem na implantação. O retorno da análise é obrigatório para enviar (no condomínio de entrega, não). Sem contrato assinado no portal, a implantação continua abrindo, com um aviso.

## Contrato assinado fora do portal

O comercial anexa o **contrato assinado** e o **PDF do Retorno de Análise de Crédito** (o modelo de 4 páginas do mesmo
gerador) e preenche o formulário; quem registra as condições do contrato é a advogada.

- **Leitura do retorno** (`POST /api/implantacoes/pdf?acao=ler|criar`): o portal lê (`server/implantacoes/pdf.js`, com o
  `pdftotext` do pacote `poppler-utils`, no Dockerfile) protocolo e data, razão social, CNPJ, executivo, status, taxa
  administrativa, boleto, unidades e taxa ordinária (memória de cálculo), síndico e cidade/UF (do texto, para conferir),
  observações jurídicas e próximos passos (vão para as observações da implantação). Reprovada ou pendente não abre; o
  mesmo protocolo não abre duas implantações; análise que está no portal não entra por aqui (o contrato é pedido em
  Solicitação de Contrato), nem análise que já tem contrato no portal. O PDF entra nos documentos como "Análise de
  Crédito"; o contrato assinado sobe em seguida, como "Contrato assinado". A implantação fica marcada `assinado_fora`.
- **Formulário:** taxa administrativa, boleto, desconto de pontualidade, vigência e honorários (`DA_ADVOGADA` em
  `server/implantacoes/formulario.js`) ficam travados com a etiqueta "a advogada preenche" e não são cobrados no envio; o
  resto é do executivo, como sempre (o que será garantido, o 1º vencimento e o cashback inclusive). O contrato assinado é
  obrigatório para enviar.
- **Envio → Jurídico:** sai o protocolo IMP e a implantação vai para a etapa **juridico** ("Com o Jurídico · condições do
  contrato"): o portal cria o contrato direto na etapa `conferencia` (sem minuta, sem síndico, sem envio para assinatura),
  com o pedido igual ao formulário (`formulario.assinado_fora`), a via assinada, o retorno e a convenção, e avisa quem
  elabora contratos (sino e e-mail). O contrato assinado e o retorno ficam vinculados à implantação.
- **Condições registradas → setor:** quando a advogada conclui o contrato (`PUT /api/contratos/:id/fechado`), as condições
  entram no formulário (`seguirDoJuridico`) e a implantação **segue sozinha para o setor Implantação**, com os avisos de
  sempre; o executivo recebe "Condições registradas" (sino e e-mail). Se ainda faltar algo dele, ela volta para rascunho
  com a lista.
- **Desistência:** o Jurídico cancelando o contrato, a implantação volta ao executivo em rascunho, com o motivo
  (`voltarDoJuridico`). O executivo cancelando a implantação com o Jurídico, a conferência do contrato é cancelada junto.

## Implantações antigas

As abertas antes desta regra continuam como estão: pela análise do portal, pelo PDF do retorno (com o prazo de 90 dias e
a liberação do gestor da Análise de Crédito) ou de condomínio de entrega com a aprovação da diretoria na própria
implantação (etapa `diretoria`). Elas aparecem com a origem de antes; as rotas que as abriam não existem mais.

## Formulário em PDF

Botão **PDF** na implantação (quem a vê pode exportar): `GET /api/implantacoes/:id/formulario.pdf`. O conteúdo é
montado em `server/implantacoes/formulario-pdf.js` e desenhado por `server/implantacoes/formulario_pdf.py` (ReportLab,
no visual do Retorno de Análise de Crédito): cabeçalho com o protocolo, faixa do condomínio, diferenças em relação à
análise, os 7 blocos, documentos (entregues e pendentes) e o andamento no setor. Sai no **papel timbrado** da MyBlue
(`server/implantacoes/timbrado.png`, a página A4 inteira; o mesmo da ficha de transição).

## Tutoriais

No catálogo (`server/tutoriais.js`): `implantacao-solicitar` (executivos, setor Implantação e diretoria),
`implantacao-conduzir` e `implantacao-ficha-repasse` (setor Implantação) e `implantacao-acompanhar` (setor Implantação e diretoria). Roteiros em `docs/tutoriais/fonte/roteiros.js`; no cenário de gravação, a
coordenadora e o analista de implantação fictícios. Os vídeos são gravados com `docs/tutoriais/fonte/gravar-tutoriais.js`
e enviados em Administração → Tutoriais.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Nomes reais (executivos, condomínios, parceiros)
entram pelo portal e ficam no banco.
