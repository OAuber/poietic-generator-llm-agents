#!/usr/bin/env bash
# Demarre Poietic Generator + serveur IA V5 (O-N-W) + serveur de metriques V5.
# V5 route ses appels LLM via OpenRouter (OPENROUTER_API_KEY).
# Usage : depuis la racine du depot : ./start-v5.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CRYSTAL_DIR="$ROOT/.crystal-lang/crystal-1.20.1-1"
if [[ -d "$CRYSTAL_DIR/bin" ]]; then
  export PATH="$CRYSTAL_DIR/bin:$PATH"
fi
export PATH="${HOME}/.local/bin:${PATH}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Manquant : $1" >&2; return 1; }
}

resolve_python() {
  local venv_py="$ROOT/python/.venv/bin/python"
  if [[ -x "$venv_py" ]] && "$venv_py" -c "import fastapi, httpx, websockets" 2>/dev/null; then
    echo "$venv_py"; return 0
  fi
  if python3 -c "import fastapi, httpx, websockets" 2>/dev/null; then
    echo "python3"; return 0
  fi
  if python3 -m venv "$ROOT/python/.venv" 2>/dev/null; then
    "$ROOT/python/.venv/bin/pip" install -q -r "$ROOT/python/requirements-api.txt"
    echo "$venv_py"; return 0
  fi
  echo "Dependances Python introuvables (fastapi/httpx/websockets)." >&2
  echo "  python3 -m pip install --user --break-system-packages -r python/requirements-api.txt" >&2
  return 1
}

echo "=== Verifications ==="
need_cmd python3
need_cmd crystal || { echo "Crystal absent (.crystal-lang/crystal-1.20.1-1/)." >&2; exit 1; }
if ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
  echo "Aucun compilateur C (gcc/cc) : sudo apt install build-essential pkg-config libssl-dev libsqlite3-dev libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev zlib1g-dev libpng-dev" >&2
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
  set -a; # shellcheck source=/dev/null
  source "$ROOT/.env"; set +a
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "Attention : OPENROUTER_API_KEY non definie (export ou .env). Les appels LLM V5 echoueront." >&2
fi

cleanup() {
  echo ""; echo "Arret des processus..."
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${REC_PID:-}" ]] && kill "$REC_PID" 2>/dev/null || true
  [[ -n "${METRICS_PID:-}" ]] && kill "$METRICS_PID" 2>/dev/null || true
  [[ -n "${V5_PID:-}" ]] && kill "$V5_PID" 2>/dev/null || true
  [[ -n "${PIPER_PID:-}" ]] && kill "$PIPER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=== Lancement serveur jeu (port 3001) ==="
"$ROOT/bin/poietic-generator-api" --port 3001 &
API_PID=$!

echo "=== Lancement recorder-server / player (port 3002) ==="
"$ROOT/bin/poietic-recorder" --port 3002 &
REC_PID=$!

echo "=== Lancement serveur de metriques V5 (port 5005) ==="
"$PYTHON" "$ROOT/python/metrics_server_v5.py" &
METRICS_PID=$!

echo "=== Lancement serveur IA V5 O-N (port 8005) ==="
"$PYTHON" "$ROOT/python/poietic_ai_server_v5.py" &
V5_PID=$!

echo "=== Lancement TTS Piper (port 5012, optionnel) ==="
"$PYTHON" "$ROOT/python/tts_piper_server.py" &
PIPER_PID=$!

echo ""
echo "Pret."
echo "  Jeu + fichiers statiques : http://localhost:3001/"
echo "  Client V5                : http://localhost:3001/ai-player-v5.html"
echo "  Narrative viewer (TTS)   : http://localhost:3001/narrative-viewer.html"
echo "  Tableau parlant live     : http://localhost:3001/tableau-parlant-live.html"
echo "  Player (rejeu)           : http://localhost:3002/player/"
echo "  Dashboard metriques V5   : http://localhost:3001/ai-metrics.html"
echo "  API V5 (O-N)             : http://localhost:8005/docs"
echo "  Metriques V5 (WS)        : ws://localhost:5005/metrics"
echo "  Enonces / export (HTTP)  : http://localhost:5010/api/utterances/..."
echo "  Piper TTS                : http://localhost:5012/health"
echo ""
echo "Ctrl+C pour tout arreter."
wait "$API_PID" "$REC_PID" "$METRICS_PID" "$V5_PID" "$PIPER_PID"
