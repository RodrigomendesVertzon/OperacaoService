
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

NEW_IMAGE="$OPERACAO_IMAGE"

# Identifica e preserva a imagem atualmente em execucao.
PREVIOUS_IMAGE_ID="$(
  docker inspect --format '{{.Image}}' "$CONTAINER"
)"

docker image inspect "$PREVIOUS_IMAGE_ID" >/dev/null

# Referencia local exclusiva para esta execucao.
ROLLBACK_IMAGE="operacao-service:rollback-$$"

docker tag "$PREVIOUS_IMAGE_ID" "$ROLLBACK_IMAGE"

echo "=========================================="
echo "Iniciando deploy do Operacao Service"
echo "=========================================="
echo "Imagem anterior: $PREVIOUS_IMAGE_ID"
echo "Nova imagem: $NEW_IMAGE"

# Cria um override temporario para impedir pull
# da imagem local durante o rollback.
ROLLBACK_OVERRIDE="$(
  mktemp /opt/plataforma-dev/deploy/rollback-XXXXXX.yaml
)"

cat > "$ROLLBACK_OVERRIDE" <<'YAML'
services:
  operacao-service:
    pull_policy: never
YAML

cleanup() {
  rm -f "$ROLLBACK_OVERRIDE"
  docker image rm "$ROLLBACK_IMAGE" >/dev/null 2>&1 || true
}

trap cleanup EXIT

# Verifica a resposta HTTP e a imagem do container.
check_health() {
  local expected_image_id="$1"
  local current_image_id

  for i in $(seq 1 30); do
    current_image_id="$(
      docker inspect \
        --format '{{.Image}}' "$CONTAINER" 2>/dev/null || true
    )"

    if [[ "$current_image_id" == "$expected_image_id" ]] &&
       curl --fail --silent --show-error \
         --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi

    sleep 2
  done

  return 1
}

rollback() {
  echo "=========================================="
  echo "Iniciando rollback automatico"
  echo "=========================================="

  if ! docker image inspect "$PREVIOUS_IMAGE_ID" >/dev/null; then
    echo "ERRO: imagem anterior nao esta disponivel."
    return 1
  fi

  export OPERACAO_IMAGE="$ROLLBACK_IMAGE"

  echo "Restaurando imagem: $PREVIOUS_IMAGE_ID"

  if ! docker compose "${COMPOSE[@]}" \
    -f "$ROLLBACK_OVERRIDE" \
    up -d --no-deps --force-recreate --pull never "$SERVICE"; then
    echo "ERRO: falha ao recriar o container anterior."
    return 1
  fi

  echo "Validando restauracao da API e MySQL..."

  if check_health "$PREVIOUS_IMAGE_ID"; then
    echo "Rollback concluido com sucesso."
    docker compose "${COMPOSE[@]}" \
      -f "$ROLLBACK_OVERRIDE" ps "$SERVICE"
    return 0
  fi

  echo "ERRO: rollback executado, mas a API nao ficou pronta."

  docker compose "${COMPOSE[@]}" \
    -f "$ROLLBACK_OVERRIDE" logs --tail=80 "$SERVICE" || true

  return 1
}

echo "=========================================="
echo "Baixando nova imagem"
echo "=========================================="

export OPERACAO_IMAGE="$NEW_IMAGE"

if ! docker compose "${COMPOSE[@]}" pull "$SERVICE"; then
  echo "ERRO: nao foi possivel baixar a nova imagem."
  echo "O container anterior nao foi substituido."
  exit 1
fi

NEW_IMAGE_ID="$(docker image inspect \
  --format '{{.Id}}' "$NEW_IMAGE")"

echo "Nova imagem ID: $NEW_IMAGE_ID"

echo "=========================================="
echo "Atualizando container"
echo "=========================================="

if ! docker compose "${COMPOSE[@]}" \
  up -d --no-deps --force-recreate "$SERVICE"; then

  echo "ERRO: falha ao atualizar o container."

  if ! rollback; then
    echo "ERRO CRITICO: rollback tambem falhou."
  fi

  exit 1
fi

echo "=========================================="
echo "Validando API e MySQL"
echo "=========================================="

if check_health "$NEW_IMAGE_ID"; then
  echo "=========================================="
  echo "DEPLOY CONCLUIDO COM SUCESSO"
  echo "=========================================="

  docker compose "${COMPOSE[@]}" ps "$SERVICE"
  exit 0
fi

echo "ERRO: nova versao nao passou no health check."

docker compose "${COMPOSE[@]}" \
  logs --tail=80 "$SERVICE" || true

if ! rollback; then
  echo "ERRO CRITICO: rollback tambem falhou."
fi

# Mesmo com rollback bem-sucedido, o deploy
# defeituoso deve ser marcado como falha no GitHub.
exit 1
