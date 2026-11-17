
#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/plataforma-dev

: "${OPERACAO_IMAGE:?OPERACAO_IMAGE nao definida}"

SERVICE="operacao-service"
CONTAINER="plataforma-dev-operacao-service-1"
HEALTH_URL="http://127.0.0.1:3005/health/ready"

COMPOSE=(
  -f compose.yaml
  -f deploy/compose.apps.yaml
  -f deploy/compose.ghcr.yaml
)

# Descobre a imagem exata do container atual.
PREVIOUS_IMAGE_ID="$(
  docker inspect \
    --format '{{.Image}}' "$CONTAINER"
)"

echo "Imagem anterior: $PREVIOUS_IMAGE_ID"
echo "Nova imagem: $OPERACAO_IMAGE"

check_health() {
  for i in $(seq 1 30); do
    if curl --fail --silent --show-error \
      --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  echo "Iniciando rollback..."

  # Usa a imagem anterior preservada localmente.
  docker image inspect "$PREVIOUS_IMAGE_ID" >/dev/null

  export OPERACAO_IMAGE="$PREVIOUS_IMAGE_ID"

  docker compose "${COMPOSE[@]}" \
    up -d --no-deps --force-recreate "$SERVICE"

  if check_health; then
    echo "Rollback concluido: versao anterior restaurada."
  else
    echo "ERRO: rollback executado, mas a API nao ficou pronta."
    docker compose "${COMPOSE[@]}" \
      logs --tail=80 "$SERVICE" || true
    return 1
  fi
}

echo "Baixando nova imagem..."

docker compose "${COMPOSE[@]}" pull "$SERVICE"

echo "Atualizando container..."

if ! docker compose "${COMPOSE[@]}" \
  up -d --no-deps --force-recreate "$SERVICE"; then
  echo "Falha ao atualizar container."
  rollback
  exit 1
fi

echo "Validando API e MySQL..."

if check_health; then
  echo "Deploy concluido com sucesso."
  docker compose "${COMPOSE[@]}" ps "$SERVICE"
  exit 0
fi

echo "ERRO: nova versao nao passou no health check."

docker compose "${COMPOSE[@]}" \
  logs --tail=80 "$SERVICE" || true

rollback

# Mantem o job vermelho para indicar falha na nova versao.
exit 1
