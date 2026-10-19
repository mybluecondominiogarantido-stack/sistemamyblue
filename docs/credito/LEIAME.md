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
| Extração dos PDFs pela IA, leitores por tipo de relatório | — | próxima etapa |
| Formulário do executivo, fila e revisão do analista | — | depois (telas aprovadas no design) |
| Retorno em PDF/PPTX e e-mails | — | por último (gerador canônico, fora do repositório) |

## Decisões confirmadas pelo setor (out/2026)

Todas ficam como parâmetro da política (tabela `parametros_politica`), sem nada fixo no código.

| Ponto | Decisão |
|---|---|
| Reprovação por inadimplência | acima de **40%** (35% a 40% = ressalvas + chancela da diretoria) |
| Regra dos 10 dias | a competência entra se, na emissão do relatório, passaram **mais de 10 dias** do vencimento |
| Boleto | **R$ 2,00** fixo; Maranhão **R$ 5,50**. Executivo com boleto próprio: no cadastro dele (tabela `executivos`) |
| Assertiva | pessoa física com **24 ou mais taxas ordinárias em aberto**; CNPJ fora |
| Nº de unidades | **convenção** prevalece; formulário prevalece para taxa, vencimento e isenção |
| Protocolo | **AC-AAAA-MM-DD-NN**, sequencial por dia (Brasília), gerado pelo banco |
| Reanálise | **protocolo novo**, ligado à análise original (`analises.origem_id`) |
| Assinatura do retorno | **nome do analista** que liberou |
| Desconto de pontualidade | opcional, conforme o formulário (a regra "sempre 10%" foi revogada); em %, incide sobre a taxa ordinária |
| Prazo do analista | chegou num dia útil até as **16h** → até as 17h do mesmo dia; depois → 17h do próximo dia útil |
| Prazo ao executivo | **24h** a partir da documentação completa, pulando fim de semana e feriado; **48h** com diretoria |

Avisos: análise nova com documentação completa avisa os analistas no sino do portal. A reanálise também avisa o
analista da análise original.

## Pontos em aberto

- O exemplo de jul/2026 usado como critério de aceite traz receita de R$ 60.600 e exposição de R$ 6.800,67, mas
  24 UH − 1 isenta × (R$ 1.840 + R$ 700) dá R$ 58.420. O teste usa um caso fictício coerente com a fórmula (14,31%,
  3,00% + R$ 2,00). Para reproduzir o caso real é preciso a memória de cálculo, anonimizada.
- Uma análise de regressão foi registrada com 3,50% para 22,41%; pela tabela é 3,75%. Confirmar se houve ajuste.
- Taxa extra acima de 40% da ordinária: hoje entra **até** o limite (`extra_acima_limite: 'limitar'`). Se a regra
  for tirar a taxa extra inteira, trocar para `'excluir'`.

## Dados

O repositório é público: testes e exemplos usam só dados fictícios. Os nomes reais (executivos, condomínios) entram
pelo portal e ficam no banco.
