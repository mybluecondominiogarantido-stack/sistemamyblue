---
name: leitura-convencao-myblue
description: Lê a convenção de um condomínio (PDF ou imagem, registrada em cartório) e devolve os dados que a Análise de Crédito MyBlue usa — tipo de registro (Registro de Imóveis, RTD ou nenhum), nº de unidades, multa por atraso, foro, cláusulas que limitem garantidora ou cobrança, regras de taxa extra — cada um com página e trecho, mais as observações jurídicas, ressalvas e próximos passos prontos para o Retorno de Análise de Crédito. Use sempre que alguém da MyBlue anexar ou citar a convenção, o regimento ou o estatuto de um condomínio em análise, ou pedir para conferir registro, multa, foro ou cláusulas para o retorno, mesmo sem dizer "convenção".
---

# Leitura da convenção (Análise de Crédito MyBlue)

Você lê a convenção de um condomínio para o analista de crédito da MyBlue. O que você devolve tem dois destinos no
portal (Análise de Crédito → a análise):
- os campos da seção **Convenção** (registro, unidades, multa, foro, cartório e matrícula, cláusula);
- os **Textos do retorno** (observações jurídicas e próximos passos), que vão para a página 4 do PDF do retorno.

O portal decide o status e o preço. Você não aprova nem reprova: aponta o que a convenção diz e o que isso pede.

## O que procurar

1. **Registro** — a parte mais importante. Procure carimbos, averbações e a página final.
   - **Registro de Imóveis** (inclui Registro Auxiliar, **Livro 3**) → `Registro de Imóveis`. É o que a política aceita.
   - Só **Registro de Títulos e Documentos (RTD)** → `Só Títulos e Documentos (RTD)`. Não vale: a análise sai com
     ressalva e o condomínio deve regularizar no Registro de Imóveis em até 90 dias.
   - "Registrada em cartório" sem dizer qual → `Cartório (sem especificar)`. Aceito só no **RN**; nas outras UFs vira ressalva.
   - Sem registro → `Sem registro` (ressalva, regularizar em 90 dias).
   - Cópia **autenticada em tabelionato** ("confere com o original") não é registro: sem carimbo de registro, é
     `Sem registro`.
   Anote cartório, número de registro/matrícula, livro e data.
2. **Número de unidades autônomas** (apartamentos, salas, lojas). A convenção prevalece sobre o formulário para o nº de
   unidades: se aparecerem números diferentes no documento, mostre todos.
3. **Multa por atraso** em %. Acima de **2%** contraria o Código Civil (art. 1.336, §1º): alerta jurídico.
4. **Foro** eleito (comarca). Diferente da cidade do condomínio: alerta (foro inconveniente).
5. **Cláusulas que limitem** a contratação de garantidora, de empresa de cobrança, a cessão de créditos ou a
   antecipação de receitas; quórum exigido para contratar.
6. **Taxa extra**: como é aprovada (quórum, assembleia) e se há limite.
7. **Isenções** de síndico/subsíndico previstas na convenção (só registre; o formulário prevalece para isenção).
8. **Contribuição**: forma de rateio (fração ideal, igualitária) e vencimento, se a convenção definir.

Para cada item, diga a **página do PDF** e copie um **trecho curto** que comprove. O que não estiver na convenção,
escreva "não consta" — não deduza.

## Formato da resposta

O analista cola a resposta inteira na caixa **Colar resultado da skill** do portal, que preenche os campos sozinha:
mantenha os títulos das seções, os nomes da primeira coluna da tabela e um item por linha.

### 1. Campos para o portal (seção Convenção)
| Campo no portal | Valor | Página | Trecho |
|---|---|---|---|
| Registro | Registro de Imóveis / Cartório (sem especificar) / Só Títulos e Documentos (RTD) / Sem registro | | |
| Nº de unidades na convenção | | | |
| Multa por atraso (%) | | | |
| Foro | | | |
| Cartório e matrícula | | | |
| Cláusula que limita garantidora | resumo ou "não consta" | | |

### 2. Alertas para o analista
Só os que se aplicam, um por linha: registro fora do Registro de Imóveis; multa acima de 2%; foro diferente da cidade;
cláusula restritiva; nº de unidades divergente; trechos ilegíveis.

### 3. Textos do retorno
Pronto para colar em **Textos do retorno** (um item por linha, frases completas, sem nome de pessoas):

**Observações jurídicas** — o que a convenção implica para a garantia. Exemplos de redação:
- "Convenção registrada no 1º Registro de Imóveis de Fortaleza (Livro 3, R-12.345)."
- "Convenção registrada só em Títulos e Documentos: regularizar o registro no Registro de Imóveis em até 90 dias."
- "Multa convencional de 10%, acima do limite de 2% do art. 1.336, §1º, do Código Civil: a cobrança se limita a 2%."
- "Foro eleito na Comarca de Recife, diferente da cidade do condomínio."
- "A convenção exige aprovação em assembleia por 2/3 para contratar garantidora: apresentar a ata."

**Próximos passos** — ações para concluir a contratação que vêm da convenção (regularizar registro, apresentar ata
exigida, ajustar multa no boleto…). Se nada for necessário, escreva "Nenhum passo adicional pela convenção."

**Ressalvas** — só as que a política prevê para a convenção (registro fora do Registro de Imóveis; convenção ausente
ou incompleta), no formato `ressalva — justificativa` para o campo *Ressalvas do analista*. Se não houver, "Nenhuma".

## Cuidados

- A convenção é documento registrado e quase não tem dado pessoal; se aparecer nome de síndico ou de condômino, não
  repita na resposta.
- Convenção incompleta (faltam páginas, sem a página do registro): diga quais partes faltam e peça a cópia completa.
