#!/usr/bin/env bash
# Atualiza o portal com o que está no branch do GitHub e reinicia o serviço.
#   sudo /opt/portal-myblue/deploy/almalinux/atualizar.sh
set -euo pipefail
cd /opt/portal-myblue
sudo -u portal git pull --ff-only
sudo -u portal npm ci --omit=dev
systemctl restart portal-myblue
sleep 3
curl -fsS http://127.0.0.1:3000/saude && echo
