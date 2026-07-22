#!/bin/bash
# =============================================================
# UnoLive-Compose-Start.command
# 개발 모드 원클릭 시작 + 제어 모니터를 컴포즈 에디터(/)로 열기
#
# 동작:
#   1. 기존 서버 프로세스 정리 (포트 3000)
#   2. 개발 서버 + watch 모드 시작
#   3. 서버 ready 대기 후 중상층(/sub), 강대상(/main) 키오스크 실행
#   4. 제어 모니터에는 컴포즈 에디터(/) 실행
#
# 종료:
#   터미널 창에서 Ctrl+C
# =============================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus"
fi

cd "$PROJECT_DIR" || { echo "Project folder not found: $PROJECT_DIR"; exit 1; }

# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/monitor-config.sh"

clear
echo "============================================"
echo "  UnoLive Compose mode start"
echo "============================================"
echo "  Project:   $PROJECT_DIR"
echo "  Server:    $SERVER_URL (LAN: http://$UNOLIVE_SERVER_LAN_IP:$SERVER_PORT)"
echo "  Control:   /"
echo "  SUB:       /sub"
echo "  MAIN:      /main"
echo "============================================"
echo ""

EXISTING=$(lsof -ti:$SERVER_PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "Stopping existing server (PID: $EXISTING)"
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

(
  COUNT=0
  until curl -s "$SERVER_URL" > /dev/null 2>&1; do
    sleep 1
    COUNT=$((COUNT + 1))
    [ $COUNT -ge 60 ] && { echo "[launcher] Server did not respond"; exit 1; }
  done

  echo ""
  echo "[launcher] Server ready ($COUNT s). Launching monitor windows..."

  if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" = "1" ]; then
    RUNTIME_PIDS=$(pgrep -f "user-data-dir=$PROFILE_RUNTIME" 2>/dev/null)
    if [ -n "$RUNTIME_PIDS" ]; then
      echo "[launcher] Closing existing UnoLive runtime windows: $RUNTIME_PIDS"
      echo "$RUNTIME_PIDS" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    rm -rf "${PROFILE_RUNTIME}/SingletonLock" \
           "${PROFILE_RUNTIME}/SingletonCookie" \
           "${PROFILE_RUNTIME}/SingletonSocket" 2>/dev/null
  fi

  "$PROJECT_DIR/scripts/mac-launch-monitors.sh" > /dev/null 2>&1
  sleep 2
  "$PROJECT_DIR/scripts/mac-launch-control.sh" / > /dev/null 2>&1

  echo "[launcher] Done."
  echo "  Control monitor: compose editor (/)"
  echo "  SUB monitor:   /sub"
  echo "  MAIN monitor:  /main"
  echo ""
) &

exec npm run dev:watch
