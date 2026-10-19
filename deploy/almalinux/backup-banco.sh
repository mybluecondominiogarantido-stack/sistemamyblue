#!/usr/bin/env bash
# Backup diário do banco do portal (formato do pg_restore), guardando os últimos DIAS dias.
#   sudo /opt/portal-myblue/deploy/almalinux/backup-banco.sh
set -euo pipefail
BANCO=${BANCO:-portal_myblue}
PASTA=${PASTA:-/var/backups/portal-myblue}
DIAS=${DIAS:-14}
PGBIN=${PGBIN:-/usr/pgsql-17/bin}

install -d -m 700 -o postgres -g postgres "$PASTA"
ARQ="$PASTA/$BANCO-$(date +%Y%m%d-%H%M).dump"
runuser -u postgres -- "$PGBIN/pg_dump" -Fc -d "$BANCO" -f "$ARQ"
find "$PASTA" -name "$BANCO-*.dump" -mtime +"$DIAS" -delete
echo "Backup gravado em $ARQ"
