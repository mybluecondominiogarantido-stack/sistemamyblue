# Portal MyBlue

Sistema que reúne as centrais de ferramentas da MyBlue em um único endereço, com **login de usuários**, **permissões por ferramenta**, **banco de dados** e **histórico de atividades**.

As ferramentas que já existem (os arquivos HTML de cada setor) continuam funcionando como hoje. O portal entrega cada uma depois do login e, quando o administrador quiser, passa a guardar os dados delas no banco da empresa em vez do navegador ou da planilha Google.

| Setor | Ferramenta | Dados hoje | Dados no portal |
|---|---|---|---|
| Crédito | Central de Ferramentas — Crédito | não guarda | não precisa |
| Cobrança | Central de Ferramentas — Cobrança / Gestão | não guarda | não precisa |
| Sucesso do Cliente | Controle de Renegociações e Tickets | planilha Google | planilha interna do portal |
| Suprimentos | Controle de Pedidos | planilha Google | planilha Google (acesso só pelo login do portal) |
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

### Trocar a planilha Google pela planilha interna

Renegociações e Parceiros gravam hoje numa planilha Google via Apps Script. O portal tem uma planilha interna que fala o mesmo "idioma" do Apps Script. A troca é feita assim, em *Módulos e dados*, clicando no módulo:

1. Em **Planilha da ferramenta**, confira o link do Apps Script (o portal já detecta o que vem no HTML) e clique em **Importar da planilha**. Os dados são copiados para o banco do portal. A planilha Google não é alterada.
2. Confira os totais de cada aba e, se quiser, baixe o CSV para comparar.
3. Marque **Banco do portal** e salve. A partir daí a ferramenta lê e grava no banco do MyBlue, com login e histórico de quem alterou cada registro.

Para voltar atrás, marque **Planilha Google (como hoje)**. O que foi lançado no portal nesse meio-tempo não é enviado de volta para a planilha, então exporte antes (JSON ou CSV).

> Importe antes de ativar. A ferramenta de Parceiros só "semeia" condomínios numa planilha completamente vazia, então ativar o banco interno sem importar deixa a aba de condomínios em branco.

### Controle de Pedidos (Suprimentos)

A versão publicada no portal é a do arquivo **sem** a senha própria (StatiCrypt): o acesso é controlado só pelo login e pelas permissões do portal. Os pedidos continuam gravados na planilha Google da ferramenta, e o navegador guarda apenas uma cópia temporária. Para mover esses dados para o banco do portal é preciso ligar a ferramenta à planilha interna, como já é feito em Renegociações e Parceiros.

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
  rotas/            auth, admin e ferramentas (entrega, armazenamento, protocolo Apps Script)
public/             portal (login, início, menu, administração)
scripts/            importar-html e criar-admin
test/               testes automatizados (npm test)
```

Testes: `npm test` (usam HTMLs sintéticos e o Postgres embutido). Para testar num Postgres de verdade: `TEST_DATABASE_URL=postgres://… npm test` (o banco indicado é apagado).
