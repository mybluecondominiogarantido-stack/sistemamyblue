# Portal MyBlue

Sistema que reúne as centrais de ferramentas da MyBlue em um único endereço, com **login de usuários**, **permissões por ferramenta**, **banco de dados** e **histórico de atividades**.

As ferramentas que já existem (os arquivos HTML de cada setor) continuam funcionando como hoje. O portal entrega cada uma depois do login e, quando o administrador quiser, passa a guardar os dados delas no banco da empresa em vez do navegador ou da planilha Google.

| Setor | Ferramenta | Dados hoje | Dados no portal |
|---|---|---|---|
| Crédito | Central de Ferramentas — Crédito | não guarda | não precisa |
| Cobrança | Central de Ferramentas — Cobrança / Gestão | não guarda | não precisa |
| Sucesso do Cliente | Controle de Renegociações e Tickets | planilha Google | planilha interna do portal |
| Suprimentos | Controle de Pedidos | planilha Google | planilha interna do portal |
| Parceiros | Prestação de Contas — Comissão de Parceiros | planilha Google | planilha interna do portal |

---

## Como funciona

```
Navegador ──► /login ──► Portal (menu por setor, busca, início)
                              │
                              ├── /m/<ferramenta>/  ← o HTML original, entregue só para quem tem acesso
                              │       ├── ponte de armazenamento: o localStorage da ferramenta vai para o banco
                              │       └── planilha interna: substitui o Google Apps Script, mesmo protocolo
                              │
                              └── Administração: usuários, módulos (HTMLs e versões), dados, histórico, backup
                                                          │
                                                   Postgres (DATABASE_URL)
```

- **Servidor:** Node.js + Express, banco Postgres (Supabase, Railway ou outro). Sem Postgres configurado, usa um Postgres embutido, bom para testes no computador.
- **Portal:** HTML/CSS/JS puro, sem etapa de build, na identidade visual MyBlue.
- **Ferramentas:** os HTMLs originais, sem edição manual. O portal só injeta, na hora de entregar, uma pequena ponte para salvar os dados no servidor.

## Rodar no computador

Requisitos: Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env      # ajuste ADMIN_EMAIL e, se quiser, ADMIN_SENHA
npm start
```

Abra http://localhost:3000. Na primeira execução o terminal mostra o e-mail do administrador e, se `ADMIN_SENHA` estiver vazio, uma senha temporária (o sistema pede a troca no primeiro login).

Esqueceu a senha do administrador?

```bash
npm run criar-admin -- seu.email@myblue.com.br "Seu Nome"
```

## Publicar as ferramentas (HTMLs)

**Os HTMLs não ficam no Git.** Este repositório é público e os arquivos das ferramentas contêm dados de negócio (condomínios, taxas, comissões) e os links das planilhas Google. Eles são enviados direto para o servidor, por um destes caminhos:

1. **Pelo portal (recomendado):** Administração → *Módulos e dados* → **Enviar vários HTMLs**. Selecione os 5 arquivos de uma vez: o portal reconhece cada um pelo título da página e publica no módulo certo.
2. **Pela linha de comando:** coloque os arquivos na pasta `modulos-originais/` (ela é ignorada pelo Git) e rode:
   ```bash
   npm run importar-html -- ./modulos-originais
   ```

Para atualizar uma ferramenta, basta enviar o HTML novo no módulo dela. Toda versão anterior fica guardada e pode ser restaurada com um clique (*Versões anteriores*). Em *Versões anteriores*, **Baixar** devolve o HTML de qualquer versão exatamente como foi enviado (o administrador e o coordenador/supervisor do setor da ferramenta). HTML enviado pela coordenação numa ferramenta **não isolada** só entra em uso depois que a administração aprovar (veja [Acessos](docs/acessos/LEIAME.md#html-novo-da-coordenação)).

Para publicar uma ferramenta nova, use **Novo módulo** (na tela da coordenação, **Nova ferramenta**), escolha nome, setor e ícone e envie o HTML. Ferramenta nova já nasce **isolada** (roda separada do portal, sem a sessão de quem abre).

## Usuários e permissões

**A referência completa de acessos é [`docs/acessos/LEIAME.md`](docs/acessos/LEIAME.md)**: onde cada acesso é definido,
os termos (perfil × papel, Supervisor × Supervisão da Central de Tickets, líder…), ferramentas, Carteira e isolamento.
Para ver tudo o que uma pessoa acessa: *Usuários e acessos* → a pessoa → **Tudo o que acessa**.

Resumo por perfil:

| | Usuário | Coordenador e Supervisor (mesmos poderes, nos setores do cadastro) | Administrador |
|---|---|---|---|
| Ferramentas | as liberadas | todas dos setores dele + as liberadas | todas, com todos os papéis |
| Usuários | — | usuários comuns dos setores dele | todos, todos os perfis |
| Ferramentas do setor (HTML, versões, quem abre e papel) | — | setores dele (HTML novo em ferramenta não isolada aguarda aprovação) | todas, mais *Módulos e dados* completo |
| Equipe e tipos de demanda | — | líderes e tipos dos setores dele | todos os setores |
| Tickets | os do setor dele e os que abriu | todos os setores (a Supervisão da Central de Tickets vem com o perfil) | todos |
| Carteira | consulta + o que estiver liberado em *Carteira: quem edita* | idem, e libera pessoas nas permissões do setor dele | tudo |
| Histórico, backup, setores, Central de Links | — | — | sim |

- Marcações à parte, no cadastro (só a administração): **Supervisão da Central de Tickets** (vê e direciona os tickets
  de **todos** os setores; já vem com os perfis Coordenador e Supervisor, então se marca só para usuário comum, ex.:
  Gerência) e **Marketing — Central de Links**.
- Ao criar um usuário (ou redefinir a senha), o portal mostra uma senha temporária. A pessoa cria a própria senha no
  primeiro acesso. A coordenação não redefine a senha de quem tem acesso fora dos setores dela (só a administração).
- Desativar um usuário encerra na hora as sessões abertas dele.
- Cada pessoa pode pôr uma **foto de perfil** em *Minha conta* (recortada e reduzida no navegador; fica no banco).

O acesso é conferido no servidor: quem não tem permissão não recebe o HTML da ferramenta nem consegue ler ou gravar os dados dela.

## Onde ficam os dados

Cada módulo tem a opção **Onde ficam os dados salvos pela ferramenta**:

| Opção | O que acontece |
|---|---|
| Só no navegador | Comportamento original. Cada pessoa vê apenas o que salvou no próprio computador. |
| Banco do portal · por pessoa | Salvo no servidor, separado por usuário. Abre igual em qualquer computador. |
| Banco do portal · equipe | Salvo no servidor e compartilhado. Todos com acesso veem e editam os mesmos dados. |

Isso funciona para qualquer ferramenta que use `localStorage`, inclusive as que forem criadas no futuro, sem mudar o código dela.

### Trocar a planilha Google pela planilha interna (backup + migração)

Renegociações, Parceiros e Controle de Pedidos gravam hoje numa planilha Google via Apps Script. O portal tem uma planilha interna (no Supabase) que fala o mesmo "idioma" do Apps Script. Para cada um dos três módulos, em *Módulos e dados*:

1. **Backup da planilha Google.** No Google Sheets: *Arquivo → Fazer uma cópia* (e, se quiser, *Arquivo → Fazer download → Excel*). A planilha original nunca é alterada pelo portal.
2. **Importar.** Clique no módulo → *Planilha da ferramenta* → confira o link do Apps Script (o portal já detecta o que vem no HTML) → **Importar da planilha**. A importação é feita pelo seu navegador e substitui o que houver no banco do portal para aquele módulo.
3. **Conferir.** Veja os totais de cada aba e baixe o CSV para comparar com a planilha.
4. **Ativar.** Marque **Banco do portal** e salve. A partir daí a ferramenta lê e grava no Supabase, com login e histórico de quem alterou cada registro.
5. **Avisar a equipe** para recarregar a ferramenta (o botão ⟳ da barra do portal) e não lançar mais nada direto na planilha Google.

Para voltar atrás, marque **Planilha Google (como hoje)**. O que foi lançado no portal nesse meio-tempo não é enviado de volta para a planilha, então exporte antes (JSON ou CSV).

> Importe antes de ativar. A ferramenta de Parceiros só "semeia" condomínios numa planilha completamente vazia, então ativar o banco interno sem importar deixa a aba de condomínios em branco.

### Controle de Pedidos (Suprimentos)

A versão publicada no portal é a do arquivo **sem** a senha própria (StatiCrypt): o acesso é controlado só pelo login e pelas permissões do portal. A planilha dessa ferramenta não tem coluna de ID (o nº do pedido se repete nas parcelas) e as alterações apontam a linha pela posição; na planilha interna, o portal confere o nº do pedido e o vencimento antes de alterar, para nunca mexer na linha errada. Excluir um pedido nessa ferramenta só remove da tela, como já acontecia com a planilha Google.

### Ferramentas feitas como artefato do Claude (Boletos e Síndicos)

O **Controle de Emissão de Boletos** (Crédito) e o **Controle de Síndicos** (CS) foram criados como artefatos publicados no claude.ai e gravam no banco do artefato (`window.claude.use('db')`). No portal eles rodam sem nenhuma alteração no HTML: o portal entrega o mesmo `window.claude` (banco de documentos, `user` e `downloads`), com os documentos guardados na tabela `documentos` do Supabase.

- **Tempo real:** cada tela aberta busca o que mudou a cada 3 segundos (30 s com a aba em segundo plano). O que uma pessoa grava aparece para as outras sem recarregar.
- **Quem fez:** o portal identifica cada pessoa como `mb-<id do usuário>`. Registros antigos, feitos ainda no Claude, guardam o id do Claude (`u_…`). Para mostrar o nome dessas pessoas, coloque no `config` do módulo `"pessoas_legadas": {"u_…": "Nome"}`.
- **Dados:** em *Módulos e dados* aparecem as coleções com a contagem de documentos, o CSV de cada uma e o JSON completo.

## Carteira de condomínios

Menu **Carteira → Carteira de condomínios**. Reúne os condomínios atendidos e quem cuida de cada um:

| Função | Coluna na planilha |
|---|---|
| Analista de cobrança | ANALISTA ADMINISTRATIVA |
| Analista extrajudicial (ApoioCob, prestador de serviços) | ANALISTA EXTRAJUDICIAL |
| Assistente de crédito | ASSISTENTE CRÉDITO |

- **Condomínios:** indicadores (ativos, comarcas, pessoas por função, ativos sem responsável), busca por nome, razão social, CNPJ ou ID, filtros por situação, UF, administradora e responsável, e ordenação por coluna. Clique no condomínio para ver a ficha completa e o histórico de alterações.
- **Equipes:** quantos condomínios ativos cada pessoa tem, por UF. Quem pode transferir aquela função usa **Transferir** para passar a carteira de uma pessoa (toda ou só alguns condomínios) para outra.
- **Quem pode o quê:** todos que entram no portal consultam (não há botão de exportar). Cadastrar, editar os dados, cada responsável, adicionar novos e transferir são permissões configuráveis em *Carteira: quem edita* (padrões e regras em [Acessos](docs/acessos/LEIAME.md#carteira-de-condomínios)). Toda alteração fica no histórico do condomínio (o que mudou, quem e quando).
- **Adicionar novos** (aba da Carteira, para administrador, coordenador e supervisor): envie a planilha *Controle de Implantações* do jeito que ela é (.xlsx ou .csv), escolha a **vigência** (mês/ano tirado da coluna **DATA CONTRATO**) e confira a lista. O portal mostra só os condomínios que ainda não estão na carteira (os parecidos com um existente vêm desmarcados), ignora os marcados para desconsiderar, os repetidos e os sem data de contrato. Para cada um: digitar o **ID Vouch** (obrigatório) e conferir o apelido sugerido. Os responsáveis (analista de cobrança, analista extrajudicial, assistente de crédito) podem ser escolhidos ali: o administrador escolhe todos e cada coordenador/supervisor só o do setor dele; o que ficar em branco é preenchido depois na ficha. Entram como Ativo, com UF, vencimento, administradora, forma de envio, **executivo de negócios** (coluna EXECUTIVO), **CNPJ** (coluna CNPJ; o portal confere os dígitos e avisa quando o Excel cortou o número em notação científica, com um campo para digitar na hora) e o nº do formulário e quem implantou nas observações.
- Condomínios novos entram pela aba **Adicionar novos** (o antigo *Importar CSV* e o *Exportar CSV* saíram da tela).
- Os dados da carteira **não vão para o Git** (o repositório é público): entram só pelo portal. Arquivos `.csv` ficam fora do Git.

Na Central de Tickets, a carteira define para quem vai o ticket de um condomínio (veja *Central de Tickets → Fluxo*).

## Central de Tickets

Demandas internas entre os setores: quem precisa de algo de outro setor abre um ticket, o setor recebe, o líder distribui e o responsável trata até resolver. Fica no menu **Central de Tickets** e não depende de nenhum HTML enviado.

**Fluxo**

1. **Abrir:** qualquer pessoa logada escolhe o setor, o tipo de demanda (opcional) e diz se a demanda é de **um condomínio** (escolhido na Carteira de condomínios) ou **interna**. Depois descreve, define a prioridade e pode anexar arquivos.
2. **Para quem vai:**
   - **Condomínio, setor Cobrança ou Crédito:** vai direto para a pessoa da carteira do condomínio (Cobrança → *analista de cobrança*, Crédito → *assistente de crédito*), que recebe o aviso por e-mail. A pessoa é encontrada pelo nome (sem acento e sem o ramal) entre a equipe do setor no portal; se não estiver cadastrada, o ticket vai para o líder e a equipe vê o aviso interno.
   - **Interna, ou setor que não usa a carteira:** entra na fila do setor sem responsável e os líderes recebem o aviso (sino, som e e-mail). Se o setor não tiver líder, a equipe inteira recebe.
3. **Distribuir:** só o **líder do setor** (a coordenação/supervisão do setor já é líder), quem tem a **Supervisão da Central de Tickets** ou a administração escolhe ou troca o responsável, a prioridade e o prazo para resposta.
4. **Iniciar:** o responsável clica em **Iniciar atendimento** e informa o **prazo para conclusão**. Sem ele o ticket não sai de *Novo*. Quem abriu é avisado e vê a previsão. Mudar a data depois exige o motivo, e quem abriu é avisado por e-mail.
5. **Tratar:** o responsável muda a situação (*Em andamento*, *Aguardando*), conversa com quem abriu e registra **notas internas** (quem abriu não vê). Ao transferir para outro setor, o ticket vai para a pessoa da carteira de lá (se houver) ou para a fila, e a equipe nova define o próprio prazo para conclusão.
6. **Resolver:** quem abriu é avisado e pode **reabrir** se não ficou resolvido. Também pode cancelar o próprio pedido.

**Prazos**

| Prazo | Quem define | Até quando conta |
|---|---|---|
| Para resposta | Automático pelo tipo de demanda ou prioridade (em horas de expediente). Só o líder altera | Até o 1º retorno da equipe: comentário, mudança de situação ou definição do prazo para conclusão |
| Para conclusão | Quem está com o ticket, ao iniciar o atendimento | Até resolver |

O ticket fica **atrasado** quando passa do prazo para resposta sem nenhum retorno, ou quando passa do prazo para conclusão ainda em aberto.

**Quem faz o quê**

| Perfil | O que pode |
|---|---|
| Qualquer pessoa | Abrir tickets, acompanhar os que abriu, comentar, anexar, cancelar ou reabrir os seus |
| Equipe do setor | Ver a fila do setor, tratar os tickets, definir o prazo para conclusão dos que estão com ela, mudar a situação, transferir, notas internas |
| Líder do setor (marcado em *Equipes e tipos de demanda*; a coordenação/supervisão do setor já é líder) | Tudo da equipe, mais escolher e trocar o responsável, a prioridade e o prazo para resposta |
| **Supervisão da Central de Tickets** (vem com os perfis Coordenador e Supervisor; para usuário comum, é uma marcação) | Ver e direcionar os tickets de **todos** os setores, com painel geral. Não dá acesso à administração do portal |
| Administrador | Tudo, mais montar equipes e tipos de demanda |

A **Supervisão da Central de Tickets** vem com os perfis Coordenador e Supervisor; para usuário comum, a administração marca no cadastro da pessoa, em *Usuários e acessos*. As equipes, os líderes e os **tipos de demanda** de cada setor (com prazo em horas e prioridade sugerida) ficam em *Administração → Equipes e tipos de demanda*. Os prazos contam só o **expediente: segunda a sexta, das 8h às 17h (horário de Brasília)**, ou seja, 9 h = 1 dia útil. Um ticket urgente aberto na sexta às 16h30 vence na segunda às 11h30. Sem tipo cadastrado, o prazo segue a prioridade: urgente 4 h, alta 1 dia útil, média 3 dias úteis e baixa 5 dias úteis. Feriados entram na variável `FERIADOS`.

**Avisos**

- **No portal:** sino na barra superior com o número de avisos não lidos, som e alerta do computador (cada pessoa ativa os alertas no sino). O portal confere a cada 30 segundos.
- **Por e-mail:** vão para quem recebeu o ticket, para os líderes quando chega ticket novo ou transferido para o setor, para quem abriu quando o ticket é resolvido ou cancelado, e para o responsável quando o ticket é reaberto. Comentários avisam só no portal. Sem e-mail configurado, os avisos aparecem só no portal.

**E-mail pelo Microsoft 365**

O portal envia pela API Microsoft Graph, com um aplicativo registrado na conta Microsoft da empresa. Não usa a senha de nenhuma caixa e não depende do SMTP com senha, que a Microsoft desliga por padrão a partir do fim de 2026. Quem faz é um **administrador global do Microsoft 365**:

1. **Caixa remetente.** No Centro de administração do Exchange, crie uma *caixa compartilhada* (não usa licença), ex.: `naoresponda@myblue.com.br`.
2. **Registrar o aplicativo.** Em [entra.microsoft.com](https://entra.microsoft.com): *Aplicativos → Registros de aplicativo → Novo registro*. Nome: `Portal MyBlue – avisos`, contas *somente deste diretório*, sem URI de redirecionamento. Anote o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.
3. **Segredo.** No aplicativo: *Certificados e segredos → Novo segredo do cliente* (validade de 24 meses). Copie o **Valor** na hora, porque ele só aparece uma vez. Anote na agenda para renovar antes de vencer.
4. **Não** adicione a permissão `Mail.Send` em *Permissões de API* do Entra: dada ali, ela deixa o aplicativo enviar como **qualquer** caixa da empresa. A permissão é dada no Exchange, valendo só para a caixa dos avisos (*RBAC para aplicativos*, o modelo atual da Microsoft). Copie o **ID do objeto** em *Aplicativos empresariais → Portal MyBlue – avisos* (não é o do registro) e rode no PowerShell do Exchange Online:
   ```powershell
   Connect-ExchangeOnline
   New-ServicePrincipal -AppId <ID do aplicativo> -ObjectId <ID do objeto do aplicativo empresarial> -DisplayName "Portal MyBlue – avisos"
   New-ManagementScope -Name "Portal MyBlue – caixa de avisos" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'naoresponda@myblue.com.br'"
   New-ManagementRoleAssignment -App <ID do aplicativo> -Role "Application Mail.Send" -CustomResourceScope "Portal MyBlue – caixa de avisos"
   Test-ServicePrincipalAuthorization -Identity <ID do aplicativo> -Resource naoresponda@myblue.com.br   # InScope deve ser True
   ```
   A permissão pode levar de 30 minutos a 2 horas para começar a valer.
5. **Variáveis no Railway:** `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `EMAIL_REMETENTE` (ex.: `Portal MyBlue <naoresponda@myblue.com.br>`) e `PORTAL_URL`.
6. **Testar.** Em *Administração → Equipes e tipos de demanda*, clique em **Enviar e-mail de teste para mim**. Se der erro, a mensagem da Microsoft aparece na tela: *Invalid client secret* (segredo errado ou vencido), *Access is denied* (a permissão do passo 4 ainda não valeu ou o filtro não pega a caixa remetente), *MailboxNotEnabledForRESTAPI* (a caixa remetente não existe no Exchange Online).

Fora do Microsoft 365, dá para usar SMTP comum com as variáveis `SMTP_*`.

**Painel:** em aberto, sem responsável, atrasados, resolvidos no período, % no prazo, tempo médio de resolução e de 1ª resposta, por setor, por responsável e por tipo de demanda. Cada pessoa vê os setores de que faz parte; administração e supervisão veem todos.

**Anexos:** até 10 MB por arquivo (`LIMITE_ANEXO_MB`), guardados no banco. Por segurança, só imagens abrem no navegador; os demais arquivos são sempre baixados.

**Manuais em PDF:** o Manual do Portal – Geral e um Manual do Portal – Setor X para cada setor ficam em [`docs/manuais`](docs/manuais).

## Central de Links

Página do portal com os links úteis da equipe (a antiga *Central de Links Grupo Apoio Cobrança* do pages.myblue.com.br), no menu **Central de Links**, logo abaixo de *Início*. Todos que entram no portal veem; os links abrem em nova aba.

**Quem edita:** administradores e quem tiver marcado **Marketing — Central de Links** no cadastro (*Usuários e acessos*). Essa marcação não dá acesso à administração do portal. Na página aparece o botão **Editar links e fundo**, com três abas:

- **Fundo da campanha:** cada campanha tem nome, data em que entra no ar, a imagem de fundo para computador (sugestão 1920 × 1080) e, se quiser, uma versão para celular (1080 × 1920). A campanha vale a partir da data de início (meia-noite de Brasília) até começar a próxima, então o marketing pode deixar o fundo do mês seguinte agendado com antecedência. O controle *Escurecer o fundo* garante a leitura dos botões. Imagens JPG, PNG ou WEBP de até 8 MB (`LIMITE_FUNDO_MB`), guardadas no banco. O botão **Ver** mostra como a página fica com aquela campanha antes de ela entrar no ar. Sem campanha, a página usa o fundo padrão MyBlue.
- **Links:** incluir, mudar o nome do botão, o endereço (link), o grupo, o ícone e a descrição; mudar a ordem com as setas; ocultar sem apagar ou excluir. Links com o mesmo grupo aparecem juntos sob o nome do grupo.
- **Título da página:** título e subtítulo que aparecem no topo.

Toda alteração fica no *Histórico de atividades* e entra no backup.

## Tutoriais em vídeo

No menu **Tutoriais**, vídeos curtos com o portal sendo usado de verdade (dados fictícios), com legenda e o passo a passo ao lado: clicar num passo leva ao trecho do vídeo. Cada pessoa vê só os vídeos do perfil dela (todos, equipe, líder, coordenador/supervisor, supervisão de tickets, administração) e das ferramentas que abre.

- O catálogo (título, descrição e para quem é cada vídeo) está em `server/tutoriais.js`.
- Os vídeos ficam no banco, não no repositório. A administração envia em **Administração → Tutoriais em vídeo**: arraste os `.mp4` e `.vtt` de uma vez, e cada arquivo vai para o tutorial com o mesmo nome. Até 150 MB por vídeo (`LIMITE_VIDEO_MB`).
- O player busca o vídeo aos pedaços, então dá para avançar e voltar sem baixar o arquivo inteiro.
- Os vídeos são gravados por `docs/tutoriais/fonte/gravar-tutoriais.js` (veja [`docs/tutoriais`](docs/tutoriais)).
- **Toda ferramenta nova ganha um tutorial, e toda atualização de ferramenta revê o dela.** A página da administração avisa quando a ferramenta recebeu um HTML novo depois do vídeo ("regravar") e lista as ferramentas que ainda não têm tutorial.

## Colocar no ar

### No Railway

O repositório já vem pronto para o Railway (`railway.json` + `Dockerfile`). O banco é um **Postgres**: pode ser o Supabase ou o Postgres do próprio Railway. Tudo fica no banco, inclusive os HTMLs enviados, então **não é preciso volume**.

1. **Criar o serviço.** No Railway: *New Project* → *Deploy from GitHub repo* → escolha `sistemamyblue` e o branch que deve ir para o ar.
2. **Criar o banco** (escolha um):
   - **Supabase:** crie o projeto em supabase.com, clique em *Connect* e copie a connection string do **Session pooler** (funciona pela rede IPv4 do Railway). Troque `[YOUR-PASSWORD]` pela senha do banco.
   - **Postgres do Railway:** no projeto, *+ New* → *Database* → *PostgreSQL*.
3. **Variáveis do serviço do portal** (*Variables*):
   - `DATABASE_URL` = a connection string do Supabase, ou `${{Postgres.DATABASE_URL}}` se usar o Postgres do Railway
   - `ADMIN_EMAIL` e `ADMIN_NOME` = o primeiro administrador
   - `ADMIN_SENHA` = opcional; se ficar vazio, a senha temporária aparece em *View Logs*
   Não defina `PORT`, `DATA_DIR`, `TRUST_PROXY` nem `COOKIE_SECURE`: o portal cuida disso no Railway.
4. **Aplicar.** O Railway guarda mudanças como rascunho: clique em *Deploy* no aviso roxo para valer.
5. **Endereço.** *Settings* → *Networking* → *Generate Domain* (porta **8080**) ou um domínio próprio.
6. **Primeiro acesso.** Entre com o administrador e envie os HTMLs em *Módulos e dados* → *Enviar vários HTMLs*.

As tabelas são criadas sozinhas na primeira vez, já com RLS ligado: a API pública do Supabase (chave anon) não enxerga nada, só o portal, que conecta como dono do banco. As variáveis `ADMIN_*` só valem quando o banco ainda não tem usuários; depois, troque e-mail e senha pelo próprio portal.

Para conferir: o endereço `/saude` responde `"banco":"postgres"` quando o `DATABASE_URL` está ativo. Sem `DATABASE_URL`, o portal usa um Postgres embutido e avisa no log que os dados se perdem a cada deploy.

### Consultar os dados no Supabase

Todas as tabelas ficam no schema `public` (*Table Editor* do Supabase). As principais:

| Tabela | O que guarda |
|---|---|
| `registros` | Linhas das planilhas internas (Renegociações, Tickets, Parceiros…), com os dados em `dados` (JSONB) |
| `armazenamento` | Dados salvos pelas ferramentas que usam o navegador, quando o módulo grava no banco |
| `auditoria` | Histórico de quem fez o quê |
| `usuarios`, `permissoes`, `modulos`, `modulo_versoes` | Acessos, módulos e as versões dos HTMLs |
| `comissao_relatorios`, `comissao_leitores` | Demonstrativos de premiação enviados pela ferramenta Gestão de Premiações (aba Minhas Premiações) e quem pode lê-los |

Exemplo, renegociações com condomínio e status:

```sql
SELECT dados->>1 AS condominio, dados->>4 AS status, atualizado_em
FROM registros WHERE modulo_slug = 'renegociacoes' AND colecao = 'renegociacoes';
```

### Com Docker

```bash
cp .env.example .env   # defina ADMIN_EMAIL, COOKIE_SECURE=true e TRUST_PROXY=1 se houver HTTPS na frente
docker compose up -d --build
docker compose logs portal   # mostra a senha temporária do primeiro acesso
```

Sem `DATABASE_URL`, o banco embutido fica no volume `dados`. Com `DATABASE_URL`, tudo vai para o Postgres. Para importar HTMLs pela linha de comando dentro do container:

```bash
docker compose run --rm -v "$PWD/modulos-originais:/import:ro" portal npm run importar-html -- /import
```

### Sem Docker (VPS, servidor interno)

Rode `npm ci --omit=dev` e `npm start` com um gerenciador de processos (pm2, systemd). Coloque um proxy com HTTPS na frente (Nginx, Caddy) e use `COOKIE_SECURE=true` e `TRUST_PROXY=1`. Outros serviços de nuvem (Render, Fly.io) funcionam desde que tenham **disco persistente** para a pasta `DATA_DIR`.

### Backup

> **Atenção:** o Supabase só faz backup automático nos planos pagos (Pro, Team, Enterprise). No plano **Free não há backup
> automático**: até migrar de plano, o único backup é o baixado pelo portal. O Postgres do Railway também não guarda cópias
> sozinho (os backups do volume precisam ser ligados no painel).

- **Backup do banco** (Administração → *Módulos e dados*): baixa `myblue-backup-AAAA-MM-DD.jsonl.gz` com **todas as tabelas**
  (a lista vem do próprio banco, então tabela nova entra sozinha), inclusive HTMLs e versões, anexos dos tickets, fotos,
  fundos da Central de Links, vídeos tutoriais, regras de acesso e demonstrativos. Ficam fora só as sessões abertas e a cópia
  das bibliotecas das CDNs. O arquivo é uma fotografia do banco num instante e sai aos pedaços, sem pesar no servidor.
- **Hashes de senha não vão para o backup.** O arquivo tem dados de negócio e pessoais: guarde em local com acesso restrito.
- **Restaurar** (num banco novo ou, com cuidado, no mesmo):
  ```bash
  DATABASE_URL=postgres://… npm run restaurar-backup -- myblue-backup-2026-10-19.jsonl.gz
  ```
  O banco indicado é **apagado** antes (se já tiver usuários, o script pede `--apagar-o-que-existe`). Depois de restaurar,
  as senhas de todos ficam bloqueadas e o script mostra uma senha temporária para cada administrador ativo, que entra e
  redefine a senha das demais pessoas em *Usuários e acessos*. Backups antigos (`.json`, versão 4) também são lidos.
- **Teste a restauração** de vez em quando: restaure o último backup num Postgres vazio (outro projeto do Supabase ou um
  Postgres local), suba o portal apontando para ele e confira. Backup que nunca foi restaurado não é garantia.
- As funções e os gatilhos do banco (Análise de Espólio) estão no código (`server/db.js`) e são recriados ao subir o portal.
- Cada módulo continua com **Exportar dados** (JSON) e CSV por aba da planilha interna.

## Configuração (`.env`)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | 3000 | Porta HTTP |
| `DATABASE_URL` | — | Endereço do Postgres (Supabase, Railway). Sem ele, usa o banco embutido |
| `DATA_DIR` | ./data | Pasta do banco embutido (só quando não há `DATABASE_URL`) |
| `ADMIN_EMAIL` / `ADMIN_NOME` / `ADMIN_SENHA` | — | Primeiro administrador (só quando o banco está vazio) |
| `SESSAO_HORAS` | 12 | Duração da sessão (renova sozinha enquanto a pessoa usa) |
| `COOKIE_SECURE` | false | `true` quando o portal estiver em HTTPS |
| `TRUST_PROXY` | 0 (no Railway, 1) | `1` quando houver proxy reverso na frente |
| `LIMITE_HTML_MB` / `LIMITE_DADOS_MB` | 40 / 25 | Tamanho máximo de HTML enviado e de dados gravados por vez |
| `LIMITE_ANEXO_MB` | 10 | Tamanho máximo de cada anexo de ticket |
| `LIMITE_FUNDO_MB` | 8 | Tamanho máximo de cada imagem de fundo da Central de Links |
| `LIMITE_VIDEO_MB` | 150 | Tamanho máximo de cada vídeo tutorial |
| `EXPEDIENTE_INICIO` / `EXPEDIENTE_FIM` | 8 / 17 | Horário de expediente usado nos prazos dos tickets |
| `EXPEDIENTE_DIAS` | 1,2,3,4,5 | Dias com expediente (0 = domingo … 6 = sábado) |
| `FERIADOS` | — | Dias sem expediente, ex.: `2026-11-02,2026-11-15,2026-11-20,2026-12-25` |
| `PORTAL_URL` | — | Endereço público do portal (ex.: `https://portal.myblue.com.br`), usado no link dos e-mails |
| `EMAIL_REMETENTE` | — | Caixa que envia os avisos, ex.: `Portal MyBlue <naoresponda@myblue.com.br>` |
| `M365_TENANT_ID` / `M365_CLIENT_ID` / `M365_CLIENT_SECRET` | — | Envio pelo Microsoft 365 (Graph). Passo a passo na seção Central de Tickets |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USUARIO` / `SMTP_SENHA` / `SMTP_SEGURO` | — / 587 | Alternativa: SMTP comum (usado só sem as variáveis `M365_*`) |

## Segurança

- Senhas com hash scrypt e sal individual. Senha mínima de 8 caracteres com letras e números.
- Sessão em cookie `HttpOnly` e `SameSite=Lax`, guardada no banco só como hash. Logout, troca de senha e desativação encerram sessões.
- Bloqueio temporário de 15 minutos após 8 tentativas de login erradas no mesmo e-mail, ou 30 no mesmo IP. A conferência
  da senha roda fora da linha principal do servidor (não deixa o portal lento durante tentativas em série).
- Proteção contra requisições de outros sites (CSRF) nas gravações, inclusive nas gravações via JSONP da planilha interna.
- Permissão conferida no servidor em cada ferramenta e em cada leitura ou gravação de dados. Nas ferramentas que guardam
  os papéis nelas mesmas, o servidor também confere quem muda os papéis.
- **Ferramentas isoladas** (sandbox): o HTML roda numa origem própria, sem o cookie do portal, e só alcança os próprios
  dados e o que precisa (veja [Acessos](docs/acessos/LEIAME.md#ferramentas-isoladas)). Ferramenta nova já nasce isolada.
- As bibliotecas das CDNs servidas pelo portal (`/cdn`) são só scripts, estilos, fontes e afins: SVG e HTML vão direto
  para a CDN, fora da origem do portal.
- Histórico de atividades: logins, falhas de login, aberturas, gravações, importações, envios de HTML e mudanças de permissão.

Os links de Apps Script que estão dentro dos HTMLs dão acesso de leitura e escrita às planilhas para quem tiver o arquivo. Depois de migrar para a planilha interna, vale desativar essas implantações do Apps Script.

## Estrutura do código

```
server/
  index.js          configuração, montagem do app e primeiro administrador
  banco.js          conexão com o Postgres (Supabase/Railway) ou o Postgres embutido
  db.js             esquema do banco, funções/gatilhos e catálogo inicial
  backup.js         backup de todas as tabelas (aos pedaços) e restauração
  catalogo.js       setores e módulos que já nascem cadastrados
  seguranca.js      senhas, sessões, permissões, CSRF, limite de tentativas, auditoria
  modulos.js        versões dos HTMLs, injeção da ponte e ligação com a planilha interna
  bridge.js         ponte de armazenamento (roda dentro de cada ferramenta)
  registros.js      planilha interna (coleções e registros)
  notificacoes.js   avisos da Central de Tickets (sino do portal e e-mail)
  email.js          envio de e-mail: Microsoft 365 (Graph) ou SMTP
  expediente.js     prazos em horário de expediente (seg–sex, 8h–17h)
  tutoriais.js      catálogo dos vídeos tutoriais e quem vê cada um
  rotas/            auth, admin, ferramentas (entrega, armazenamento, protocolo Apps Script), tickets, links (Central de Links) e tutoriais
public/             portal (login, início, menu, administração)
scripts/            importar-html e criar-admin
test/               testes automatizados (npm test)
```

Testes: `npm test` (usam HTMLs sintéticos e o Postgres embutido). Para testar num Postgres de verdade: `TEST_DATABASE_URL=postgres://… npm test` (o banco indicado é apagado).
O GitHub roda os testes sozinho a cada push e pull request (aba *Actions*, `.github/workflows/testes.yml`): só publique no Railway o que estiver verde.
