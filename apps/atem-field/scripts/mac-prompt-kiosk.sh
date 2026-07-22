#!/bin/bash
# =============================================================
# scripts/mac-prompt-kiosk.sh
# SUB / 중상층 모니터(LG FULL HD #1)에 /sub 키오스크 전체화면 자동 실행
#
# mac-output-kiosk.sh 와 동일한 구조이며, 다른 점:
#   - URL:  /sub
#   - 프로필: /tmp/unolive-prompt-profile (output 과 독립)
#   - 모니터: X=0 (1번째 모니터 — 프롬프트/중층)
#
# 사용법:
#   ./scripts/mac-prompt-kiosk.sh          # 일반 실행
#   ./scripts/mac-prompt-kiosk.sh --boot   # 부팅 시 자동 실행
#
# ── 설정 ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

PORT=$SERVER_PORT
PROMPT_URL="${SERVER_URL}/sub"
KIOSK_PROFILE="$PROFILE_PROMPT"
MONITOR_X=$MONITOR_PROMPT_X
MONITOR_Y=$MONITOR_PROMPT_Y
MONITOR_W=$MONITOR_PROMPT_W
MONITOR_H=$MONITOR_PROMPT_H
# =============================================================

LOG_FILE="$HOME/Library/Logs/unolive-prompt-kiosk.log"
mkdir -p "$HOME/Library/Logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Prompt kiosk script started (args: $*) ==="

# ── 부팅 모드일 때만 디스플레이 안정화 대기 ─────────────────
if [ "$1" = "--boot" ]; then
  DOCK_WAIT=0
  while ! pgrep -x "Dock" > /dev/null 2>&1; do
    sleep 1
    DOCK_WAIT=$((DOCK_WAIT + 1))
    if [ $DOCK_WAIT -ge 120 ]; then
      log "ERROR: Desktop not ready after 120s"
      exit 1
    fi
  done
  log "Desktop ready (Dock detected after ${DOCK_WAIT}s)"

  # 디스플레이 배치 안정화 대기
  sleep 15
  log "Display stabilization complete"
fi

# ── 서버 응답 대기 (최대 60초) ────────────────────────────────
MAX_WAIT=60
COUNT=0
log "Waiting for server on port $PORT..."
until curl -s "http://localhost:$PORT" > /dev/null 2>&1; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_WAIT ]; then
    log "ERROR: Server not responding after ${MAX_WAIT}s"
    echo "❌ 서버가 응답하지 않습니다. npm run dev 가 실행 중인지 확인하세요."
    exit 1
  fi
done
log "Server OK (waited ${COUNT}s)"

# ── 이전 프롬프트 키오스크 인스턴스만 선택적 종료 ────────────
# 공유 런타임 프로필에서는 이 프로필에 제어/아웃풋/카메라 창도 함께 있으므로
# 개별 런처에서 죽이지 않고 시작 커맨드에서 한 번만 정리한다.
if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" != "1" ]; then
  KIOSK_PIDS=$(pgrep -f "user-data-dir=$KIOSK_PROFILE" 2>/dev/null)
  if [ -n "$KIOSK_PIDS" ]; then
    log "Terminating previous prompt kiosk instance (PIDs: $KIOSK_PIDS)"
    echo "$KIOSK_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 2
  fi

  # ── 키오스크 프로필 잠금 파일 정리 ──────────────────────────
  rm -rf "${KIOSK_PROFILE}/SingletonLock" \
         "${KIOSK_PROFILE}/SingletonCookie" \
         "${KIOSK_PROFILE}/SingletonSocket" 2>/dev/null
else
  log "Shared runtime profile — skip per-window kill/lock cleanup"
fi

# ── Chrome 키오스크 모드 실행 ─────────────────────────────────
# open -na : 기존 Chrome / Output 키오스크와 별개의 새 인스턴스로 실행
log "Launching Chrome prompt kiosk on monitor X=${MONITOR_X}..."

open -na "Google Chrome" --args \
  --kiosk \
  --window-position=${MONITOR_X},${MONITOR_Y} \
  --window-size=${MONITOR_W},${MONITOR_H} \
  --user-data-dir="$KIOSK_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  "$PROMPT_URL"

sleep 2

# ── 실행 확인 ─────────────────────────────────────────────────
NEW_PID=$(pgrep -f "user-data-dir=$KIOSK_PROFILE" 2>/dev/null | head -1)
if [ -n "$NEW_PID" ]; then
  log "✅ Chrome prompt kiosk launched (PID: $NEW_PID)"
  echo "✅ SUB 키오스크 실행 완료 — 중상층 모니터(왼쪽)에 출력 중"
else
  log "⚠️  Chrome process not found — may have merged with existing instance"
  echo "⚠️  Chrome이 실행되었지만 별도 프로세스로 감지되지 않습니다."
  echo "   SUB / 중상층 모니터를 확인해 주세요."
fi

log "=== Prompt kiosk setup complete ==="
