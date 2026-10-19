# Portal MyBlue numa VPS (Contabo, AlmaLinux 9)

Como fica no ar:

```
Internet ──► Nginx :80/:443 (HTTPS, Let's Encrypt) ──► Portal (Node.js 22, 127.0.0.1:3000) ──► PostgreSQL 17 (127.0.0.1:5432)
```

- **Nginx** recebe a internet e faz o HTTPS. O Apache também serve (arquivo `apache-portal.conf`, seção no fim), mas o Nginx é o recomendado: mais leve como proxy e com menos ajustes.
- **Portal** roda como serviço do systemd (`portal-myblue`), com um usuário próprio (`portal`), sem acesso de fora: só o Nginx fala com ele.
- **PostgreSQL** na mesma VPS, sem porta aberta para a internet. Tudo do portal fica no banco (inclusive HTMLs das ferramentas e vídeos), então o backup do banco é o backup do portal.

Arquivos desta pasta:

| Arquivo | Vai para |
|---|---|
| `env.vps.example` | `/opt/portal-myblue/.env` |
| `portal-myblue.service` | `/etc/systemd/system/` |
| `nginx-portal.conf` | `/etc/nginx/conf.d/portal-myblue.conf` |
| `apache-portal.conf` | `/etc/httpd/conf.d/portal-myblue.conf` (só se usar Apache) |
| `portal-myblue-backup.service` e `.timer` | `/etc/systemd/system/` |
| `backup-banco.sh`, `atualizar.sh` | ficam aqui; rodam com `sudo` |

Os comandos abaixo são para copiar e colar, como **root** (ou com `sudo`). Troque `portal.myblue.com.br` pelo domínio escolhido em todos os lugares.

---

## 0. Antes de começar

- **VPS na Contabo** com AlmaLinux 9 (mínimo 2 GB de RAM e 20 GB de disco; os vídeos dos tutoriais ficam no banco, então reserve espaço).
- **Domínio:** crie no DNS um registro **A** `portal.myblue.com.br` → IP da VPS (e **AAAA** com o IPv6, se quiser). O HTTPS só funciona depois que o DNS responder com o IP novo: confira com `ping portal.myblue.com.br`.
- **Se for migrar o portal atual:** tenha à mão o `DATABASE_URL` em uso hoje (Railway ou Supabase) e as variáveis `M365_*`, `EMAIL_REMETENTE` e `ADMIN_*` do Railway.

## 1. Primeiro acesso e atualização do sistema

```bash
ssh root@IP_DA_VPS

dnf -y update
timedatectl set-timezone America/Sao_Paulo
hostnamectl set-hostname portal-myblue
dnf -y install epel-release
dnf -y install git curl tar policycoreutils-python-utils dnf-automatic
reboot   # se o update trouxe kernel novo
```

**Usuário administrativo (recomendado)**, para não entrar mais como root:

```bash
adduser suporte && passwd suporte && usermod -aG wheel suporte
# no SEU computador: ssh-copy-id suporte@IP_DA_VPS   (e teste o login antes de seguir)
```

Depois de conseguir entrar com `ssh suporte@IP_DA_VPS` e rodar `sudo -i`, desligue o login por senha e o do root:

```bash
cat > /etc/ssh/sshd_config.d/10-portal.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
EOF
systemctl reload sshd
```

**Atualizações de segurança automáticas:**

```bash
sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer
```

## 2. Firewall

Só SSH, HTTP e HTTPS ficam abertos (as portas 3000 e 5432 ficam fechadas):

```bash
dnf -y install firewalld
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=ssh --add-service=http --add-service=https
firewall-cmd --reload
firewall-cmd --list-all
```

Se usar o firewall do painel da Contabo, libere as mesmas portas (22, 80, 443) lá também.

## 3. Node.js 22

```bash
dnf -y module reset nodejs
dnf -y module enable nodejs:22
dnf -y install nodejs npm
node -v    # precisa ser v22.x (o portal exige 20 ou mais)
```

Se `nodejs:22` não aparecer em `dnf module list nodejs`, use o repositório oficial: `curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && dnf -y install nodejs`.

## 4. PostgreSQL 17

Pelo repositório oficial do PostgreSQL (a versão 17 também consegue copiar os dados do Supabase, que pode estar na 15 ou 17):

```bash
dnf -y install https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
dnf -qy module disable postgresql
dnf -y install postgresql17-server postgresql17
/usr/pgsql-17/bin/postgresql-17-setup initdb
systemctl enable --now postgresql-17
```

**Usuário e banco do portal** (troque a senha; use letras e números, sem `@ : / ?`, para não precisar escapar no endereço):

```bash
SENHA_BANCO='TroqueEstaSenha2026'
sudo -u postgres psql -c "CREATE ROLE portal LOGIN PASSWORD '$SENHA_BANCO';"
sudo -u postgres psql -c "CREATE DATABASE portal_myblue OWNER portal ENCODING 'UTF8' TEMPLATE template0;"
```

**Login por senha pela rede local.** O padrão do AlmaLinux é `ident`, que recusa o portal. Troque para `scram-sha-256` nas linhas `host` do `127.0.0.1` e do `::1`:

```bash
PGHBA=/var/lib/pgsql/17/data/pg_hba.conf
sed -i -E 's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)\S+/\1scram-sha-256/' $PGHBA
grep -E '^host' $PGHBA          # as duas linhas devem terminar em scram-sha-256
systemctl restart postgresql-17
psql "postgres://portal:$SENHA_BANCO@127.0.0.1:5432/portal_myblue" -c 'SELECT 1'
```

O PostgreSQL já vem escutando só em `localhost` (`listen_addresses`), não mude isso.

**Ajuste de memória (opcional, VPS com 4 GB ou mais):**

```bash
cat >> /var/lib/pgsql/17/data/postgresql.conf <<'EOF'
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
EOF
systemctl restart postgresql-17
```

## 5. Código do portal

```bash
useradd --system --create-home --home-dir /var/lib/portal --shell /sbin/nologin portal
git clone -b APP-ApacheI https://github.com/mybluecondominiogarantido-stack/sistemamyblue.git /opt/portal-myblue
chown -R portal:portal /opt/portal-myblue
cd /opt/portal-myblue
sudo -u portal npm ci --omit=dev
```

**Variáveis** (o portal lê o `.env` da própria pasta; ele nunca vai para o Git):

```bash
cp deploy/almalinux/env.vps.example .env
chown portal:portal .env && chmod 600 .env
nano .env    # DATABASE_URL com a senha do passo 4, PORTAL_URL, ADMIN_EMAIL, M365_*
```

**Teste rápido** (Ctrl+C para sair):

```bash
sudo -u portal node server/index.js
# em outro terminal: curl http://127.0.0.1:3000/saude   →  {"ok":true,"banco":"postgres"}
```

Na primeira vez, com o banco vazio, aparece no log o bloco **PRIMEIRO ACESSO** com o e-mail do administrador e a senha temporária. Se for migrar os dados do portal atual, pare aqui e faça o passo 9 antes de seguir.

## 6. Serviço (inicia sozinho e reinicia se cair)

```bash
cp /opt/portal-myblue/deploy/almalinux/portal-myblue.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now portal-myblue
systemctl status portal-myblue
journalctl -u portal-myblue -n 50     # senha temporária do primeiro acesso, se houver
```

## 7. Nginx

```bash
dnf -y install nginx
cp /opt/portal-myblue/deploy/almalinux/nginx-portal.conf /etc/nginx/conf.d/portal-myblue.conf
sed -i 's/portal\.myblue\.com\.br/SEU.DOMINIO.AQUI/' /etc/nginx/conf.d/portal-myblue.conf   # se o domínio for outro

# SELinux: deixa o Nginx falar com o portal na porta 3000 (sem isso dá erro 502)
setsebool -P httpd_can_network_connect 1

nginx -t
systemctl enable --now nginx
curl -I http://portal.myblue.com.br/login     # HTTP/1.1 200
```

Mantenha o SELinux ligado (`getenforce` → `Enforcing`); o comando `setsebool` acima é o único ajuste necessário.

## 8. HTTPS (Let's Encrypt)

```bash
dnf -y install certbot python3-certbot-nginx
certbot --nginx -d portal.myblue.com.br --redirect --agree-tos -m ti@myblue.com.br
systemctl enable --now certbot-renew.timer
certbot renew --dry-run
```

O certbot acrescenta o HTTPS no próprio `portal-myblue.conf` e passa a redirecionar o HTTP. A renovação é automática.

Abra `https://portal.myblue.com.br` e entre com o administrador. Confira `https://portal.myblue.com.br/saude` → `"banco":"postgres"`.

## 9. Trazer os dados do portal atual (Railway/Supabase)

Faça com o portal novo **parado** e combine um horário sem uso (o que for lançado no portal antigo depois da cópia não vem junto).

```bash
systemctl stop portal-myblue
SENHA_BANCO='TroqueEstaSenha2026'   # a mesma senha do passo 4

# 1) cópia do banco atual (o endereço é o DATABASE_URL usado hoje; no Supabase acrescente ?sslmode=require)
ORIGEM='postgres://usuario:senha@host:5432/postgres?sslmode=require'
/usr/pgsql-17/bin/pg_dump -Fc --no-owner --no-privileges -n public -d "$ORIGEM" -f /root/portal-origem.dump

# 2) banco novo vazio e restauração
sudo -u postgres dropdb portal_myblue
sudo -u postgres createdb -O portal -E UTF8 -T template0 portal_myblue
/usr/pgsql-17/bin/pg_restore --no-owner --no-privileges --role=portal \
  -d "postgres://portal:$SENHA_BANCO@127.0.0.1:5432/portal_myblue" /root/portal-origem.dump

systemctl start portal-myblue
journalctl -u portal-myblue -n 30
```

Usuários, senhas, ferramentas, versões, tickets, carteira e vídeos vêm todos no banco. Depois:

1. Entre no portal novo e confira usuários, ferramentas e alguns registros.
2. Aponte o DNS definitivo para a VPS (se ainda não apontou) e ajuste `PORTAL_URL` no `.env` (`systemctl restart portal-myblue`).
3. Deixe o Railway parado (não apagado) por alguns dias, até ter certeza.

Avisos de `schema "public" already exists`, `role "anon" does not exist` ou de extensões do Supabase no `pg_restore` podem ser ignorados: são permissões da API do Supabase, que o portal não usa.

## 10. Backup diário

```bash
cp /opt/portal-myblue/deploy/almalinux/portal-myblue-backup.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now portal-myblue-backup.timer
systemctl start portal-myblue-backup      # primeiro backup agora
ls -lh /var/backups/portal-myblue
```

Roda todo dia às 02:30 e guarda 14 dias. **Copie para fora da VPS** também (Object Storage ou snapshot da Contabo, ou um `rsync`/`rclone` para outro lugar): backup só na mesma máquina não protege se a VPS for perdida.

Para restaurar um backup:

```bash
systemctl stop portal-myblue
sudo -u postgres dropdb portal_myblue && sudo -u postgres createdb -O portal portal_myblue
sudo -u postgres /usr/pgsql-17/bin/pg_restore --no-owner --role=portal -d portal_myblue /var/backups/portal-myblue/ARQUIVO.dump
systemctl start portal-myblue
```

O backup em JSON do próprio portal (Administração → *Módulos e dados* → **Backup do banco**) continua funcionando.

## 11. Atualizar o portal

Depois de publicar mudanças no branch `APP-ApacheI`:

```bash
sudo /opt/portal-myblue/deploy/almalinux/atualizar.sh
```

Ele baixa o código, instala as dependências, reinicia o serviço e mostra o `/saude`. As tabelas novas, se houver, são criadas sozinhas na inicialização.

## Conferência final

- [ ] `https://portal.myblue.com.br/saude` → `{"ok":true,"banco":"postgres"}`
- [ ] `http://` redireciona para `https://` e o cadeado aparece no navegador
- [ ] Login funciona e continua logado ao recarregar (cookie seguro)
- [ ] Enviar um HTML de ferramenta e um vídeo de tutorial funciona (limites de tamanho do Nginx)
- [ ] `ss -tlnp` mostra a porta 3000 e a 5432 só em `127.0.0.1`
- [ ] `systemctl list-timers` mostra `portal-myblue-backup` e `certbot-renew`
- [ ] Um ticket de teste manda o e-mail (variáveis `M365_*`)
- [ ] Depois de `reboot`, tudo volta sozinho

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| **502 Bad Gateway** | Portal parado (`systemctl status portal-myblue`, `journalctl -u portal-myblue`) ou falta o `setsebool -P httpd_can_network_connect 1` |
| **413 Request Entity Too Large** | `client_max_body_size` do Nginx (está em 200m no arquivo desta pasta) |
| **400/414 Request Header Or URI Too Large** | falta o `large_client_header_buffers 8 512k;` no topo do `portal-myblue.conf` |
| `password authentication failed` / `Ident authentication failed` | `pg_hba.conf` ainda com `ident` (passo 4) ou senha diferente no `DATABASE_URL` |
| **Origem não permitida** ao salvar | o Nginx precisa repassar `Host $host` (já está no arquivo) |
| Faz login mas volta para a tela de login | `COOKIE_SECURE=true` sem HTTPS: termine o passo 8 ou teste por `https://` |
| Esqueceu a senha do administrador | `cd /opt/portal-myblue && sudo -u portal npm run criar-admin -- email@myblue.com.br "Nome"` |

---

## Alternativa: Apache em vez do Nginx

Use **um** dos dois. Nos passos 7 e 8, em vez do Nginx:

```bash
dnf -y install httpd mod_ssl
cp /opt/portal-myblue/deploy/almalinux/apache-portal.conf /etc/httpd/conf.d/portal-myblue.conf
setsebool -P httpd_can_network_connect 1
apachectl configtest
systemctl enable --now httpd

dnf -y install certbot python3-certbot-apache
certbot --apache -d portal.myblue.com.br --redirect --agree-tos -m ti@myblue.com.br
systemctl enable --now certbot-renew.timer
```

O `apache-portal.conf` já traz os mesmos ajustes do Nginx (cabeçalhos de 512 KB, envios de 200 MB, `ProxyPreserveHost` e `X-Forwarded-Proto`).
