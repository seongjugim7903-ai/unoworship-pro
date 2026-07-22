#!/bin/bash
# UnoLive server watchdog
# Manual-launch companion: keeps the local dev server alive during worship use.

set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="${UNOLIVE_PROJECT_DIR:-/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field}"
SERVER_PORT="${SERVER_PORT:-3000}"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:${SERVER_PORT}}"
HEALTH_URL="${HEALTH_URL:-${SERVER_URL}/api/health}"
LOG_FILE="${UNOLIVE_WATCHDOG_LOG:-$HOME/Library/Logs/unolive-server-watchdog.log}"
SERVER_LOG="${UNOLIVE_SERVER_LOG:-$HOME/Library/Logs/unolive-atem-server.log}"
PID_FILE="${UNOLIVE_WATCHDOG_PID_FILE:-$HOME/Library/Logs/unolive-server-watchdog.pid}"

export PORT="${PORT:-$SERVER_PORT}"
export UNOLIVE_BIND_HOST="${UNOLIVE_BIND_HOST:-0.0.0.0}"
export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
export UNOLIVE_HEALTH_PUBLIC="${UNOLIVE_HEALTH_PUBLIC:-1}"
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"

mkdir -p "$HOME/Library/Logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

start_server() {
  cd "$PROJECT_DIR" || {
    log "ERROR: project not found: $PROJECT_DIR"
    return 1
  }

  local existing
  existing="$(lsof -ti:"$SERVER_PORT" 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    log "port ${SERVER_PORT} occupied while restarting: ${existing}"
    kill -9 $existing 2>/dev/null || true
    sleep 1
  fi

  log "starting server: npm run dev"
  nohup npm run dev >> "$SERVER_LOG" 2>&1 &
}

echo $$ > "$PID_FILE"
log "watchdog started pid=$$ health=${HEALTH_URL}"

misses=0
while true; do
  if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    misses=0
  else
    misses=$((misses + 1))
    log "health miss ${misses}/3"
  fi

  if [ "$misses" -ge 3 ]; then
    log "server appears down; restarting"
    start_server
    misses=0
    sleep 8
  else
    sleep 5
  fi
done
