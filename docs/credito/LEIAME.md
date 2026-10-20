# Análise de Crédito automatizada

O executivo de negócios pede a análise no portal, o analista de crédito assume a solicitação, a IA (API Claude) lê os
PDFs, o **motor de regras** calcula tudo e o analista valida e libera o retorno. A IA só extrai e redige: cálculo,
faixa e status são código determinístico e testado. Nada vai ao executivo sem a validação do analista.

## Onde está cada parte

| Parte | Arquivo | Situação |
|---|---|---|
| Parâmetros da política (padrão e validação) | `server/credito/politica.js` | pronto |
| Motor de regras | `server/credito/motor.js` | pronto, testes em `test/credito-motor.test.js` |
| Política no banco, protocolo | `server/credito/banco.js` + tabelas em `server/db.js` | pronto, testes em `test/credito-banco.test.js` |
| Prazos em horário útil | `server/expediente.js` (`fimDoDiaUtil`, `somarDiasUteis`) | pronto |
| Leitura dos PDFs pela IA (relatório e convenção) | `server/credito/extracao.js` | pronta; liga com `ANTHROPIC_API_KEY` (testes em `test/credito-extracao.test.js`); falta calibrar com amostras de cada sistema |
| API do fluxo (executivo, analista, diretoria, administração) | `server/rotas/credito.js` + `server/credito/colar.js` | pronto, testes em `test/credito-rotas.test.js` |
| Telas no portal (menu Análise de Crédito) | `public/app.js` | pronto |
| Tutoriais em vídeo | catálogo em `server/tutoriais.js`, roteiros em `docs/tutoriais/fonte/roteiros.js` | `credito-solicitar` e `credito-analisar` |
| Retorno em PDF, resumo executivo e e-mail | `server/credito/retorno.js` + `server/credito/retorno/gerador_retorno.py` | pronto (PDF), testes em `test/credito-retorno.test.js` |

## Leitura dos PDFs pela IA

Quando o executivo envia, o portal manda o relatório e a convenção (PDF) para a API Claude em segundo plano. Volta, em
formato fixo: do relatório, as unidades e os lançamentos por competência (principal separado de multa, juros, acordo…),
a data de emissão, se há competência e nomes; da convenção, o registro, as unidades, a multa, o foro e cláusulas, cada
um com a página e um trecho. Isso entra nos dados do analista como sugestão: os lançamentos aparecem na área da
planilha, onde ele confere e corrige, e só então calcula. O analista pode pedir **Ler de novo com IA**.

A IA só lê: quem calcula é o motor de regras. Sem `ANTHROPIC_API_KEY`, a leitura fica desligada e o analista cola a
planilha. Configuração: `CREDITO_IA_MODELO` (padrão `claude-opus-5-5`) e `CREDITO_IA_ESFORCO` (`low`, `medium`,
`high`; padrão `medium`). Se o modelo recusar o documento por segurança, a API tenta de novo no modelo recomendado
(`fallbacks`). Os dados do relatório (nomes, CPF) vão para a Anthropic: revisar os termos antes de ligar.

## Skills do Claude (leitura sem a API)

Para ler os documentos pelo Claude do plano da empresa (claude.ai / Cowork), sem a API: `skills/leitura-inadimplencia-myblue`
devolve os lançamentos no formato da área **Lançamentos** do portal (colar e clicar em *Ler planilha*), com as
conferências da política e os candidatos à Assertiva; `skills/leitura-convencao-myblue` devolve os campos da seção
**Convenção** (com página e trecho) e os textos para **Textos do retorno** (observações jurídicas, próximos passos e
ressalvas). Para instalar: claude.ai → Configurações → Capacidades → Skills → enviar o `.skill` (ou a pasta em zip).

## Retorno em PDF

O gerador é o canônico (ReportLab). Layout, cores, dimensões e classes não mudam; no portal mudam só a entrada e a
saída (o `DADOS` vem em JSON de `retorno.js`, o PDF sai num arquivo temporário, o logo é o do portal,
`public/img/logo.png`) e o ícone do status: ✓ e ✗ não existem na Helvetica do ReportLab (saíam como "NO GLYPH"), então
vêm da DejaVu Sans Bold embutida no PDF. O PDF tem sempre 4 páginas: se o texto passar, `retorno.js` condensa a nota
da página 2, as observações jurídicas e as observações da página 1, nessa ordem, e gera de novo.

Servidor: `python3`, `python3-reportlab` e `fonts-dejavu-core` (Dockerfile). A assinatura do e-mail vem de
`CREDITO_ASSINATURA_EMAIL` (o nome real fica na configuração do servidor, não no código).

## Decisões confirmadas pelo setor (out/2026)

Todas ficam como parâmetro da política (tabela `parametros_politica`), sem nada fixo no código.

| Ponto | Decisão |
|---|---|
| Reprovação por inadimplência | acima de **40%** (35% a 40% = ressalvas + chancela da diretoria) |
| Regra dos 10 dias | a competência entra se, na emissão do relatório, passaram **mais de 10 dias** do vencimento |
| Boleto | **R$ 2,00** fixo; Maranhão **R$ 5,50**. Executivo com boleto próprio: no cadastro dele (tabela `executivos`) |
| Taxa extra | a taxa extra vigente (por unidade, conforme o formulário) entra **inteira**, sem limite; acima de **40% da ordinária** gera aviso ao analista |
| Assertiva | pessoa física com **24 ou mais taxas ordinárias em aberto**; CNPJ fora |
| Nº de unidades | **convenção** prevalece; formulário prevalece para taxa, vencimento e isenção |
| Protocolo | **AC-AAAA-MM-DD-NN**, sequencial por dia (Brasília), gerado pelo banco |
| Reanálise | **protocolo novo**, ligado à análise original (`analises.origem_id`) |
| Formato do retorno | **só PDF** (sem PPTX) |
| Analistas | quem é do setor **Análise de Crédito** (diferente do setor Crédito); o portal cria o setor |
| Assinatura do retorno | **nome do analista** que liberou |
| Desconto de pontualidade | opcional, conforme o formulário (a regra "sempre 10%" foi revogada); em %, incide sobre a taxa ordinária |
| Prazo do analista | chegou num dia útil até as **16h** → até as 17h do mesmo dia; depois → 17h do próximo dia útil |
| Prazo ao executivo | **24h** a partir da documentação completa, pulando fim de semana e feriado; **48h** com diretoria |

Avisos: análise nova com documentação completa avisa os analistas no sino do portal. A reanálise também avisa o
analista da análise original.

## Pontos em aberto

- O exemplo de jul/2026 do §9.1 registrava receita de R$ 60.600; o setor confirmou que o certo pela regra é
  23 UH × (R$ 1.840 + R$ 700) = R$ 58.420 (síndico isento descontado). O teste segue a regra (14,31%, 3,00% + R$ 2,00).
- Uma análise de regressão foi registrada com 3,50% para 22,41%; pela tabela é 3,75%. Confirmar se houve ajuste.

## Dados

O repositório é público: testes e exemplos usam só dados fictícios. Os nomes reais (executivos, condomínios) entram
pelo portal e ficam no banco.
