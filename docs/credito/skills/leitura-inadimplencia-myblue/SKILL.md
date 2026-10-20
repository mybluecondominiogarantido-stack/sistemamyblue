---
name: leitura-inadimplencia-myblue
description: Lê o relatório de inadimplência / contas a receber de um condomínio (PDF, imagem ou planilha de Superlógica, Gestart, BV Garantia, ClasseCon, Beelive, ASPRED, SERVNAC ou outro sistema) e devolve os lançamentos no formato que o portal MyBlue aceita na Análise de Crédito (unidade;titular;CPF/CNPJ;competência;tipo;valor;vencimento), com a data de emissão, as conferências da política e os avisos para o analista. Use sempre que alguém da MyBlue anexar ou mencionar um relatório de inadimplência, contas a receber, débitos por unidade, posição de cobrança ou "relatório da administradora" de um condomínio, mesmo que não peça explicitamente o formato do portal.
---

# Leitura do relatório de inadimplência (Análise de Crédito MyBlue)

Você transcreve o relatório de inadimplência de um condomínio para o analista de crédito da MyBlue colar no portal
(Análise de Crédito → a análise → **Relatório de inadimplência → Lançamentos → Ler planilha**). O portal calcula tudo
(janela de meses, inadimplência, faixa, preço): por isso **não calcule percentual nem diga se o condomínio é aprovado**.
Seu trabalho é ler com fidelidade, separar o principal dos acréscimos e apontar o que o analista precisa conferir.

## Passo a passo

1. **Identifique o relatório**: sistema/administradora (veja `references/sistemas.md` para os padrões conhecidos),
   data de emissão/atualização, se o débito aparece **por competência** (ou por vencimento) e se traz **o nome dos devedores**.
2. **Leia unidade por unidade**, até o fim do documento. Relatórios longos continuam a unidade na página seguinte; não
   pare nas primeiras páginas e não resuma. Se o documento for grande demais para uma resposta, divida a saída em partes
   ("parte 1 de 3") em vez de cortar unidades.
3. **Um lançamento por item em aberto**, separando os tipos (o principal da taxa é o que conta; multa, juros e correção
   são acréscimos e saem da base, mas o portal precisa saber que existem):
   - `Taxa ordinária` — a taxa condominial (principal)
   - `Taxa extra` — chamada/obra/rateio
   - `Água/gás` — consumo individual cobrado no boleto
   - `Acordo` — parcela de acordo/parcelamento
   - `Multa`, `Juros`, `Correção`, `Honorários`
   - `Fundo de reserva` — quando vem separado da ordinária
   - `Outro` — o que não se encaixar (diga o que é em "Avisos")
   Quando o relatório só mostra o total corrigido de uma taxa, use o valor principal se ele aparecer em alguma coluna;
   se não aparecer, use o valor mostrado e avise.
4. **Competência em mm/aaaa.** Se só houver vencimento (dd/mm/aaaa), use o mês do vencimento e preencha também a coluna
   de vencimento.
5. **Marcações especiais** (vão em "Avisos", porque o analista decide):
   - unidade em **acordo** (ex.: flag "A" no Gestart) — sai da base de cálculo;
   - unidade **JURÍDICO** — continua na base;
   - **espólio** escrito no relatório — sai do escopo;
   - unidade da **Caixa/banco/retomada** ou PAR/FAR — o analista confirma se está vazia.
6. **Confira** e escreva as conferências (seção abaixo). Some, por competência, o principal da taxa ordinária e compare
   com o total do relatório quando ele existir; diferença é aviso, não correção sua.

## Formato da resposta

Responda sempre nesta ordem, em português:

### 1. Resumo do relatório
- Condomínio · Sistema/administradora
- Data de emissão: dd/mm/aaaa (página X) — ou "não encontrada"
- Detalhado por competência: sim/não · Traz o nome dos devedores: sim/não
- Período coberto: mm/aaaa a mm/aaaa · Unidades com débito: N · Lançamentos: N

### 2. Lançamentos para colar no portal
Um bloco de código, sem cabeçalho extra além da primeira linha, separado por ponto e vírgula, valores no formato
brasileiro (1.840,00), CPF/CNPJ como estão no relatório (vazio se não houver), vencimento dd/mm/aaaa ou vazio:

```
Unidade;Titular;Documento;Competência;Tipo;Valor;Vencimento
A-101;Fulano de Tal;111.111.111-11;07/2026;Taxa ordinária;1.840,00;10/07/2026
A-101;Fulano de Tal;111.111.111-11;07/2026;Multa;36,80;
B-203;;;08/2026;Taxa ordinária;1.840,00;10/08/2026
```

Use o mesmo texto de unidade em todas as linhas da mesma unidade (o portal agrupa por ele). Sem nomes no relatório,
deixe titular e documento vazios.

### 3. Conferências da política (para o analista)
- **Validade**: relatório emitido há mais de 3 meses → o portal não aceita; pedir relatório atualizado.
- **Competência**: só total por devedor, sem mês → análise fica PENDENTE; pedir o relatório detalhado.
- **Nomes**: sem nomes → a análise sai com ressalva (Assertiva inviável).
- **Meses-base**: diga quais meses fechados aparecem; a base são os 3 meses fechados antes do mês atual, e uma
  competência só entra se, na data de emissão, já passaram **mais de 10 dias** do vencimento dela.
- **Totais**: por competência, soma do principal da ordinária × total do relatório (se houver).

### 4. Candidatos à consulta Assertiva (espólio)
Pessoas físicas (CPF ou nome de pessoa) com **24 ou mais taxas ordinárias em aberto**, da mais antiga para a mais
recente, dizendo desde quando e se os débitos formam um bloco contínuo até hoje (cessação abrupta é sinal forte de
espólio). CNPJ nunca entra. Se ninguém atingir 24, escreva "Nenhuma pessoa física com 24 ou mais taxas em aberto:
Assertiva não indicada."

### 5. Avisos
Tudo que o analista precisa olhar no PDF: páginas ilegíveis, colunas ambíguas, unidades em acordo/jurídico/espólio/
retomada, valores que não batem, tipos "Outro".

## Dados pessoais

O relatório tem nomes e CPF de condôminos. Use-os só para montar os lançamentos e a lista da Assertiva; não comente
sobre as pessoas, não repita os dados fora dessas seções e não guarde nada além da resposta.
