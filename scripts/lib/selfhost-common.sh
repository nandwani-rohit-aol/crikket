ROOT_ENV_FILE="${ROOT_DIR}/.env"
SERVER_ENV_FILE="${ROOT_DIR}/apps/server/.env"
WEB_ENV_FILE="${ROOT_DIR}/apps/web/.env"

DOCKER_COMPOSE=()
COMPOSE_FILE_ARGS=()

info() {
  printf '[crikket] %s\n' "$1"
}

warn() {
  printf '[crikket] warning: %s\n' "$1" >&2
}

die() {
  printf '[crikket] error: %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  if ! command_exists "$1"; then
    die "Required command not found: $1"
  fi
}

read_env_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  awk -v key="$key" '
    $0 ~ "^[[:space:]]*" key "=" {
      line = $0
      sub(/^[^=]*=/, "", line)
      value = line
      found = 1
    }
    END {
      if (found == 1) {
        print value
      }
    }
  ' "$file_path"
}

default_value() {
  local file_path="$1"
  local key="$2"
  local fallback="${3:-}"
  local value

  value="$(read_env_value "$file_path" "$key" || true)"
  if [[ -n "$value" ]]; then
    printf '%s\n' "$value"
    return 0
  fi

  printf '%s\n' "$fallback"
}

ensure_selfhost_layout() {
  [[ -f "${ROOT_DIR}/docker-compose.yml" ]] || die "Run this script from the Crikket repository."
  [[ -f "${ROOT_DIR}/docker-compose.caddy.yml" ]] || die "Missing docker-compose.caddy.yml."
  [[ -f "${ROOT_DIR}/docker-compose.external-db.yml" ]] || die "Missing docker-compose.external-db.yml."
  [[ -f "$ROOT_ENV_FILE" ]] || die "Missing ${ROOT_ENV_FILE}. Run ./scripts/setup.sh first."
  [[ -f "$SERVER_ENV_FILE" ]] || die "Missing ${SERVER_ENV_FILE}. Run ./scripts/setup.sh first."
  [[ -f "$WEB_ENV_FILE" ]] || die "Missing ${WEB_ENV_FILE}. Run ./scripts/setup.sh first."
}

detect_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE=(docker compose)
    return 0
  fi

  if command_exists docker-compose; then
    DOCKER_COMPOSE=(docker-compose)
    return 0
  fi

  return 1
}

ensure_docker_access() {
  require_command docker
  detect_docker_compose || die "Docker Compose is required. Install Docker Compose v2 or docker-compose."

  if ! docker info >/dev/null 2>&1; then
    die "Docker is installed but the daemon is not reachable."
  fi
}

load_selfhost_mode() {
  PROXY_MODE="$(default_value "$ROOT_ENV_FILE" "CRIKKET_PROXY_MODE" "none")"
  DATABASE_MODE="$(default_value "$ROOT_ENV_FILE" "CRIKKET_DATABASE_MODE" "bundled")"

  if [[ "$DATABASE_MODE" == "external" ]]; then
    COMPOSE_FILE_ARGS=("-f" "docker-compose.external-db.yml")
  else
    COMPOSE_FILE_ARGS=("-f" "docker-compose.yml")
  fi

  if [[ "$PROXY_MODE" == "caddy" ]]; then
    COMPOSE_FILE_ARGS+=("-f" "docker-compose.caddy.yml")
  fi
}

compose_file_summary() {
  printf '%s\n' "${COMPOSE_FILE_ARGS[*]}"
}

compose_run() {
  "${DOCKER_COMPOSE[@]}" "${COMPOSE_FILE_ARGS[@]}" "$@"
}

is_bundled_postgres() {
  [[ "${DATABASE_MODE:-$(default_value "$ROOT_ENV_FILE" "CRIKKET_DATABASE_MODE" "bundled")}" == "bundled" ]]
}
