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
| Telas | `public/app.js` (bloco Implantação) |
| Testes (dados fictícios) | `test/implantacoes-formulario.test.js`, `test/implantacoes-rotas.test.js` |

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
  anterior (e o CNPJ, no condomínio de entrega sem CNPJ). No envio, o executivo recebe a lista no sino; depois, um e-mail
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
  recusado), onboarding (a marcar, marcado, síndico MyBlue ou realizado), emissão de boletos e envio (digital, físico ou
  ambos; vai para a Carteira como forma de envio). Concluir só com as 5 feitas.
- **Conferências do portal:** diferenças com a análise, CPF do síndico, CNPJ e o cadastro de moradores (Excel/CSV): nº
  de unidades contra o formulário e linhas com CPF/CNPJ inválido.
- **Pendência:** quem conduz devolve ao comercial com a lista do que falta (sino e e-mail); o reenvio volta para a
  mesma pessoa.
- **Conclusão:** avisa a coordenação ("Pronta para a Carteira"). Com parceria, o condomínio entra na Prestação de
  Contas (coleção `condos`) ligado ao parceiro com comissão 0% (`vinculosJSON`), e o setor Parceiros é avisado para
  cadastrar a condição; se o condomínio já existir lá, ou o parceiro não estiver na base, o aviso diz o que conferir.
- **Carteira:** a coordenação confere os dados sugeridos (ID Vouch, nome sugerido, UF, vencimento, vigência,
  administradora, forma de envio, executivo, razão social, CNPJ) e confirma; o portal recusa ID ou CNPJ que já estão na
  Carteira. Os responsáveis (cobrança, extrajudicial, crédito) são escolhidos depois, na ficha do condomínio. O Controle
  de Emissão de Boletos acompanha, como em qualquer condomínio novo da Carteira.

## Contrato

A implantação aberta de uma análise que tem **Solicitação de Contrato** (`docs/contratos/LEIAME.md`) vem com os dados
do contrato: as condições fechadas pela advogada valem sobre o pedido do comercial. O contrato assinado e os documentos
do síndico entram nos documentos (tipo "Contrato assinado" e os tipos equivalentes daqui). A tela mostra o quadro
**Condições fechadas no contrato** (foro, fidelização, cláusulas negociadas); se o contrato fechar depois, a
implantação é ligada a ele na conclusão. Sem implantação, o executivo é avisado e clica em **Solicitar implantação** no
contrato (`abrirDoContrato`): abre em rascunho, já com as condições fechadas.
O que será garantido vem do contrato fechado e não muda na implantação (o servidor mantém o do contrato). Os documentos
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
análise, os 7 blocos, documentos (entregues e pendentes) e o andamento no setor.

## Tutoriais

No catálogo (`server/tutoriais.js`): `implantacao-solicitar` (executivos, setor Implantação e diretoria) e
`implantacao-conduzir` (setor Implantação). Roteiros em `docs/tutoriais/fonte/roteiros.js`; no cenário de gravação, a
coordenadora e o analista de implantação fictícios. Os vídeos são gravados com `docs/tutoriais/fonte/gravar-tutoriais.js`
e enviados em Administração → Tutoriais.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Nomes reais (executivos, condomínios, parceiros)
entram pelo portal e ficam no banco.
