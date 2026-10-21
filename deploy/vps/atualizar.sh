#!/usr/bin/env bash
# Publica no ar a última versão do branch main, só se os testes do GitHub passaram nela.
# Se o portal novo não ficar saudável em 2 minutos, volta sozinho para a versão anterior.
#   /opt/sistemamyblue/deploy/vps/atualizar.sh                 (versão mais recente do main)
#   /opt/sistemamyblue/deploy/vps/atualizar.sh <commit>        (uma versão específica, ex.: para voltar atrás)
#   /opt/sistemamyblue/deploy/vps/atualizar.sh --sem-conferir-testes
set -euo pipefail

# Tudo entre chaves: o bash lê o script inteiro antes de rodar, porque o checkout abaixo troca este próprio arquivo.
{

cd "$(dirname "$0")"
RAIZ=$(git rev-parse --show-toplevel)
REPO_API=https://api.github.com/repos/mybluecondominiogarantido-stack/sistemamyblue

CONFERIR=1
ALVO=origin/main
for a in "$@"; do
  case "$a" in
    --sem-conferir-testes) CONFERIR=0 ;;
    *) ALVO=$a ;;
  esac
done

git -C "$RAIZ" fetch -q origin main
NOVO=$(git -C "$RAIZ" rev-parse "$ALVO^{commit}")
ANTERIOR=$(git -C "$RAIZ" rev-parse HEAD)

if [ "$CONFERIR" = 1 ]; then
  echo "== Conferindo os testes do GitHub em ${NOVO:0:7}"
  SITUACAO=$(curl -fsS -H 'Accept: application/vnd.github+json' "$REPO_API/commits/$NOVO/check-runs" | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
testes = [r for r in runs if r["name"] == "testes"]
if not testes: print("sem-testes")
elif any(r["status"] != "completed" for r in testes): print("rodando")
elif all(r["conclusion"] == "success" for r in testes): print("verde")
else: print("vermelho")')
  case "$SITUACAO" in
    verde) echo "   testes verdes" ;;
    rodando) echo "   Os testes ainda estão rodando no GitHub (aba Actions). Tente de novo em alguns minutos."; exit 1 ;;
    sem-testes) echo "   Este commit não tem resultado de testes no GitHub."; exit 1 ;;
    *) echo "   Os testes FALHARAM neste commit: não vai para o ar."; exit 1 ;;
  esac
fi

saudavel() {
  local id
  for _ in $(seq 1 24); do
    id=$(docker compose ps -q portal)
    [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" = healthy ] && return 0
    sleep 5
  done
  return 1
}

publicar() {
  git -C "$RAIZ" -c advice.detachedHead=false checkout -q --detach "$1"
  docker compose up -d --build --remove-orphans
}

echo "== Publicando ${NOVO:0:7} (antes: ${ANTERIOR:0:7})"
publicar "$NOVO"
if saudavel; then
  docker image prune -f >/dev/null
  echo "== No ar: $(git -C "$RAIZ" log -1 --format='%h %s')"
else
  echo "== O portal não respondeu em /saude. Últimas linhas do log:"
  docker compose logs --tail 40 portal || true
  echo "== Voltando para ${ANTERIOR:0:7}"
  publicar "$ANTERIOR"
  saudavel && echo "   Versão anterior de volta no ar." || echo "   A versão anterior também não subiu: confira o .env e o log (docker compose logs portal)."
  exit 1
fi
exit 0
}
