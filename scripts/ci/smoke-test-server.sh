#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-process}"
IMAGE_TAG="${2:-increa-reader:ci}"
PORT="${PORT:-38080}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="${ROOT_DIR}/.tmp-ci-smoke.log"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
TREE_URL="http://127.0.0.1:${PORT}/api/workspace/tree"
SERVER_PYTHON="${SERVER_PYTHON:-${ROOT_DIR}/packages/server/.venv/bin/python}"
PID=""
CONTAINER_ID=""

resolve_server_python() {
  if [[ -x "${SERVER_PYTHON}" ]]; then
    printf '%s\n' "${SERVER_PYTHON}"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  echo "No usable Python interpreter found for server smoke test" >&2
  return 1
}

cleanup() {
  set +e
  if [[ -n "${PID}" ]] && kill -0 "${PID}" >/dev/null 2>&1; then
    kill "${PID}" >/dev/null 2>&1
    wait "${PID}" >/dev/null 2>&1
  fi
  if [[ -n "${CONTAINER_ID}" ]]; then
    docker rm -f "${CONTAINER_ID}" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

wait_for_server() {
  local attempts=60
  for ((i=1; i<=attempts; i++)); do
    if python3 - <<'PY' "${HEALTH_URL}" >/dev/null 2>&1
import json
import sys
from urllib.request import urlopen

url = sys.argv[1]
with urlopen(url, timeout=2) as response:
    payload = json.load(response)
assert payload["status"] == "healthy", payload
PY
    then
      return 0
    fi
    sleep 1
  done

  echo "Server did not become healthy in time" >&2
  if [[ -f "${LOG_FILE}" ]]; then
    echo "--- smoke log ---" >&2
    cat "${LOG_FILE}" >&2
  fi
  return 1
}

validate_workspace_tree() {
  python3 - <<'PY' "$1" "$2"
import json
import sys
from urllib.request import urlopen

url = sys.argv[1]
expected_repo = sys.argv[2]
with urlopen(url, timeout=5) as response:
    payload = json.load(response)

data = payload["data"]
assert isinstance(data, list), payload
assert data, payload
repo_names = {repo["name"] for repo in data}
assert expected_repo in repo_names, repo_names
print(f"workspace tree contains repo: {expected_repo}")
PY
}

run_process_mode() {
  local repo_path="${2:-${ROOT_DIR}}"
  local expected_repo
  local server_python
  expected_repo="$(basename "${repo_path}")"
  server_python="$(resolve_server_python)"

  rm -f "${LOG_FILE}"
  (
    cd "${ROOT_DIR}"
    PYTHONPATH="${ROOT_DIR}/packages/server${PYTHONPATH:+:${PYTHONPATH}}" \
      "${server_python}" packages/server/sidecar_entry.py --port "${PORT}" --repo "${repo_path}"
  ) >"${LOG_FILE}" 2>&1 &
  PID="$!"

  wait_for_server
  validate_workspace_tree "${TREE_URL}" "${expected_repo}"
}

run_container_mode() {
  local image_tag="${2:-${IMAGE_TAG}}"
  local expected_repo="app"

  CONTAINER_ID="$(docker run -d --rm -p "127.0.0.1:${PORT}:3000" -e INCREA_REPO=/app "${image_tag}")"
  wait_for_server
  validate_workspace_tree "${TREE_URL}" "${expected_repo}"
}

case "${MODE}" in
  process)
    run_process_mode "$@"
    ;;
  container)
    run_container_mode "$@"
    ;;
  *)
    echo "Usage: $0 [process [repo_path]|container [image_tag]]" >&2
    exit 1
    ;;
esac
