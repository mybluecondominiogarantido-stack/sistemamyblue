# Solicitação de Contrato Parceria

Do pedido do comercial ao parceiro cadastrado na base de comissão. Substitui o formulário "Solicitação de Contrato
Parceria – MyBlue" do Microsoft Forms e o e-mail com o PDF. O comercial pede o contrato com a empresa parceira, quem
elabora os contratos (Jurídico) redige a minuta em até 72h úteis, a minuta vai e volta com os ajustes até a assinatura,
a advogada registra as condições (comissões, vigência e contatos) e o **setor Parceiros** cadastra o parceiro na
**Prestação de Contas — Comissão de Parceiros** com um clique. Tela própria do portal, no grupo **Jurídico** do menu, ao
lado da Solicitação de Contrato, com os mesmos padrões dela.

| Onde | O que |
|---|---|
| **Solicitações ao Jurídico** (`#/juridico/pedidos`) | **Novo pedido → Contrato de parceria** abre o formulário; a parceria aparece em **Meus pedidos** |
| **Painel do Jurídico** (`#/juridico/painel/<aba>`) | **Minhas demandas** (com as demais demandas), **Assinaturas** (junto com os contratos de garantia e as demandas), **Diretoria → Contratos de parceria**, **Cadastro de parceiros** (setor Parceiros), **Todos** |
| A solicitação | `#/parcerias/<id>` (os endereços antigos `#/parcerias/<aba>` levam à aba equivalente) |

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, lista, formulário, conferência, documentos, envio, Jurídico, diretoria, ajuste, assinatura, condições, cadastro do parceiro) e a rotina | `server/rotas/parcerias.js` |
| Regras do formulário: o que falta, o que vai à diretoria, as condições do contrato e o registro do parceiro na base | `server/parcerias/formulario.js` |
| Tabelas `parcerias`, `parceria_documentos`, `parceria_eventos`, `parceria_protocolos` | `server/db.js` |
| Telas | `public/app.js` (bloco Solicitação de Contrato Parceria) |
| Na lista das Demandas Jurídicas | `server/rotas/juridico.js` (`origem: 'parceria'`) |
| Testes (dados fictícios) | `test/parcerias.test.js` |
| Tutoriais | `parceria-solicitar`, `parceria-elaborar` e `parceria-cadastrar` (`server/tutoriais.js`) |

## Etapas

`rascunho` → `fila` → `em_elaboracao` → `minuta_enviada` (com o comercial: pede ajuste ou a assinatura) →
`para_assinar` → `em_assinatura` → `conferencia` (a via assinada voltou, a advogada registra as condições) → `assinado`.
Fora do caminho: `pendencia` (falta informação, volta a quem pediu) e `cancelada`. O ajuste volta para `em_elaboracao`,
com a mesma pessoa e mais 72h úteis. Depois de `assinado`, a solicitação fica **aguardando o cadastro do parceiro** até o
setor Parceiros confirmar.

## Quem faz o quê

- **Quem pede:** executivos (cadastro de executivo), quem é do setor **Comercial** ou do **CS**, a diretoria e a
  administração. O solicitante é quem está no portal (sai a lista de nomes do Forms).
- **Quem elabora:** a mesma permissão da Solicitação de Contrato, "Elaborar as minutas de contrato"
  (`contratos.elaborar`, Configurações → Acessos → Solicitação de Contrato).
- **Diretoria:** quem chancela análises de crédito. Decide o percentual fora do padrão antes da minuta.
- **Setor Parceiros:** quem é do setor Parceiros no portal. Confere e cadastra o parceiro.
- **Administração:** tudo.

## Regras

- **Formulário:** os 12 campos do Forms. Obrigatórios: nome da empresa, CNPJ (válido), representante legal (nome, CPF
  válido e e-mail), responsável financeiro (nome e telefone com DDD), e-mail para a prestação de contas, comissão de
  recorrência (sim/não) e comissão de venda (sim/não). Outras solicitações é opcional. **Não se pedem documentos do
  parceiro.**
- **Comissões:** recorrência de **10%** ou **5%**; venda de **50% da 1ª taxa administrativa**. A tela não oferece
  mais **outro percentual**. O servidor ainda trata pedidos antigos com outro percentual: a diretoria é avisada no envio e
  a minuta só sai depois da decisão; não aprovado, vale o padrão (a venda volta para 50%; a recorrência fica para a
  advogada registrar a que ficou no contrato). "Não" nas duas avisa
  que o contrato fica sem comissão.
- **CNPJ repetido:** se o CNPJ já tem solicitação enviada (e não cancelada), não dá para enviar outra. Se já está na base
  de parceiros, o portal avisa (não impede).
- **Envio:** protocolo **CP-AAAA-MM-DD-NN** (sequencial por dia, Brasília). Prazo da minuta: **72h úteis = 3 dias de
  expediente**, do envio; recomeça a cada ajuste e no reenvio depois de pendência. Passou do prazo, avisa uma vez quem
  assumiu (ou quem elabora, se ninguém assumiu).
- **Minuta e assinatura:** como na Solicitação de Contrato. O comercial leva a minuta ao parceiro e clica em *Pedir
  ajuste* ou em *Parceiro aprovou: pedir assinatura*. O Jurídico marca *Enviado para assinatura* e, com a via assinada
  anexada, *Assinado*.
- **Condições do contrato:** vêm do pedido e da decisão da diretoria; a advogada corrige o que mudou: recorrência e venda
  (percentuais), início da vigência (obrigatório), prazo em meses, representante, financeiro, e-mail da prestação de
  contas e observações. Concluir avisa o setor Parceiros e quem pediu. Contrato concluído: *Corrigir condições*, com
  motivo; o histórico guarda o que mudou.
- **Cadastro do parceiro:** o setor Parceiros vê os dados prontos e clica em **Cadastrar parceiro**. O registro entra na
  coleção `partners` da ferramenta `parceiros` com `id`, `nome`, `uf` e os dados do contrato (`cnpj`, `representante`,
  `email`, `responsavelFinanceiro`, `telefoneFinanceiro`, `emailPrestacao`, `comissaoRecorrencia`, `comissaoVenda`,
  `contrato`, `vigencia`) e as **categorias** do contrato (`tags`): só venda → `somentevenda`; só recorrência →
  `recorrencia`; as duas → `recorrencia` e `venda` (as outras categorias do parceiro ficam). Parceiro novo já entra com as
  condições de cálculo (`rate` = recorrência ou 0, `venda` = 1º mês, `vendaPct`). Se o CNPJ (ou, sem CNPJ lá, o nome) já está na base, o contrato é **ligado ao cadastro
  existente**: o `id`, o nome, a UF e as condições de cálculo dele ficam; os dados do contrato e as categorias são atualizados. Sem confirmação, a rotina lembra o
  setor Parceiros a cada **2 dias úteis**. Cadastrado, quem pediu é avisado de que já pode indicar condomínios (o
  parceiro aparece na seção Parceria do formulário de implantação).
- **Demandas Jurídicas:** os pedidos enviados aparecem na lista, nas planilhas e nos indicadores, no tipo de parceria
  da Tabela de prazos (o primeiro com "parceri" no nome, ex.: "Contrato (parcerias)"; sem ele, "Contrato de Parceria"),
  com o prazo de 72h úteis e a primeira minuta como entrega. Clicar abre a solicitação.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Os nomes reais (parceiros, executivos, advogadas)
entram pelo portal e ficam no banco.
