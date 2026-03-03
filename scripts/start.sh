#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

# shellcheck source=./lib/selfhost-common.sh
source "${SCRIPT_DIR}/lib/selfhost-common.sh"

main() {
  info "Crikket start"
  ensure_selfhost_layout
  ensure_docker_access
  load_selfhost_mode

  if [[ "$#" -eq 0 ]]; then
    info "Starting all services..."
    compose_run up -d
  else
    info "Starting services: $*"
    compose_run up -d "$@"
  fi

  compose_run ps
}

main "$@"
