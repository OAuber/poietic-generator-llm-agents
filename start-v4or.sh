#!/usr/bin/env bash
# Demarre Poietic Generator + serveur IA V4or (variante de V4, OpenRouter).
# Usage : depuis la racine du depot : ./start-v4or.sh
# Calque sur start-v5.sh (Linux natif : localhost fiable, ext4).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CRYSTAL_DIR="$ROOT/.crystal-lang/crystal-1.20.1-1"
if [[ -d "$CRYSTAL_DIR/bin" ]]; then
  export PATH="$CRYSTAL_DIR/bin:$PATH"
fi
export PATH="${HOME}/.local/bin:${PATH}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Manquant : $1" >&2
    return 1
  }
}

resolve_python() {
  local venv_py="$ROOT/python/.venv/bin/python"
  if [[ -x "$venv_py" ]] && "$venv_py" -c "import fastapi, httpx" 2>/dev/null; then
    echo "$venv_py"; return 0
  fi
  if python3 -c "import fastapi, httpx" 2>/dev/null; then
    echo "python3"; return 0
  fi
  if python3 -m venv "$ROOT/python/.venv" 2>/dev/null; then
    "$ROOT/python/.venv/bin/pip" install -q -r "$ROOT/python/requirements-api.txt"
    echo "$venv_py"; return 0
  fi
  echo "" >&2
  echo "Dependances Python introuvables. Installez-les avec l'une des options :" >&2
  echo "  sudo apt install python3.12-venv && rm -rf python/.venv && ./start-v4or.sh" >&2
  echo "  python3 -m pip install --user --break-system-packages -r python/requirements-api.txt" >&2
  return 1
}

echo "=== Verifications ==="
need_cmd python3
need_cmd crystal || {
  echo "Crystal absent. Extrayez l'archive Crystal dans :" >&2
  echo "  $ROOT/.crystal-lang/crystal-1.20.1-1/" >&2
  exit 1
}

if ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
  echo "Aucun compilateur C (gcc/cc). Exemple (Debian/Ubuntu) :" >&2
  echo "  sudo apt install build-essential pkg-config libssl-dev libsqlite3-dev \\" >&2
  echo "    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev zlib1g-dev libpng-dev" >&2
  exit 1
fi

need_cmd pkg-config || { echo "Installez pkg-config : sudo apt install pkg-config" >&2; exit 1; }

PYTHON="$(resolve_python)" || exit 1
echo "Python : $PYTHON"

if [[ ! -f "$ROOT/bin/poietic-generator-api" || ! -f "$ROOT/bin/poietic-recorder" ]]; then
  echo "=== Compilation Crystal (shards build) ==="
  shards install
  shards build
fi

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "Attention : OPENROUTER_API_KEY non definie (export ou .env). Les appels LLM V4or echoueront." >&2
fi

cleanup() {
  echo ""
  echo "Arret des processus..."
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${REC_PID:-}" ]] && kill "$REC_PID" 2>/dev/null || true
  [[ -n "${V4OR_PID:-}" ]] && kill "$V4OR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=== Lancement serveur jeu (port 3001) ==="
"$ROOT/bin/poietic-generator-api" --port 3001 &
API_PID=$!

echo "=== Lancement recorder-server / player (port 3002) ==="
"$ROOT/bin/poietic-recorder" --port 3002 &
REC_PID=$!

echo "=== Lancement serveur IA V4or (port 8007) ==="
"$PYTHON" "$ROOT/python/poietic_ai_server_v4or.py" &
V4OR_PID=$!

echo ""
echo "Pret."
echo "  Jeu + fichiers statiques : http://localhost:3001/"
echo "  Client V4or              : http://localhost:3001/ai-player-v4or.html"
echo "  Client V4or (modele forcé): http://localhost:3001/ai-player-v4or.html?model=anthropic/claude-opus-4.8"
echo "  Player (rejeu)           : http://localhost:3002/player/  (ou http://localhost:3002/)"
echo "  API V4or                 : http://localhost:8007/docs"
echo "  Usage / cout             : http://localhost:8007/api/usage"
echo ""
echo "Ctrl+C pour tout arreter."
wait "$API_PID" "$REC_PID" "$V4OR_PID"
