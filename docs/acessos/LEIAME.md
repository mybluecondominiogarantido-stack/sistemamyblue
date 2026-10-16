# Acessos às ferramentas do Portal MyBlue

Os acessos são decididos **no portal**, num lugar só: a janela de cada ferramenta, em
**Administração → Módulos e dados** ou **Gestão do setor → Ferramentas do setor**, seção
**Quem abre e com qual papel**. O HTML da ferramenta não decide quem entra nem o que cada um faz:
ele recebe isso pronto do portal.

## O que o portal guarda para cada ferramenta

| O quê | Onde se define | Quem define |
|---|---|---|
| **Quem abre** | marcar "abre" na pessoa (de qualquer setor) | administração (todas as ferramentas); coordenação e supervisão (as dos setores delas) |
| **Edita ou só consulta** | "Como" na mesma linha | os mesmos acima |
| **Papel dentro da ferramenta** (ex.: Gestão, Financeiro) | colunas de papéis na mesma linha | os mesmos acima |
| **Quais papéis a ferramenta tem** | "Papéis desta ferramenta" | só a administração (os papéis acompanham o que o HTML faz) |

- Administração abre todas as ferramentas; coordenação e supervisão abrem todas as do setor delas,
  sempre editando. As duas também podem receber papéis.
- **Só consulta**: a pessoa abre e vê tudo, mas o servidor recusa as gravações. A ferramenta mostra o selo
  "Modo consulta". As ferramentas feitas como artefato do Claude (`claude.use('user').can('data.write')`)
  já escondem os botões de edição sozinhas.
- **Ferramenta nova cadastrada pela coordenação** fica **aguardando aprovação**: só a coordenação do setor
  e a administração abrem. A administração recebe o aviso, confere o HTML e clica em **Aprovar**. Só então
  as pessoas liberadas passam a ver a ferramenta.
- Mudar as ferramentas de uma pessoa pela tela de usuários não apaga o "só consulta" nem os papéis de quem
  continua liberado.

## Contrato para o HTML das ferramentas

Ao gerar ou atualizar o HTML de uma ferramenta, **não crie aba de acessos nem lista de nomes**. Leia do portal:

```js
const P = window.__MYBLUE__ || {};
const eu = P.usuario || {};              // { id, nome, email, admin, papeis: ['gestao', ...], somente_leitura }
const papeisDaFerramenta = P.papeis || []; // [{ id, nome }] — os definidos no portal para esta ferramenta
const pode = (papel) => (eu.papeis || []).includes(papel);
if (eu.somente_leitura) { /* esconder botões de gravar */ }
if (pode('gestao')) { /* mostrar a aba de aprovação */ }
```

Ferramentas feitas como artefato do Claude podem usar o mesmo pelo `user`:
`await (await claude.use('user')).can('papel:gestao')` e `can('data.write')`.

Fora do portal (abrindo o arquivo direto), `window.__MYBLUE__` não existe: a ferramenta deve funcionar
com tudo liberado, como já fazem as atuais.

Depois de publicar um HTML que usa papéis novos, a administração cadastra os papéis da ferramenta
(identificador igual ao usado no HTML) e a coordenação distribui às pessoas.

## Ferramentas que já tinham aba "Acessos" própria

Duas ferramentas guardavam os papéis nelas mesmas. O portal reconhece o HTML e passa a ler e gravar os papéis
**no formato de cada uma**, sem mudar o HTML: o que se marca no portal aparece na aba Acessos da ferramenta
e o contrário também.

| Ferramenta | Papéis | Onde a ferramenta guarda |
|---|---|---|
| Comissões de Novos Condomínios | Executivo comercial, Gestão, Financeiro | armazenamento da equipe, chave `cnp:p:<id>` (o vínculo com o nome na carteira continua sendo feito na aba da ferramenta) |
| Análise de Espólio | Gestão, Solicitante | banco de documentos, `perfis/mb-<id>` (o nome na carteira continua na aba da ferramenta) |

O reconhecimento fica em `server/acessos.js` (`MODELOS`). Quando essas ferramentas forem refeitas seguindo
o contrato acima, o modelo deixa de ser reconhecido e os papéis passam a ser os cadastrados no portal.

## Mapa das ferramentas (outubro/2026)

| Ferramenta | Setor | Abas | Acesso que precisa | Observação |
|---|---|---|---|---|
| Comissões de Novos Condomínios | Comercial | Comercial, Aprovação da gestão, Financeiro, Acessos | papéis Executivo comercial, Gestão, Financeiro | papéis agora pelo portal (espelhados na aba Acessos) |
| PartnerChip — Resultados | Comercial | Visão geral, Parceiros, Condomínios | abre (é só leitura por natureza) | — |
| Análise de Espólio | Cobrança | Dashboard, Fila de acompanhamento, Minhas solicitações, Configurações, Acessos | papéis Gestão, Solicitante | papéis agora pelo portal; o HTML ainda tem nomes fixos de gestão para quando ninguém tem o papel |
| Central de Ferramentas — Cobrança / Gestão | Cobrança | calculadoras | abre | dados só no navegador de cada pessoa |
| Central de Ferramentas — Crédito | Crédito | Balancetes, Consumos, Divisor, Gerador, Montador, Moradores, Nobre | abre | dados só no navegador de cada pessoa |
| Controle de Emissão de Boletos | Crédito | Painel, Controle, Cadastro, Comparativo, Feriados, Histórico | edita ou só consulta | já respeita o "só consulta" na tela |
| Controle de Síndicos | Crédito | Resumo, Base, Histórico, Ignorar, Marketing, Cópia de segurança | edita ou só consulta | já respeita o "só consulta" na tela |
| Controle de Renegociações e Tickets | CS | Dashboard, Central de dados, Nova Renegociação, Relatório mensal, Tickets | edita ou só consulta | — |
| Prestação de Contas — Comissão de Parceiros | Parceiros | Lançamento, Prestações do mês, Parceiros, Condomínios | edita ou só consulta | alimenta o PartnerChip e as Comissões |
| Controle de Pedidos — Suprimentos | Suprimentos | Geral, Janelas, Mensal | edita ou só consulta | — |
| Central de Patrocínio | Administrativa/Financeira | Novo, Recibos, Resultados | edita ou só consulta | — |
| Gestão de Premiações | Administrativa/Financeira | Pessoas e salários, Parâmetros, Importar | edita (restrita: salários) | "líder" e "coordenador" nela são de quem recebe demonstrativo, não de acesso |
| Gestão de Viagens | Administrativa/Financeira | Viagens, Dashboard de gastos, Configurações | edita ou só consulta; **papel de aprovação a criar** | hoje quem abre pode aprovar ou reprovar viagens; na próxima versão do HTML, usar `pode('aprovacao')` |
