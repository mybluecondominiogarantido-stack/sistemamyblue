# Acessos às ferramentas do Portal MyBlue

Os acessos são decididos **no portal**, num lugar só: a janela de cada ferramenta, em
**Administração → Módulos e dados** ou **Gestão do setor → Ferramentas do setor**, seção
**Quem abre e com qual papel**. O HTML da ferramenta não decide quem entra nem o que cada um faz:
ele recebe isso pronto do portal.

## São três coisas diferentes

| Pergunta | Onde se define | Quem define |
|---|---|---|
| **1. Qual o perfil da pessoa no portal?** (Administrador, Coordenador, Supervisor, Usuário) | cadastro da pessoa | só a administração |
| **2. A pessoa abre esta ferramenta? Edita ou só consulta?** | janela da ferramenta → *Quem abre e com qual papel* | administração; coordenação/supervisão do setor dono da ferramenta |
| **3. O que ela faz dentro da ferramenta?** (papel: Gestão, Financeiro…) | mesma janela, colunas de papéis | os mesmos do item 2 |

## O que cada perfil abre e pode administrar

- **Administrador**: abre todas as ferramentas, sempre editando e **com todos os papéis de cada uma** (não precisa ser
  marcado; na janela de acessos aparece "todos os papéis"). Pode mudar tudo. É o único que **aprova ferramenta nova**
  e que **cria os papéis** de uma ferramenta.
- **Coordenador e Supervisor** (mesmos poderes aqui): abrem todas as ferramentas do(s) setor(es) deles, sempre editando,
  inclusive as que aguardam aprovação. Nessas ferramentas podem: enviar HTML novo e voltar versão; **liberar qualquer
  pessoa do portal, de qualquer setor**; escolher se ela edita ou só consulta; dar o papel dela; e **cadastrar ferramenta
  nova** no setor (fica aguardando aprovação). Não mexem em ferramentas de outros setores e não criam papéis, só distribuem.
- **Usuário**: abre só as ferramentas liberadas para ele, do jeito que foi liberado.

## Edita x Só consulta

- **Edita**: usa a ferramenta normalmente.
- **Só consulta**: abre e vê tudo, mas o portal **não grava nada** do que a pessoa fizer. Aparece o selo "Modo consulta".
  - Boletos, Síndicos e Análise de Espólio já **escondem os botões** de edição sozinhos.
  - Nas demais (Renegociações, Pedidos, Prestação de Contas, Patrocínio), os botões continuam na tela: a pessoa pode até
    mudar algo, mas não é salvo e some ao recarregar. Esconder os botões depende de ajustar o HTML de cada uma (contrato abaixo).

## Papéis

Papel só existe quando a ferramenta separa funções. **Hoje só duas têm papéis**; nas outras, quem abre faz tudo o que
ela oferece.

**Comissões de Novos Condomínios**
- *Executivo comercial*: responde, na aba Comercial, pelos condomínios dele (parceiro e tipo de comissão).
- *Gestão*: aprova ou devolve essas respostas.
- *Financeiro*: cadastra na Prestação de Contas o que foi aprovado.
- ⚠️ **Enquanto ninguém tiver o papel Gestão, todos veem todas as abas.** A separação só passa a valer quando alguém recebe Gestão.

**Análise de Espólio** (os papéis são lidos do HTML em uso; na versão de 16/10: Gestão, Implantação e Solicitante avulso)
- *Gestão*: recebe as solicitações, faz as análises e configura a ferramenta.
- *Implantação*: pede análises dos condomínios implantados (vê o quadro de verificação) e acompanha as dele.
- *Solicitante avulso*: pede análises avulsas e acompanha as dele.
- ⚠️ **Quem abre sem papel não usa nada**: vê o aviso para pedir acesso — vale também para a coordenação (a administração tem todos os papéis).
  Exceção: enquanto ninguém tiver Gestão, todos veem todas as abas.

A **administração tem todos os papéis** em todas as ferramentas, sem marcar nada. Nas ferramentas com aba Acessos própria,
isso vale só na tela da própria administração: o portal não grava esse papel, então ela não conta como "alguém com Gestão"
para as outras pessoas. A **coordenação** abre sem precisar ser marcada, mas **papel precisa ser dado a ela**
(ex.: o coordenador que aprova as comissões precisa receber Gestão).

## Exemplos

**"A pessoa do Financeiro precisa cadastrar as comissões aprovadas"**
1. A coordenação do Comercial abre *Ferramentas do setor → Comissões de Novos Condomínios*.
2. Em *Quem abre e com qual papel*, clica em **Todas as pessoas**.
3. Na linha da pessoa: marca **abre**, deixa **edita** e marca o papel **Financeiro**.
4. **Salvar acessos**. Na próxima vez que ela entrar, a ferramenta aparece no menu, com o papel Financeiro.

**"A Diretoria quer acompanhar os pedidos sem alterar nada"**: na ferramenta de Pedidos, marcar **abre** e escolher **só consulta**.

**"O setor quer uma ferramenta nova"**
1. A coordenação clica em **Nova ferramenta**, preenche os dados e envia o HTML.
2. Enquanto aguarda aprovação, só a coordenação do setor e a administração abrem; dá para testar e já deixar marcado quem vai usar.
3. A administração recebe o aviso, confere e clica em **Aprovar**. Só então aparece para as pessoas liberadas.

## Os dois lugares onde se libera ferramenta

- **Janela da ferramenta** (*Quem abre e com qual papel*): o completo, com edita/consulta, papel e pessoas de qualquer setor.
- **Cadastro da pessoa** (*Usuários do setor*): continua funcionando, mas só marca se a pessoa abre ou não (ela entra
  editando e sem papel), e a coordenação só vê ali as pessoas do próprio setor. Mudar por ali não apaga o "só consulta"
  nem os papéis de quem continua liberado.

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
| Análise de Espólio | os do `const PAPEIS` do HTML (hoje Gestão, Implantação, Solicitante avulso) | banco de documentos, `perfis/mb-<id>` (o nome na carteira continua na aba da ferramenta) |

O reconhecimento fica em `server/acessos.js` (`MODELOS`). Quando essas ferramentas forem refeitas seguindo
o contrato acima, o modelo deixa de ser reconhecido e os papéis passam a ser os cadastrados no portal.

## Mapa das ferramentas (outubro/2026)

| Ferramenta | Setor | Abas | Acesso que precisa | Observação |
|---|---|---|---|---|
| Comissões de Novos Condomínios | Comercial | Comercial, Aprovação da gestão, Financeiro, Acessos | papéis Executivo comercial, Gestão, Financeiro | papéis agora pelo portal (espelhados na aba Acessos) |
| PartnerChip — Resultados | Comercial | Visão geral, Parceiros, Condomínios | abre (é só leitura por natureza) | — |
| Análise de Espólio | Cobrança | Dashboard, Fila de acompanhamento, Minhas solicitações, Configurações, Acessos | papéis Gestão, Implantação, Solicitante avulso | papéis agora pelo portal; enquanto ninguém tiver Gestão, todos veem todas as abas |
| Central de Ferramentas — Cobrança / Gestão | Cobrança | calculadoras | abre | dados só no navegador de cada pessoa |
| Central de Ferramentas — Crédito | Crédito | Balancetes, Consumos, Divisor, Gerador, Montador, Moradores, Nobre | abre | dados só no navegador de cada pessoa |
| Controle de Emissão de Boletos | Crédito | Painel, Comparativo, Controle, Cadastro, Distratados, Feriados, Histórico | edita ou só consulta | já respeita o "só consulta" na tela |
| Controle de Síndicos | Crédito | Resumo, Base, Histórico, Ignorar, Marketing, Cópia de segurança | edita ou só consulta | já respeita o "só consulta" na tela |
| Controle de Renegociações e Tickets | CS | Dashboard, Central de dados, Nova Renegociação, Relatório mensal, Tickets | edita ou só consulta | — |
| Prestação de Contas — Comissão de Parceiros | Parceiros | Lançamento, Prestações do mês, Parceiros, Condomínios | edita ou só consulta | alimenta o PartnerChip e as Comissões |
| Controle de Pedidos — Suprimentos | Suprimentos | Geral, Janelas, Mensal | edita ou só consulta | — |
| Central de Patrocínio | Administrativa/Financeira | Novo, Recibos, Resultados | edita ou só consulta | — |
| Gestão de Premiações | Administrativa/Financeira | Pessoas e salários, Parâmetros, Importar | edita (restrita: salários) | "líder" e "coordenador" nela são de quem recebe demonstrativo, não de acesso |
| Gestão de Viagens | Administrativa/Financeira | Viagens, Dashboard de gastos, Configurações | edita ou só consulta; **papel de aprovação a criar** | hoje quem abre pode aprovar ou reprovar viagens; na próxima versão do HTML, usar `pode('aprovacao')` |
