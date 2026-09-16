#!/usr/bin/env bash
#
# Linux/WSL port of start-production.ps1 — production-style run: builds the
# frontend as static files, serves it (plus the backend API) behind nginx on
# one port, tunnels that port to the public internet with ngrok, then prints
# a QR code so a phone can scan straight in instead of anyone retyping a
# long ngrok-free.app URL.
#
# This is for demos/testing on your own machine, not a hardened production
# deployment — see deploy/README.md for the full picture (and its caveats
# about not putting real patient data through it).
#
# One-time setup this assumes:
#   - node/npm installed, `npm install` already run in backend/ and frontend/
#     (node_modules is gitignored and platform-specific — a Windows install
#     doesn't carry over to WSL/Linux, so this needs its own `npm install`).
#   - Each Python service (translate-service, transliterate-service,
#     voice-service) has its OWN Linux virtualenv at .venv/ — same reasoning
#     as node_modules: a Windows .venv (.venv/Scripts/...) is not usable from
#     Linux/WSL (.venv/bin/...). Create with, per service directory:
#       python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
#   - nginx and ngrok installed (e.g. `sudo apt install nginx` and ngrok via
#     its apt repo or a downloaded binary — see ngrok.com/download), ngrok
#     authtoken already saved (`ngrok config add-authtoken <token>`).
#
# Every service runs in the background with its output redirected to
# logs/*.log, each in its own process group (via setsid) so Ctrl+C can kill
# the whole tree — a plain `kill $pid` would leave npm's/uvicorn's child
# processes running orphaned, mirroring the tree-kill problem the Windows
# script solves with `taskkill /T`.
#
# Stays running once everything is up — press Ctrl+C to tear the whole
# stack down (every process this script started, plus nginx and ngrok).
#
# Run from the repo root: ./start-production.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

TRACKED_PIDS=()
TRACKED_NAMES=()

# Starts "$@" in workdir, backgrounded, in its own process group, with
# stdout/stderr redirected to logs/<name>.log / logs/<name>.err.log. Records
# the real PID (via a pidfile the child writes to itself before exec'ing —
# more reliable than `$!`, since some setsid builds fork internally and
# would otherwise leave us tracking the wrong PID).
start_background() {
    local name="$1" workdir="$2"
    shift 2
    local out_log="$LOG_DIR/$name.log"
    local err_log="$LOG_DIR/$name.err.log"
    local pid_file="$LOG_DIR/.$name.pid"
    rm -f "$pid_file"

    (
        cd "$workdir" || exit 1
        setsid bash -c 'echo $$ > "$0"; exec "$@"' "$pid_file" "$@" >"$out_log" 2>"$err_log" </dev/null &
    )

    local waited=0
    while [ ! -s "$pid_file" ] && [ "$waited" -lt 20 ]; do
        sleep 0.1
        waited=$((waited + 1))
    done

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -z "$pid" ]; then
        echo "  WARNING: couldn't determine PID for $name — it may not have started" >&2
    fi
    TRACKED_PIDS+=("$pid")
    TRACKED_NAMES+=("$name")
    echo "  -> logs: logs/$name.log / logs/$name.err.log"
}

get_ngrok_public_url() {
    local i resp url
    for i in $(seq 1 40); do
        resp="$(curl -s --max-time 2 http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)"
        if [ -n "$resp" ]; then
            url="$(printf '%s' "$resp" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    for t in data.get("tunnels", []):
        if t.get("proto") == "https":
            print(t.get("public_url", ""))
            break
except Exception:
    pass
' 2>/dev/null)"
            if [ -n "$url" ]; then
                printf '%s' "$url"
                return 0
            fi
        fi
        sleep 1
    done
    return 1
}

stop_everything() {
    echo
    echo "Shutting down..."

    local i pid name
    for i in "${!TRACKED_PIDS[@]}"; do
        pid="${TRACKED_PIDS[$i]}"
        [ -n "$pid" ] && kill -TERM -"$pid" 2>/dev/null
    done
    sleep 1
    for i in "${!TRACKED_PIDS[@]}"; do
        pid="${TRACKED_PIDS[$i]}"
        [ -n "$pid" ] && kill -KILL -"$pid" 2>/dev/null
    done

    "$ROOT/deploy/stop-nginx.sh" 2>/dev/null

    pkill -x ngrok 2>/dev/null

    echo "Everything stopped."
}
trap stop_everything EXIT INT TERM

echo "Checking Ollama is reachable on localhost:11434..."
if curl -s --max-time 3 http://127.0.0.1:11434 >/dev/null 2>&1; then
    echo "  OK — Ollama is running."
else
    echo "  WARNING: Ollama doesn't seem to be running. Start it before using the chat."
    echo "  (On WSL, this needs Ollama running on the Windows side with localhost forwarding — usually automatic on Windows 11.)"
fi

echo "Starting MongoDB (dev-mongo, persists to backend/.mongo-data)..."
start_background "mongo" "$ROOT/backend" node scripts/dev-mongo.js
sleep 3

echo "Starting backend (port 5000)..."
start_background "backend" "$ROOT/backend" npm run dev

echo "Starting translate-service (port 8020)..."
start_background "translate-service" "$ROOT/translate-service" "$ROOT/translate-service/.venv/bin/uvicorn" app.main:app --port 8020

echo "Starting transliterate-service (port 8030)..."
start_background "transliterate-service" "$ROOT/transliterate-service" "$ROOT/transliterate-service/.venv/bin/python" app/main.py

echo "Starting voice-service (port 8010)..."
start_background "voice-service" "$ROOT/voice-service" "$ROOT/voice-service/.venv/bin/uvicorn" app.main:app --port 8010

echo
echo "Building frontend for production (frontend/dist)..."
(cd "$ROOT/frontend" && npm run build)

echo
echo "Starting nginx (serves frontend/dist + proxies /api to the backend, port 8080)..."
"$ROOT/deploy/start-nginx.sh"
sleep 1

# A leftover ngrok from a previous run holds both the local :4040 API port
# and (on the free tier) the account's one-allowed concurrent tunnel session
# — starting a second instance on top of it produces a confusing mix of
# "which process is the poll below actually talking to" and occasional
# ERR_NGROK_108 (too many simultaneous sessions) failures.
if pgrep -x ngrok >/dev/null 2>&1; then
    echo "Stopping leftover ngrok process(es) from a previous run..."
    pkill -x ngrok
    sleep 1
fi

echo "Starting ngrok tunnel to http://localhost:8080..."
if ! command -v ngrok >/dev/null 2>&1; then
    echo "  WARNING: ngrok not found on PATH — skipping the public tunnel. Install it from ngrok.com/download." >&2
else
    start_background "ngrok" "$ROOT" ngrok http 8080

    echo "Waiting for ngrok to report its public URL..."
    if publicUrl="$(get_ngrok_public_url)"; then
        echo
        echo "========================================================="
        echo " Public URL: $publicUrl"
        echo "========================================================="
        node "$ROOT/backend/scripts/printQrCode.js" "$publicUrl"
    else
        echo
        echo "Couldn't detect the ngrok URL automatically."
        echo "Check http://localhost:4040 in a browser, or logs/ngrok.log for the 'Forwarding' line."
    fi
fi

echo
echo "All services are running in the background (see logs/*.log)."
echo "Give the Python services a minute to warm up their models before"
echo "using voice/translation features."
echo
echo "Press Ctrl+C to stop everything."
while true; do
    sleep 1
    for i in "${!TRACKED_PIDS[@]}"; do
        pid="${TRACKED_PIDS[$i]}"
        name="${TRACKED_NAMES[$i]}"
        if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
            echo
            echo "WARNING: a tracked process ($name, PID $pid) has stopped unexpectedly — check logs/$name.err.log"
            unset 'TRACKED_PIDS[i]'
        fi
    done
done
