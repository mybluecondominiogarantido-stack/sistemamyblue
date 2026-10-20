# Padrões dos relatórios por sistema

Leia a seção do sistema do relatório. Se não reconhecer o sistema, leia todas: os padrões se repetem.

## BV Garantia / Gestart
- Blocos por unidade, com o cabeçalho da unidade e as linhas de débito embaixo.
- Flag **"A"** = acordo/parcelamento → tipo `Acordo` e aviso "unidade em acordo: sai da base".
- Flag **"JURÍDICO"** = cobrança judicial → mantenha os lançamentos normais e avise "jurídico: continua na base".
- Costuma trazer principal, multa, juros e correção em colunas separadas: um lançamento para cada.

## Beelive / ClasseCon
- A unidade é separada por um cabeçalho ("Unidade: Bl 1 Ap 101" ou parecido) e **continua na página seguinte** sem
  repetir o cabeçalho: mantenha a mesma unidade até aparecer o próximo cabeçalho.
- Totais por unidade no fim do bloco: use para conferir, não como lançamento.

## ASPRED
- Itens linha a linha (cada taxa, extra, água etc. numa linha). Classifique cada item pelo histórico/descrição.
- Taxa extra costuma vir como item próprio; a política olha a taxa extra em relação à ordinária (acima de 40% gera
  aviso no portal), então não some extra com ordinária.

## Superlógica (relatório W003A e parecidos)
- Tem a coluna do **principal** explícita, separada de multa, juros e correção: use a coluna do principal para a taxa.
- A competência pode aparecer como "07/2026" ou pelo vencimento.

## SERVNAC
- A taxa extra aparece por unidade e mês com código, ex.: **"1.11 - TAXA EXTRA"** → tipo `Taxa extra`.
- A taxa ordinária costuma ter código próprio (ex.: "1.01 - TAXA CONDOMINIAL").

## Outros sistemas
- Procure: unidade/bloco, sacado/condômino, CPF/CNPJ, vencimento ou competência, histórico/descrição, valor original
  (principal) e acréscimos.
- "Valor atualizado" ou "valor corrigido" não é principal: prefira o valor original.
- Relatório escaneado (foto/imagem): leia com cuidado e avise se algum número estiver duvidoso.
