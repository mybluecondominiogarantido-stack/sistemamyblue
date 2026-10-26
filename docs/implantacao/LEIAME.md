# Implantação

Do contrato assinado à Carteira. O comercial abre a implantação a partir de uma análise de crédito liberada, preenche o
formulário (o antigo Formulário de Implantação do Microsoft Forms) e anexa os documentos; o setor **Implantação** conduz;
a coordenação confirma a entrada na Carteira. Tela própria do portal (menu **Implantação**), com os mesmos padrões da
Análise de Crédito.

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, análises disponíveis, liberação pelo gestor, formulário, documentos, envio, avisos) | `server/rotas/implantacoes.js` |
| Regras do formulário: o que vem da análise, o que falta, o que fica pendente, o comparativo | `server/implantacoes/formulario.js` |
| Tabelas `implantacoes`, `implantacao_documentos`, `implantacao_eventos`, `implantacao_liberacoes`, `implantacao_protocolos` | `server/db.js` |
| Lembretes: fila sem designação (4h úteis), prazo para iniciar vencido, pendências do executivo (uma vez por dia útil) — roda a cada 10 min | `criarRotinasImplantacao` em `server/rotas/implantacoes.js`, ligado em `server/index.js` |
| Setor no dia a dia: quem edita (autorizações), pausas e prazo para concluir, onboarding depois de concluir, documento recebido sem arquivo, Obs. do Controle, Cobrar e a rotina dos prazos | `server/rotas/implantacoes-setor.js`; prazos em dias úteis em `server/implantacoes/prazos.js`; tabelas `implantacao_autorizacoes` e `implantacao_pausas` |
| Ficha de repasse (montagem, envio, devolução, versões, PDF e rotina do prazo) | `server/implantacoes/ficha.js` e `server/rotas/implantacoes-ficha.js`; tabelas `implantacao_fichas` e `implantacao_ficha_versoes` |
| Antecipação → Controle de Repasses | `server/rotas/implantacoes-antecipacoes.js`; tabela `implantacao_antecipacoes` |
| Acompanhamento (painel, mês vigente, controle, metas, antecipações, fichas, parâmetros, cobrança de documentos, Excel) | `server/rotas/implantacoes-acompanhamento.js`; regras em `server/implantacoes/metas.js`; tabela `implantacao_parametros`; .xlsx em `server/xlsx.js` |
| Telas | `public/app.js` (bloco Implantação, ficha de repasse e bloco Acompanhamento) |
| Testes (dados fictícios) | `test/implantacoes-formulario.test.js`, `test/implantacoes-rotas.test.js`, `test/implantacoes-metas.test.js`, `test/implantacoes-setor.test.js` |

## Regras

- **De onde vem:** análise do portal enviada, aprovada ou com ressalvas, sem reanálise enviada depois e sem implantação
  aberta. Abre implantação até `implantacao_validade_dias` (política de crédito, padrão **90**) depois da liberação do
  retorno. Depois disso, o comercial pede a liberação ao **gestor da Análise de Crédito** (sino e e-mail); liberada, abre
  normalmente; recusada, o caminho é a reanálise. (Os 30 dias de validade da proposta, no retorno, continuam iguais.)
- **Formulário:** vem preenchido com a análise e tudo pode ser ajustado. A análise fica ao lado de cada campo, e o que
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
  recusado), onboarding (a marcar, marcado, síndico MyBlue ou realizado; marcado e realizado com data, hora e quem fez —
  começa com quem conduz), emissão de boletos (com o **1º vencimento**, que o setor informa: nem sempre é o dia do
  formulário, pelo prazo curto para implantar) e envio (digital, físico ou ambos; vai para a Carteira como forma de
  envio). Concluir com as outras 4 etapas feitas e o 1º vencimento; o onboarding pode ficar para depois.
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
- **Documento recebido sem arquivo** (em papel, já no CPD): **Marcar recebido**, com observação obrigatória; conta como
  recebido na data da marcação (pendências e meta de documentação). Dá para desfazer; o arquivo, se chegar depois, é
  anexado normalmente.
- **Conferências do portal:** diferenças com a análise, CPF do síndico, CNPJ e o cadastro de moradores (Excel/CSV): nº
  de unidades contra o formulário e linhas com CPF/CNPJ inválido.
- **Pendência:** quem conduz devolve ao comercial com a lista do que falta (sino e e-mail); o reenvio volta para a
  mesma pessoa.
- **Onboarding depois de concluir:** dá para concluir com o onboarding pendente; o alerta fica na implantação até
  registrar. Vencido o prazo do onboarding sem ele, quem conduz escreve a **justificativa** (a coordenação é avisada
  por dia útil até justificar); a meta fica como não batida mesmo justificada.
- **Conclusão:** avisa a coordenação ("Pronta para a Carteira") e abre a **ficha de repasse**. Com parceria, o condomínio entra na Prestação de
  Contas (coleção `condos`) ligado ao parceiro com comissão 0% (`vinculosJSON`), e o setor Parceiros é avisado para
  cadastrar a condição; se o condomínio já existir lá, ou o parceiro não estiver na base, o aviso diz o que conferir.
- **Carteira:** a coordenação confere os dados sugeridos (ID Vouch, nome sugerido, UF, vencimento, vigência,
  administradora, forma de envio, executivo, razão social, CNPJ) e confirma; o portal recusa ID ou CNPJ que já estão na
  Carteira. Os responsáveis (cobrança, extrajudicial, crédito) são escolhidos depois, na ficha do condomínio. O Controle
  de Emissão de Boletos acompanha, como em qualquer condomínio novo da Carteira.

## Ficha de repasse

Abre na conclusão, já preenchida (`server/implantacoes/ficha.js`) com o formulário, a análise, o contrato, as etapas e os
documentos, em 8 partes: informações gerais, financeiras (2.1 consumo, 2.2 taxa extra, 2.3 fundo de reserva, 2.4
reservas e outras receitas), não garantidos (taxas do contrato e unidades), conta bancária e repasse, documentos
(anexados e conferidos pela Implantação), cashback, particularidades e outras observações (já com a Obs. do Controle).
O que só a Implantação sabe vai nos **campos em azul**; o resto não se edita na ficha (corrige-se no formulário ou na
etapa, e a ficha acompanha).

- **Envio:** à assistente de crédito do condomínio na Carteira (`assistente_credito`, pelo nome, no setor Crédito);
  sem ela, à **supervisão de Crédito**, que escolhe (e o portal grava na Carteira quando o condomínio entrar). Aviso no
  sino e por e-mail; ela confirma o recebimento ou **devolve com uma pergunta**. Quem conduz responde sem mudar a ficha
  ou envia uma nova versão.
- **Versões:** cada envio guarda a ficha como foi (`implantacao_ficha_versoes`); a partir da 2ª, com o motivo. Até
  **3**; mais, só com a liberação da coordenação (com motivo). PDF de cada versão no papel timbrado
  (`GET /api/implantacoes/:id/ficha.pdf?versao=N`, arquivo com `-vN`).
- **Prazo:** `ficha_dias` (**5**) dias úteis da conclusão até o **primeiro envio**; devolução e nova versão não reabrem.
  Lembrete 1 dia útil antes e no dia; atrasada, alerta por dia útil a quem conduz e à coordenação (Cobrar).
- Tela: `#/implantacao/:id/ficha` (a assistente de crédito entra pelo link do aviso).

## Antecipação → Controle de Repasses

Na aba Antecipações do Acompanhamento, a equipe marca e envia a antecipação negociada no formulário (valor, data, dia,
prazo e o mês final). No Controle de Repasses (ferramenta `repasses`), quem tem o papel **Gestor** cadastra a regra (com
ajuste ou não) ou devolve com o motivo; a situação volta para a implantação. Se o formulário mudar depois do cadastro,
a aba mostra e reenvia como **atualização**, com o antes e o depois. Dá para desfazer o envio antes da decisão. API:
`GET /api/repasses/antecipacoes`, `POST /api/repasses/antecipacoes/:id/cadastrar` `{ regra_id, valor, dia, modo, fim, obs }`
e `.../devolver` `{ motivo }` (liberadas para a ferramenta isolada em `server/seguranca.js`).

## Acompanhamento

Menu **Implantação → Acompanhamento** (setor Implantação, coordenação, diretoria e administração). Substitui as telas
calculadas da planilha de controle (Dashboard, Mês Vigente, Onboarding, Documentação, Devolutiva e Antecipações).
Entram as implantações enviadas ao setor (fora rascunho, diretoria e canceladas); ano e mês pela data de início do contrato.

- **% concluído:** etapas feitas ÷ 5 (concluída ou na Carteira = 100%). Faixas: concluída, só falta o onboarding, 60–99%,
  40–59% e abaixo de 40%.
- **Visual:** cabeçalho com **Dados do portal** e **Excel** (baixa a aba aberta, com os filtros, em .xlsx); aviso de
  cada aba; ano em pílulas, mês, analista, executivo e busca, **lembrados por pessoa** (com *Limpar filtros*); abas com
  ícones e contadores do que pede atenção; cartões clicáveis que filtram a lista.
- **Painel:** contratos, % médio, concluídos, em andamento, não iniciados; progresso por etapa e o gargalo; contratos e
  concluídos por mês (o filtro de mês não muda o gráfico); por UF, executivo e analista; a lista dos contratos.
- **Controle:** as colunas da planilha *Controle Implantações*, com o **protocolo do portal** no lugar do Nº, cabeçalho e
  duas colunas fixas, ordenação por coluna; a **Obs.** quem conduz (e a coordenação) escreve na célula e ela vai para a
  ficha de repasse.
- **Fichas de repasse:** situação (a enviar, enviada, devolvida, recebida), versão, assistente de crédito e o prazo de 5
  dias úteis, com Cobrar para a coordenação.
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
- **Parâmetros:** prazos (30 e 60 dias; concluir em 3 e ficha em 5 dias úteis), meta (90%), virada (25), data-marco (01/07/2026, envios anteriores ficam fora das
  metas) e os documentos da meta. Só a coordenação e a administração alteram; cada mudança vale a partir de uma data e
  fica no histórico (`implantacao_parametros`): cada implantação usa a regra que valia no dia do envio.

## Histórico das planilhas (importação)

Em **Acompanhamento → Parâmetros → Importar o histórico das planilhas** (coordenação e administração), o portal recebe o
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
ficha de repasse nem envio ao Controle de Repasses, e não entram na fila nem em "minhas". A que ficou em andamento dá para
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

## Outras origens

- **Condomínio de entrega** (construtora entregando, em enxoval): o comercial preenche o condomínio, a construtora, as
  unidades e a taxa ordinária previstas e a taxa administrativa e o boleto propostos, e pede a **aprovação da
  diretoria** (quem chancela análises de crédito; sino e e-mail). A diretoria aprova (podendo mudar os valores) ou não
  (com motivo). Aprovado, os valores viram a referência do comparativo; com o contrato assinado, o comercial completa o
  formulário e envia. Pode seguir **sem CNPJ** ("Ainda não tem CNPJ") e sem os documentos de enxoval: CNPJ e os quatro
  documentos obrigatórios viram pendências, com o alerta diário ao executivo.
- **Análise feita antes do portal:** o comercial anexa o PDF do Retorno de Análise de Crédito (o modelo de 4 páginas
  do mesmo gerador). O portal lê (`server/implantacoes/pdf.js`, com o `pdftotext` do pacote `poppler-utils`, no
  Dockerfile): protocolo e data, razão social, CNPJ, executivo, status, taxa administrativa, boleto, unidades e taxa
  ordinária (memória de cálculo), síndico e cidade/UF (do texto, para conferir), observações jurídicas e próximos
  passos (vão para as observações da implantação). O prazo de 90 dias conta da data do PDF; depois, a liberação do
  gestor da Análise de Crédito é pedida pelo próprio PDF. Reprovada ou pendente não abre; o mesmo protocolo não abre
  duas implantações; análise que está no portal usa a origem do portal. O PDF entra nos documentos como "Análise de
  Crédito".

## Formulário em PDF

Botão **PDF** na implantação (quem a vê pode exportar): `GET /api/implantacoes/:id/formulario.pdf`. O conteúdo é
montado em `server/implantacoes/formulario-pdf.js` e desenhado por `server/implantacoes/formulario_pdf.py` (ReportLab,
no visual do Retorno de Análise de Crédito): cabeçalho com o protocolo, faixa do condomínio, diferenças em relação à
análise, os 7 blocos, documentos (entregues e pendentes) e o andamento no setor. Sai no **papel timbrado** da MyBlue
(`server/implantacoes/timbrado.png`, a página A4 inteira; o mesmo da ficha de repasse).

## Tutoriais

No catálogo (`server/tutoriais.js`): `implantacao-solicitar` (executivos, setor Implantação e diretoria),
`implantacao-conduzir` e `implantacao-ficha-repasse` (setor Implantação) e `implantacao-acompanhar` (setor Implantação e diretoria). Roteiros em `docs/tutoriais/fonte/roteiros.js`; no cenário de gravação, a
coordenadora e o analista de implantação fictícios. Os vídeos são gravados com `docs/tutoriais/fonte/gravar-tutoriais.js`
e enviados em Administração → Tutoriais.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Nomes reais (executivos, condomínios, parceiros)
entram pelo portal e ficam no banco.
