#!/usr/bin/env bash
# Starts the ChronoOS Python engine and the Vite frontend together.
# Stops both when you press Ctrl+C or when either process exits.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${CHRONOOS_API_HOST:-127.0.0.1}"
PORT="${CHRONOOS_API_PORT:-8787}"
HEALTH_URL="http://${HOST}:${PORT}/api/health"
export CHRONOOS_API_PORT="$PORT"
export VITE_ENGINE_URL="http://${HOST}:${PORT}"

fail() {
  echo "error: $1" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || fail "python3 was not found. Install Python 3.9 or newer."
command -v node >/dev/null 2>&1 || fail "node was not found. Install Node.js 18 or newer."
command -v npm >/dev/null 2>&1 || fail "npm was not found. It normally ships with Node.js."

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT" && npm install) || fail "npm install failed."
fi

API_PID=""
WEB_PID=""

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "Stopping ChronoOS..."
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Stopped."
}
trap cleanup INT TERM EXIT

echo "Starting the Python engine on ${HOST}:${PORT}..."
(cd "$ROOT/backend" && exec python3 -m chronoos) &
API_PID=$!

for _ in $(seq 1 30); do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    fail "the engine exited during startup. Check the messages above; port ${PORT} may be in use."
  fi
  if command -v curl >/dev/null 2>&1 && curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! command -v curl >/dev/null 2>&1 || ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  fail "the engine did not answer its health check at ${HEALTH_URL}."
fi
echo "Engine is healthy at ${HEALTH_URL}."

echo "Starting the frontend..."
(cd "$ROOT" && exec npm run dev -- --host 127.0.0.1) &
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID" 2>/dev/null
echo "One of the processes exited."
exit 1
