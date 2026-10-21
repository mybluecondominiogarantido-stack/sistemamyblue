#!/usr/bin/env bash
# Prepara uma VPS nova (Ubuntu 24.04) para o Portal MyBlue. Roda uma vez, como root:
#   curl -fsSL https://raw.githubusercontent.com/mybluecondominiogarantido-stack/sistemamyblue/main/deploy/vps/preparar-servidor.sh | bash
# Pode rodar de novo sem estragar nada. Passo a passo completo em deploy/vps/LEIAME.md.
set -euo pipefail

PASTA=/opt/sistemamyblue
BACKUPS=/opt/myblue-backups
REPO=https://github.com/mybluecondominiogarantido-stack/sistemamyblue.git

[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }

echo "== Atualizando o sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw fail2ban unattended-upgrades python3
timedatectl set-timezone America/Sao_Paulo

echo "== Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "== Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== SSH: entrada só por chave (se já houver chave cadastrada)"
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-myblue.conf
  systemctl reload ssh
else
  echo "   Nenhuma chave em /root/.ssh/authorized_keys: a senha continua valendo. Cadastre a chave e rode de novo."
fi

echo "== Código do portal em $PASTA"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" fetch -q origin main
else
  git clone -q "$REPO" "$PASTA"
fi
if [ ! -f "$PASTA/.env" ]; then
  cp "$PASTA/.env.example" "$PASTA/.env"
  echo "   Criado $PASTA/.env a partir do exemplo: preencha antes de subir."
fi
chmod 600 "$PASTA/.env"

echo "== Backup diário (03:15) em $BACKUPS"
mkdir -p "$BACKUPS"
chown 1000:1000 "$BACKUPS"   # usuário "node" do container
chmod 700 "$BACKUPS"
cat > /etc/cron.d/myblue-backup <<CRON
15 3 * * * root cd $PASTA/deploy/vps && docker compose run --rm -T -v $BACKUPS:/backups portal node scripts/fazer-backup.js /backups --manter 14 >> /var/log/myblue-backup.log 2>&1
CRON

echo
echo "Pronto. Próximos passos (deploy/vps/LEIAME.md):"
echo "  1. nano $PASTA/.env        (DATABASE_URL, ANTHROPIC_API_KEY, M365_*, PORTAL_URL…)"
echo "  2. $PASTA/deploy/vps/atualizar.sh"
