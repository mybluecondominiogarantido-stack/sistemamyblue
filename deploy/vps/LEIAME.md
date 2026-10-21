# Portal MyBlue na VPS (Contabo) — portal.myblue.com.br

O portal roda em Docker na VPS, com o **Caddy** na frente cuidando do HTTPS (certificado Let's Encrypt, emitido e
renovado sozinho). O banco continua no **Supabase** (`DATABASE_URL`, o mesmo usado no Railway): nada de dados muda de
lugar na troca.

```
Navegador ──HTTPS──► Caddy (:443, portal.myblue.com.br) ──► portal (Node, :3000, só na rede interna) ──► Supabase
```

| Arquivo | Para que serve |
|---|---|
| `docker-compose.yml` | Sobe o portal e o Caddy. O portal roda como usuário `node`, sem porta aberta para fora. |
| `Caddyfile` | HTTPS e proxy para o portal. |
| `preparar-servidor.sh` | Uma vez, na VPS nova: Docker, firewall, SSH só por chave, código em `/opt/sistemamyblue`, backup diário. |
| `atualizar.sh` | Publica a última versão do `main`, **só se os testes do GitHub passaram** nela, e volta sozinho se não subir. |

## 1. Na Contabo (página "Configure your Cloud VPS")

| Opção | Escolha |
|---|---|
| Região | **US West (Seattle)**: o banco do portal no Supabase fica em `us-west-2` (Oregon), e cada tela faz várias consultas ao banco |
| Imagem | **Ubuntu 24.04**, sem painel (nada de cPanel ou Plesk) |
| Disco | NVMe, o menor serve: HTMLs, vídeos, anexos e backups do portal ficam no banco |
| Login | **SSH key** (cole a chave pública). Se ficar só com senha, use uma senha longa e cadastre a chave logo depois |
| Add-ons | Nenhum é necessário (o servidor não guarda dados; o backup diário está no passo 4) |

Anote o **IPv4** da VPS quando ela ficar pronta (e-mail da Contabo ou painel).

## 2. DNS: portal.myblue.com.br → VPS

No painel de DNS do domínio `myblue.com.br`:

1. Uns dias antes, baixe o **TTL** do registro `portal` para 300 s (5 min). Assim a troca vale rápido e dá para voltar
   rápido.
2. Na hora da troca (passo 5), troque o registro `portal` por um **A** apontando para o IPv4 da VPS. Se hoje for um
   `CNAME` para o Railway, apague o CNAME e crie o A. Se criar também um **AAAA** (IPv6 da Contabo), ele precisa ser o da
   mesma VPS.

O Caddy só consegue o certificado HTTPS depois que o DNS já aponta para a VPS.

## 3. Preparar a VPS

Entre na VPS (`ssh root@<IPv4>`) e rode:

```bash
curl -fsSL https://raw.githubusercontent.com/mybluecondominiogarantido-stack/sistemamyblue/main/deploy/vps/preparar-servidor.sh | bash
```

Depois, preencha o `.env` com as **mesmas variáveis que estão hoje no Railway** (*Variables* do serviço do portal):

```bash
nano /opt/sistemamyblue/.env
```

- `DATABASE_URL` (Supabase, Session pooler), `ANTHROPIC_API_KEY`, `M365_TENANT_ID`, `M365_CLIENT_ID`,
  `M365_CLIENT_SECRET`, `EMAIL_REMETENTE`, `FERIADOS` e o que mais houver lá.
- `PORTAL_URL=https://portal.myblue.com.br`.
- **Não** coloque `PORT`, `DATA_DIR`, `COOKIE_SECURE` nem `TRUST_PROXY`: o `docker-compose.yml` já define.
- O arquivo fica só na VPS (`chmod 600`), nunca no Git.

## 4. Backup diário

O `preparar-servidor.sh` já agenda: todo dia às 03:15 (horário de Brasília) sai um backup completo do banco em
`/opt/myblue-backups`, e ficam os 14 mais recentes. Log em `/var/log/myblue-backup.log`.

- É o mesmo arquivo do botão *Backup do banco* do portal (sem hashes de senha). O Supabase Free não faz backup sozinho,
  então este é o backup.
- **Ele fica no mesmo disco da VPS.** Copie de vez em quando para fora (ex.: no seu computador,
  `scp root@<IPv4>:/opt/myblue-backups/*.jsonl.gz .`) e guarde com acesso restrito.
- Rodar na hora: `cd /opt/sistemamyblue/deploy/vps && docker compose run --rm -T -v /opt/myblue-backups:/backups portal node scripts/fazer-backup.js /backups`
- Restaurar: `npm run restaurar-backup` (seção *Backup* do README).

## 5. A troca (Railway → VPS)

1. **Testar antes, se quiser:** crie um registro A provisório (ex.: `portal-novo.myblue.com.br`) para a VPS e suba com ele:
   ```bash
   cd /opt/sistemamyblue/deploy/vps && DOMINIO=portal-novo.myblue.com.br ./atualizar.sh
   ```
   Entre em `https://portal-novo.myblue.com.br`, abra algumas ferramentas, a Central de Tickets e a Carteira. É o mesmo
   banco: o que for gravado ali vale para valer.
2. **Trocar o DNS** do `portal` para a VPS (passo 2) e subir com o domínio definitivo:
   ```bash
   cd /opt/sistemamyblue/deploy/vps && ./atualizar.sh
   ```
3. **Conferir:** `https://portal.myblue.com.br/saude` responde `"banco":"postgres"` e o cadeado do HTTPS aparece. As
   sessões ficam no banco, então quem estava logado continua logado. Em *Equipes e tipos de demanda*, **Enviar e-mail de
   teste para mim**.
4. **Desligar o Railway** logo depois (*Settings* → remover o domínio próprio e pausar ou apagar o serviço). Com os dois
   ligados no mesmo banco, as rotinas automáticas da Implantação (lembretes) rodam em dobro.
5. Se algo der errado: volte o registro DNS para o Railway (por isso o TTL baixo) e reative o serviço lá.

## Publicar uma versão nova

O Railway publicava sozinho a cada push. Na VPS, depois que o pull request entra no `main` e os testes ficam verdes
(aba *Actions* do GitHub):

```bash
ssh root@<IPv4> /opt/sistemamyblue/deploy/vps/atualizar.sh
```

- Commit com testes vermelhos ou ainda rodando **não vai para o ar**.
- Se o portal novo não responder em `/saude` em 2 minutos, o script mostra o log e volta para a versão anterior.
- Voltar para uma versão específica: `./atualizar.sh <commit>`.

## Dia a dia

```bash
cd /opt/sistemamyblue/deploy/vps
docker compose ps                     # situação (portal deve estar "healthy")
docker compose logs -f portal         # log do portal (senha temporária do primeiro acesso aparece aqui)
docker compose logs caddy             # HTTPS e certificado
docker compose restart portal         # reiniciar (ex.: depois de mudar o .env)
docker compose run --rm -T portal npm run criar-admin -- email@myblue.com.br "Nome"
```

- Mudou o `.env`? `docker compose up -d` (recria o portal com as variáveis novas).
- Atualizações de segurança do Ubuntu entram sozinhas (`unattended-upgrades`). Uma vez por mês, vale `apt upgrade` e
  `reboot` em horário sem uso. Os containers voltam sozinhos.
