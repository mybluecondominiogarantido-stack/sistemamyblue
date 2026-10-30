# Acessos no Portal MyBlue — referência única

Este é **o** documento de acessos do portal: o README e os manuais apontam para cá. Quem abre cada ferramenta, se edita
ou só consulta e o papel de cada pessoa são decididos **no portal**. O HTML da ferramenta não decide quem entra nem o
que cada um faz: recebe isso pronto do portal.

Tudo isso fica no menu **Configurações** (no pé do menu; aparece para a administração, a coordenação e a supervisão), na seção
**Acessos**: é o único lugar onde se libera e se tira acesso. A coordenação e a supervisão veem as mesmas telas, filtradas
pelos setores delas.

**Para ver tudo o que uma pessoa acessa**: *Configurações → Acessos → Por pessoa* → escolher a pessoa. Mostra perfil,
setores (e onde é líder nos tickets), o que gerencia, marcações, Central de Tickets, cada permissão da Carteira e cada
ferramenta que abre (por quê, se edita ou só consulta e com quais papéis). A administração vê de todos; a coordenação e
a supervisão, das pessoas que gerenciam.

## Onde cada acesso é definido

| O quê | Onde se define | Quem define |
|---|---|---|
| **Perfil** (Administrador, Coordenador, Supervisor, Usuário) | *Configurações → Pessoas* (cadastro da pessoa) | só a administração |
| **Setores** da pessoa (formam a equipe do setor nos tickets e o que coordenação/supervisão gerenciam) | *Configurações → Pessoas* (cadastro); *Configurações → Setores e equipes* | administração; coordenação/supervisão nos setores delas |
| **Líder** do setor nos tickets (distribui) | *Configurações → Setores e equipes* | administração; coordenação/supervisão nos setores delas. Coordenação e supervisão do setor já são líderes |
| **Marcações**: *Supervisão da Central de Tickets* (já vem com Coordenador e Supervisor) e *Marketing — Central de Links* | *Configurações → Acessos → Marcações* | só a administração |
| **Ferramenta**: abre? edita ou só consulta? com qual papel? | *Configurações → Acessos → Ferramentas* (por ferramenta) ou *→ Por pessoa* (só abre ou não; entra editando e sem papel) | administração; coordenação/supervisão do setor dono da ferramenta |
| **Carteira**: quem edita o quê | *Configurações → Acessos → Base de Clientes* | administração; coordenação/supervisão liberam pessoas nas permissões do setor delas |
| **Análise de Crédito**: executivo, analista, diretoria | *Configurações → Acessos → Análise de Crédito* (marca, entre os usuários do portal, quem é executivo, analista — entra no setor **Análise de Crédito** — e diretoria) | administração |
| **Implantação**: comercial, equipe, coordenação, gestor da Análise de Crédito | comercial = executivo da Análise de Crédito; equipe = setor **Implantação**; coordenação = líder, coordenação ou supervisão do setor Implantação; gestor = líder, coordenação ou supervisão do setor Análise de Crédito (*Configurações → Pessoas* e *Configurações → Setores e equipes*) | administração; coordenação/supervisão nos setores delas |
| **Solicitação de Contrato**: comercial, quem elabora, diretoria | comercial = executivo da Análise de Crédito; quem elabora = pessoas marcadas em *Configurações → Acessos → Solicitação de Contrato* (permissão *Elaborar as minutas de contrato*); diretoria = a da Análise de Crédito | administração |
| **Demandas Jurídicas**: quem pede, o Jurídico, diretoria | quem pede = qualquer pessoa do portal; Jurídico = setor **Jurídico** e quem elabora os contratos; diretoria = a da Análise de Crédito | administração (setor e quem elabora); a importação da planilha, também a coordenação/supervisão do Jurídico |
| **Demonstrativos de premiação**: quem lê o de cada pessoa | a própria Gestão de Premiações, ao enviar | quem usa a Gestão de Premiações |

> Atenção: mudar os setores de uma pessoa (em *Pessoas* ou em *Setores e equipes*) muda também a equipe de
> tickets dela e, para coordenação/supervisão, quais ferramentas e pessoas ela gerencia.

## Termos (para não confundir)

| Termo | O que é | Não confundir com |
|---|---|---|
| **Perfil** | Administrador, Coordenador, Supervisor ou Usuário (cadastro da pessoa) | **papel** dentro de uma ferramenta |
| **Papel** | função dentro de uma ferramenta (ex.: Gestão, Financeiro), dado em *Configurações → Acessos → Ferramentas* | perfil do portal |
| **Supervisor** (perfil) | gerencia os setores dele, com os mesmos poderes do coordenador (inclusive a Supervisão da Central de Tickets) | — |
| **Supervisão da Central de Tickets** | vê e direciona os tickets de **todos** os setores; não dá acesso à administração. Vem com os perfis Coordenador e Supervisor (sai junto se o perfil mudar); para usuário comum (ex.: Gerência), é marcada no cadastro | o perfil Supervisor |
| **Coordenação do setor** | coordenadores e supervisores daquele setor | a administração |
| **Líder** | quem distribui os tickets de um setor (marcado em *Configurações → Setores e equipes*; coordenação/supervisão do setor já é líder) | perfil |
| **Gestão** | papel de algumas ferramentas (Comissões, Análise de Espólio) | o menu **Configurações** (telas da administração e da coordenação) |
| **Equipes** (aba da Carteira) | pessoas responsáveis pelos condomínios (analista de cobrança, assistente de crédito…) | **Setores e equipes** (time de tickets de cada setor, em Configurações) |
| **Responsável** | quem está com um ticket | os **responsáveis** de um condomínio na Carteira |
| **Edita / Só consulta** | como a pessoa abre uma ferramenta | as permissões **quem edita** da Carteira |

## O que cada perfil abre e pode administrar

- **Administrador**: abre todas as ferramentas, sempre editando e **com todos os papéis de cada uma** (não precisa ser
  marcado; na janela de acessos aparece "todos os papéis"). Pode mudar tudo. É o único que **aprova ferramenta nova**
  e que **cria os papéis** de uma ferramenta.
- **Coordenador e Supervisor** (mesmos poderes aqui): abrem todas as ferramentas do(s) setor(es) deles, sempre editando,
  inclusive as que aguardam aprovação. Nessas ferramentas podem: enviar HTML novo (veja *HTML novo da coordenação*) e
  voltar a uma versão aprovada; **liberar qualquer pessoa do portal, de qualquer setor**; escolher se ela edita ou só
  consulta; dar o papel dela; e **cadastrar ferramenta nova** no setor (fica aguardando aprovação). Não mexem em
  ferramentas de outros setores e não criam papéis, só distribuem.
  ⚠️ Isso vale também para a **Gestão de Premiações**: a coordenação/supervisão do setor dela abre a ferramenta (e os
  salários) sem precisar ser marcada. Se isso não for desejado, a ferramenta deve ficar num setor sem coordenação.
- **Usuário**: abre só as ferramentas liberadas para ele, do jeito que foi liberado.

## Edita x Só consulta

- **Edita**: usa a ferramenta normalmente.
- **Só consulta**: abre e vê tudo, mas o portal **recusa as gravações** nos dados da equipe. Aparece o selo "Modo consulta".
  - Boletos, Síndicos e Análise de Espólio já **escondem os botões** de edição sozinhos.
  - Nas demais (Renegociações, Pedidos, Prestação de Contas, Patrocínio), os botões continuam na tela: a pessoa pode até
    mudar algo, mas não é salvo e some ao recarregar. Esconder os botões depende de ajustar o HTML de cada uma (contrato abaixo).
  - Na Gestão de Premiações, quem só consulta não envia demonstrativos nem mexe nos pedidos de planilha.
  - Ferramenta com dados **por pessoa** (*Banco do portal · por pessoa*): o que cada um grava é só dele, então o só
    consulta não bloqueia essas gravações.

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
1. A coordenação do Comercial abre *Configurações → Acessos → Ferramentas* e escolhe *Comissões de Novos Condomínios*.
2. Clica em **Todas as pessoas**.
3. Na linha da pessoa: marca **abre**, deixa **edita** e marca o papel **Financeiro**.
4. **Salvar acessos**. Na próxima vez que ela entrar, a ferramenta aparece no menu, com o papel Financeiro.

**"A Diretoria quer acompanhar os pedidos sem alterar nada"**: na ferramenta de Pedidos, marcar **abre** e escolher **só consulta**.

**"O setor quer uma ferramenta nova"**
1. A coordenação clica em **Nova ferramenta**, preenche os dados e envia o HTML.
2. Enquanto aguarda aprovação, só a coordenação do setor e a administração abrem; dá para testar e já deixar marcado quem vai usar.
3. A administração recebe o aviso, confere e clica em **Aprovar**. Só então aparece para as pessoas liberadas.

## As duas visões de Acessos para liberar ferramenta

As duas ficam em *Configurações → Acessos* e gravam a mesma coisa:

- **Ferramentas** (escolhe a ferramenta): o completo, com edita/consulta, papel e pessoas de qualquer setor.
- **Por pessoa** (escolhe a pessoa): marca de uma vez quais ferramentas ela abre (entra editando e sem papel) e mostra
  *Tudo o que acessa*. A coordenação vê ali só as pessoas que gerencia. Mudar por ali não apaga o "só consulta" nem os
  papéis de quem continua liberado.

O cadastro da pessoa (*Configurações → Pessoas*) não libera ferramenta nem marcação: ao criar alguém, o portal leva direto
para *Acessos → Por pessoa*.

## Carteira de condomínios

A tela se chama **Base de Clientes** (antes *Carteira de condomínios*).

**Todos veem a carteira**: quem consulta vê todos os dados dos condomínios (o único download é a *Lista do Marketing*, com permissão própria; o
que aparece na tela pode ser copiado). O resto é permissão configurável em **Configurações → Acessos → Base de Clientes**. Cada permissão tem uma regra: perfis (Coordenação,
Supervisão, Usuário), setores (vazio = qualquer setor) e pessoas liberadas uma a uma. A administração pode tudo, sempre.

| Permissão | Padrão |
|---|---|
| Editar os dados do condomínio (situação, UF, nome, vencimento, administradora, forma de envio, executivo, vigência, razão social, CNPJ, observações) | só a administração |
| Editar e transferir o Analista de cobrança | Coordenação e Supervisão da Cobrança |
| Editar e transferir o Analista extrajudicial (ApoioCob) | só a administração |
| Editar e transferir o Assistente de crédito | Coordenação e Supervisão do Crédito |
| Adicionar condomínios novos pela planilha de implantação | Coordenação e Supervisão de qualquer setor |
| Cadastrar e excluir condomínios, mudar o ID e importar a planilha (cadastrar inclui preencher os dados do condomínio novo) | só a administração |
| Baixar a Lista do Marketing (condomínio, UF, síndico, telefone e e-mail dos ativos, em .xlsx) | Coordenação e Supervisão do Marketing |

- A coordenação e a supervisão liberam pessoas nas permissões do setor delas (ex.: Crédito → Assistente de crédito).
  Perfis e setores de cada regra são da administração.
- Na Carteira, o quadro **Seu acesso** (só para administração, coordenação e supervisão; usuário comum não o vê) mostra o que o portal identificou para quem está vendo (com o motivo) e quem pode
  cada coisa hoje. Na ficha do condomínio, só os campos liberados para a pessoa ficam abertos.

## Análise de Crédito

Tela própria do portal (menu **Análise de Crédito**), não é uma ferramenta em HTML. Quem faz o quê:

| Quem | Como entra | Pode |
|---|---|---|
| **Executivo de negócios** | marcado em *Configurações → Acessos → Análise de Crédito* (com UF, região e boleto próprio) | pedir análise, anexar documentos, responder pendências, ver o retorno das suas e pedir reanálise; não vê as anotações nem o cálculo antes do retorno |
| **Analista** | marcado em *Acessos → Análise de Crédito*, o que o coloca no setor **Análise de Crédito** (diferente do setor Crédito; o nome do setor é parâmetro da política) | ver todas, assumir, lançar dados, calcular, devolver com pendência, enviar à diretoria e liberar o retorno (assinado por ele) |
| **Diretoria** | marcada em *Acessos → Análise de Crédito* (permissão *Chancelar análises de crédito*) | chancelar ou não as análises com inadimplência entre 35% e 40%; ver o histórico |
| **Administração** | perfil | tudo, inclusive pessoas e papéis, executivos sem acesso ao portal e versões da política |

Os avisos (sino e e-mail) vão para o setor Análise de Crédito quando a documentação fica completa, para o executivo
nas pendências e no retorno, e para a diretoria quando há chancela. Detalhes da ferramenta em `docs/credito/LEIAME.md`.

## Implantação

Tela própria do portal (menu **Painel de implantação**), não é uma ferramenta em HTML. Cada função abre na sua tela:
a gestão no Dashboard, a equipe no Painel de atividades (filtrado para a própria pessoa) e o comercial em Minhas
solicitações; a **diretoria** vê as telas da gestão só para consulta. Quem faz o quê:

| Quem | Como entra | Pode |
|---|---|---|
| **Comercial** (executivo de negócios) | o mesmo cadastro de executivo da Análise de Crédito | abrir a implantação a partir dos seus contratos concluídos (ou do contrato assinado fora do portal, com o retorno da análise), preencher o formulário e anexar documentos (inclusive os pendentes, depois do envio; o que já anexou fica com cadeado e não é trocado depois do envio) |
| **Equipe de implantação** | estar no setor **Implantação** | ver a fila e todas as implantações (🔒 nas de outra pessoa); quem foi designada inicia, marca as 5 etapas (o onboarding marcado envia o convite do Outlook), anexa e marca documentos (dizendo de quem vieram), marca impedimento, devolve com pendência, conclui, preenche e envia a ficha de transição, marca o pós-implantação (espólios, pendências, 1ª prestação de contas) e envia a antecipação ao Controle de Repasses. Outra pessoa da equipe só edita com **autorização da coordenação** (pedida ou dada direto), com escopo (tudo, só as etapas, só documentos e ficha) e prazo |
| **Coordenação** | líder do setor Implantação, ou perfil Coordenador/Supervisor no setor | o da equipe em qualquer implantação, mais designar quem conduz, autorizar, recusar e revogar quem edita, cobrar prazos (concluir, ficha, onboarding e pós-implantação), os Parâmetros, liberar versão extra da ficha, cancelar e confirmar a entrada na Carteira |
| **Assistente de crédito** | estar no setor **Crédito** e receber a ficha (da Carteira ou escolhida pela supervisão) | ver a ficha de transição que recebeu, confirmar o recebimento ou devolver com pergunta |
| **Supervisão de Crédito** | líder do setor Crédito, ou perfil Coordenador/Supervisor no setor | escolher a assistente de crédito quando a Carteira ainda não tem (o portal grava na Carteira) |
| **Gestor do Controle de Repasses** | papel **Gestor** na ferramenta *repasses* (*Configurações → Acessos → Ferramentas*) | cadastrar (com ajuste) ou devolver as antecipações vindas da Implantação |
| **Quem elabora contratos** | permissão *Elaborar as minutas de contrato* | registrar as condições do contrato assinado fora do portal (a implantação espera com o Jurídico e depois segue ao setor) |
| **Diretoria** | permissão *Chancelar análises de crédito* | ver todas (a taxa e o boleto do condomínio de entrega são aprovados na Solicitação de Contrato) |
| **Administração** | perfil | tudo |

Detalhes em `docs/implantacao/LEIAME.md`.

## Solicitação de Contrato

Tela própria do portal (menu **Solicitação de Contrato**), não é uma ferramenta em HTML. Quem faz o quê:

| Quem | Como entra | Pode |
|---|---|---|
| **Comercial** (executivo de negócios) | o mesmo cadastro de executivo da Análise de Crédito | pedir o contrato a partir das suas análises liberadas (ou do PDF, ou de condomínio de entrega), anexar a convenção (se a análise não trouxe), pedir ajuste na minuta ou a assinatura (síndico aprovou), ver o controle das suas e, com o contrato concluído, solicitar a implantação |
| **Quem elabora** (Jurídico) | marcado pela administração em *Configurações → Acessos → Solicitação de Contrato* (sem ninguém marcado, a administração recebe) | ver a fila, as assinaturas, o Dashboard Jurídico, todas as solicitações e o controle; assumir e passar para outra pessoa; quem assumiu devolve com pendência e envia a minuta; marcar *Enviado para assinatura* e *Assinado* (com a via assinada); registrar e corrigir as condições fechadas (não solicita a implantação: é o executivo) |
| **Diretoria** | permissão *Chancelar análises de crédito* | decidir os itens que o Manual do Contrato reserva à diretoria antes da minuta; ver o Dashboard Jurídico e o controle |
| **Administração** | perfil | tudo, inclusive escolher quem elabora |

Detalhes em `docs/contratos/LEIAME.md`.

## Demandas Jurídicas

Tela própria do portal (menu **Jurídico → Demandas Jurídicas**), não é uma ferramenta em HTML. Quem faz o quê:

| Quem | Como entra | Pode |
|---|---|---|
| **Quem pede** | qualquer pessoa do portal | abrir uma demanda em nome próprio (com a data de hoje), ver as suas em *Minhas demandas*, comentar e excluir enquanto está pendente |
| **Jurídico** | setor **Jurídico** (*Configurações → Pessoas* ou *Setores e equipes*) ou a permissão *Elaborar as minutas de contrato* | ver todas, os indicadores e a Tabela de prazos; lançar pelos outros (com outra data); mudar situação, entrega, responsável e os dados; editar a Tabela de prazos; excluir |
| **Diretoria** | permissão *Chancelar análises de crédito* | ver todas e os indicadores (só consulta) |
| **Importar a planilha** | administração e coordenação/supervisão do setor Jurídico | importar e desfazer a importação |

Detalhes em `docs/contratos/LEIAME.md` (seção Demandas Jurídicas).

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

A ferramenta também precisa funcionar **isolada** (ferramenta nova já nasce assim): guardar dados pelo portal
(localStorage com *Banco do portal*, ou `claude.use('db')`), falar com o portal só por `fetch`/XHR em `/api/...`
(a ponte acrescenta a chave sozinha), sem IndexedDB, sem Web Worker carregado de um endereço e sem `window.parent`.

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

**O servidor confere os papéis** nessas duas ferramentas: o registro de papéis fica nos dados da própria ferramenta,
que qualquer pessoa que edita consegue gravar. Por isso, mudar os papéis de alguém (inclusive os próprios) pela aba
Acessos da ferramenta só vale para a administração, a coordenação/supervisão do setor e quem já tem o papel **Gestão**.
Para as demais pessoas, a gravação é recusada e a ferramenta mostra o aviso (o resto do registro grava normalmente).

O reconhecimento fica em `server/acessos.js` (`MODELOS`). Quando essas ferramentas forem refeitas seguindo
o contrato acima, o modelo deixa de ser reconhecido e os papéis passam a ser os cadastrados no portal.

## Ferramentas isoladas

O HTML de uma ferramenta é um programa. Sem isolamento, ele roda **com a sessão de quem o abre**: um HTML com erro ou
mal-intencionado aberto pela administração poderia criar usuários, baixar o backup ou mexer em outras ferramentas.
Com **Isolar esta ferramenta** (janela da ferramenta, só a administração), o navegador põe a ferramenta numa origem
própria (sandbox), sem o cookie do portal. Ela continua lendo e gravando **os próprios dados**, pela chave dela, e
alcança só o que precisa: a carteira (consulta), abrir ticket com anexo, fotos, bibliotecas e, se for de premiação, as
rotas da comissão. Nada de administração, de outras ferramentas ou dos tickets dos outros.

- **Ferramenta nova já nasce isolada.** Ferramenta aguardando aprovação e prévia de versão nova abrem sempre isoladas.
- As que já estavam em uso continuam como estavam até a administração ligar. **Antes de ligar, abra e teste**:
  - o que a ferramenta guarda *só no navegador* (localStorage, sessionStorage) passa a valer só enquanto a página está
    aberta: use *Banco do portal · por pessoa* ou *equipe* se ela precisa lembrar algo;
  - IndexedDB, Web Worker carregado de um endereço e acesso à página do portal (`window.parent`) não funcionam isolados;
  - o resto (fetch/XHR para `/api/...`, bibliotecas das CDNs, imprimir, baixar arquivo, abrir em nova aba, área de
    transferência) funciona.
- Pelo que os HTMLs em uso usam hoje (outubro/2026): **Síndicos** usa IndexedDB (teste com cuidado ou ajuste o HTML
  antes de isolar) e **Prestação de Contas** lê PDF com o Web Worker do pdf.js (isolada, o pdf.js usa a alternativa sem
  Worker, mais lenta: teste a leitura de PDF). As demais devem funcionar isoladas, mas teste cada uma.
- A lista de *Configurações → Ferramentas* marca **não isolada** as que ainda rodam com a sessão de quem abre.
- **Controle de Repasses** (slug `repasses`) alcança também as antecipações vindas da Implantação:
  `GET /api/repasses/antecipacoes`, `POST /api/repasses/antecipacoes/:id/cadastrar` e `.../devolver`. Ler pede só abrir
  a ferramenta; cadastrar e devolver, o papel **Gestor** (`gestor` ou `gestao`), sem *só consulta*.

## HTML novo da coordenação

- Em ferramenta **isolada**, o HTML enviado pela coordenação/supervisão entra em uso na hora.
- Em ferramenta **não isolada**, ele fica guardado e **aguarda a aprovação da administração** (aviso no sino e por
  e-mail); a versão atual continua em uso. Na janela da ferramenta aparecem **Ver prévia** (sempre isolada, com os
  dados reais), **Aprovar e usar** e **Recusar** (a versão é apagada e quem enviou é avisado).
- A coordenação só volta a versões já aprovadas.

## Mapa das ferramentas (outubro/2026)

| Ferramenta | Setor | Abas | Acesso que precisa | Observação |
|---|---|---|---|---|
| Comissões de Novos Condomínios | Comercial | Comercial, Aprovação da gestão, Financeiro, Acessos | papéis Executivo comercial, Gestão, Financeiro | papéis agora pelo portal (espelhados na aba Acessos) |
| PartnerChip — Resultados | Comercial | Visão geral, Parceiros, Condomínios | abre (é só leitura por natureza) | — |
| Análise de Espólio | Cobrança | Dashboard, Fila de acompanhamento, Minhas solicitações, Configurações, Acessos | papéis Gestão, Implantação, Solicitante avulso | papéis agora pelo portal; enquanto ninguém tiver Gestão, todos veem todas as abas |
| Central de Ferramentas — Cobrança / Gestão | Cobrança | calculadoras | abre | dados só no navegador de cada pessoa |
| Central de Ferramentas — Crédito | Crédito | Balancetes, Consumos, Divisor, Gerador, Montador, Moradores, Nobre | abre | dados só no navegador de cada pessoa |
| Controle de Emissão de Boletos | Crédito | Painel, Comparativo, Controle, Cadastro, Distratados, Feriados, Histórico | edita ou só consulta | já respeita o "só consulta" na tela; os condomínios vêm da Carteira (conferência na janela da ferramenta, pela coordenação do Crédito) |
| Controle de Renegociações e Tickets | CS | Dashboard, Central de dados, Nova Renegociação, Relatório mensal, Tickets | edita ou só consulta | — |
| Prestação de Contas — Comissão de Parceiros | Parceiros | Lançamento, Prestações do mês, Parceiros, Condomínios | edita ou só consulta | alimenta o PartnerChip e as Comissões |
| Controle de Pedidos — Suprimentos | Suprimentos | Geral, Janelas, Mensal | edita ou só consulta | — |
| Central de Patrocínio | Administrativa/Financeira | Novo, Recibos, Resultados | edita ou só consulta | — |
| Gestão de Premiações | Administrativa/Financeira | Pessoas e salários, Parâmetros, Importar | edita (restrita: salários) | "líder" e "coordenador" nela são de quem recebe demonstrativo, não de acesso |
| Gestão de Viagens | Administrativa/Financeira | Viagens, Dashboard de gastos, Configurações | edita ou só consulta; **papel de aprovação a criar** | hoje quem abre pode aprovar ou reprovar viagens; na próxima versão do HTML, usar `pode('aprovacao')` |
