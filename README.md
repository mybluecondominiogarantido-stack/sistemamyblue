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

Para atualizar uma ferramenta, basta enviar o HTML novo no módulo dela. Toda versão anterior fica guardada e pode ser restaurada com um clique (*Versões anteriores*).

Para publicar uma ferramenta nova, use **Novo módulo**, escolha nome, setor e ícone e envie o HTML.

## Usuários e permissões

Em *Usuários e acessos*:

- **Usuário:** vê e abre só as ferramentas marcadas no cadastro dele. Dá para marcar o setor inteiro de uma vez.
- **Administrador:** acessa todas as ferramentas e a administração.
- Ao criar um usuário (ou redefinir a senha), o portal mostra uma senha temporária. A pessoa cria a própria senha no primeiro acesso.
- Desativar um usuário encerra na hora as sessões abertas dele.

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

## Central de Tickets

Demandas internas entre os setores: quem precisa de algo de outro setor abre um ticket, o setor recebe, o líder distribui e o responsável trata até resolver. Fica no menu **Central de Tickets** e não depende de nenhum HTML enviado.

**Fluxo**

1. **Abrir:** qualquer pessoa logada escolhe o setor, o tipo de demanda, a prioridade, descreve e pode anexar arquivos.
2. **Fila do setor:** o ticket entra como *Novo*, sem responsável. Os líderes do setor recebem aviso (sino, som e e-mail). Se o setor não tiver líder, a equipe inteira recebe.
3. **Distribuir:** o líder atribui a alguém da equipe. Qualquer pessoa do setor também pode **assumir** um ticket da fila, ou devolver para a fila um que esteja com ela.
4. **Tratar:** o responsável muda a situação (*Em andamento*, *Aguardando*), conversa com quem abriu e registra **notas internas** (quem abriu não vê). Também pode transferir para outro setor, e aí o ticket volta para a fila do novo setor.
5. **Resolver:** quem abriu é avisado e pode **reabrir** se não ficou resolvido. Também pode cancelar o próprio pedido.

**Quem faz o quê**

| Perfil | O que pode |
|---|---|
| Qualquer pessoa | Abrir tickets, acompanhar os que abriu, comentar, anexar, cancelar ou reabrir os seus |
| Equipe do setor | Ver a fila do setor, assumir, tratar, mudar situação, prioridade e prazo, transferir, notas internas |
| Líder do setor (coordenação do setor) | Tudo da equipe, mais distribuir tickets para qualquer pessoa do setor |
| Supervisão / Coordenação | Ver e direcionar os tickets de **todos** os setores, com painel geral. Não dá acesso à administração do portal |
| Administrador | Tudo, mais montar equipes e tipos de demanda |

O perfil **Supervisão / Coordenação** é marcado no cadastro da pessoa, em *Usuários e acessos*. As equipes, os líderes e os **tipos de demanda** de cada setor (com prazo em horas e prioridade sugerida) ficam em *Administração → Equipes e tipos de demanda*. Os prazos contam só o **expediente: segunda a sexta, das 8h às 17h (horário de Brasília)**, ou seja, 9 h = 1 dia útil. Um ticket urgente aberto na sexta às 16h30 vence na segunda às 11h30. Sem tipo cadastrado, o prazo segue a prioridade: urgente 4 h, alta 1 dia útil, média 3 dias úteis e baixa 5 dias úteis. Feriados entram na variável `FERIADOS`.

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

**Manuais em PDF:** o Manual Geral e um manual para cada setor ficam em [`docs/manuais`](docs/manuais).

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

- Administração → *Módulos e dados* → **Backup do banco** baixa um JSON com todas as tabelas (sem as senhas). O Supabase e o Railway também fazem backup automático do Postgres.
- Cada módulo tem **Exportar dados** (JSON) e CSV por aba da planilha interna.

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
- Bloqueio temporário após 8 tentativas de login erradas.
- Proteção contra requisições de outros sites (CSRF) nas gravações, inclusive nas gravações via JSONP da planilha interna.
- Permissão conferida no servidor em cada ferramenta e em cada leitura ou gravação de dados.
- Histórico de atividades: logins, falhas de login, aberturas, gravações, importações, envios de HTML e mudanças de permissão.

Os links de Apps Script que estão dentro dos HTMLs dão acesso de leitura e escrita às planilhas para quem tiver o arquivo. Depois de migrar para a planilha interna, vale desativar essas implantações do Apps Script.

## Estrutura do código

```
server/
  index.js          configuração, montagem do app e primeiro administrador
  banco.js          conexão com o Postgres (Supabase/Railway) ou o Postgres embutido
  db.js             esquema do banco e catálogo inicial
  catalogo.js       setores e módulos que já nascem cadastrados
  seguranca.js      senhas, sessões, permissões, CSRF, limite de tentativas, auditoria
  modulos.js        versões dos HTMLs, injeção da ponte e ligação com a planilha interna
  bridge.js         ponte de armazenamento (roda dentro de cada ferramenta)
  registros.js      planilha interna (coleções e registros)
  notificacoes.js   avisos da Central de Tickets (sino do portal e e-mail)
  email.js          envio de e-mail: Microsoft 365 (Graph) ou SMTP
  expediente.js     prazos em horário de expediente (seg–sex, 8h–17h)
  rotas/            auth, admin, ferramentas (entrega, armazenamento, protocolo Apps Script) e tickets
public/             portal (login, início, menu, administração)
scripts/            importar-html e criar-admin
test/               testes automatizados (npm test)
```

Testes: `npm test` (usam HTMLs sintéticos e o Postgres embutido). Para testar num Postgres de verdade: `TEST_DATABASE_URL=postgres://… npm test` (o banco indicado é apagado).
