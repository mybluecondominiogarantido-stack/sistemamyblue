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

No portal, o analista copia o **bloco PORTAL MYBLUE** que as skills escrevem no fim da resposta (botão de copiar do
bloco) e cola em **Colar resultado da skill** (no topo dos dados do analista); *Preencher os campos* põe cada etiqueta no
seu campo e marca em verde o que preencheu:

| Etiqueta do bloco | Campo no portal |
|---|---|
| `[relatorio]` | data de emissão, primeira competência, "detalhado por competência", "traz o nome dos devedores" |
| `[lancamentos]` | Relatório de inadimplência → Lançamentos |
| `[convencao]` | Convenção (registro, unidades, multa, foro, cartório, cláusula), com página e trecho |
| `[observacoes_analise]` | Textos do retorno → complemento da página 1 (tendência, recorrência, acordos), depois do texto automático |
| `[observacoes_juridicas]`, `[proximos_passos]` | Textos do retorno (página 4) |
| `[ressalvas]` | Ressalvas do analista |
| `[avisos]`, `[assertiva]` | avisos na tela, para conferir |

Os blocos das duas skills podem ser colados juntos (ou num bloco só, quando a conversa tem os dois documentos); um
relatório grande vem em partes, cada uma com o seu bloco. Sem o bloco, o portal reconhece o que puder do texto livre e
avisa. Nada é gravado sem o analista conferir e clicar em *Salvar e calcular*. Leitor em `server/credito/skill.js`,
testes em `test/credito-skill.test.js`.

## Consulta Assertiva

As pessoas físicas com 24 ou mais taxas ordinárias em aberto aparecem em **Consulta Assertiva (espólios)**. O analista
consulta cada uma e registra o resultado na linha: *não é espólio* ou *é espólio (fora da garantia)*. Espólio
confirmado sai do escopo (a MyBlue não garante a unidade) e aparece nas exclusões do retorno. Sem o registro de todas as
unidades, o retorno não é liberado. O histórico guarda quem registrou cada resultado.

## Correção do formulário pelo analista

Depois do envio o executivo não muda mais o formulário. O analista que assumiu a análise corrige em **Formulário do
executivo** (ex.: taxa ordinária digitada errada) e clica em *Salvar correção do formulário* (ou *Salvar e calcular*,
que também salva). O histórico registra cada campo corrigido, de → para.

## Condomínio ainda sem CNPJ

No formulário, **Ainda não tem CNPJ** (ex.: entrega de construtora) dispensa o CNPJ no envio. O cálculo gera o alerta
"regularizar em até 90 dias da primeira arrecadação; até lá, o repasse vai para a conta da administradora" (a mesma regra
do contrato), o retorno mostra "Ainda não tem (em constituição)" no lugar do CNPJ e põe o prazo nos próximos passos.

## Relatórios grandes

O cálculo grava as unidades e os lançamentos do relatório num comando por tabela. Antes era um comando por lançamento:
com um relatório de 3 mil lançamentos, a análise ficava travada por mais de um minuto e quem salvava ou abria a fila
recebia "Erro interno". Os botões *Salvar dados* e *Salvar e calcular* ficam desativados enquanto o pedido roda.

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
| Mês-base sem inadimplência | sai da média: com débito em 2 dos 3 meses, a média é a soma ÷ 2; em 1 mês, ÷ 1; em nenhum, 0%. Parâmetro em Política e faixas (`media_sem_meses_zerados`) |
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
