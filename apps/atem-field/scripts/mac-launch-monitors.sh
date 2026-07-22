#!/bin/bash
# =============================================================
# scripts/mac-launch-monitors.sh
# 두 확장 모니터(SUB/중상층 + MAIN/강대상) 키오스크를 한 번에 띄우는 통합 런처
#
# 사용법:
#   ./scripts/mac-launch-monitors.sh          # 즉시 실행
#   ./scripts/mac-launch-monitors.sh --boot   # 부팅 자동 실행 (Dock/디스플레이 안정화 대기)
#
# 동작 순서:
#   1. (--boot) Dock/디스플레이 안정화 대기
#   2. 서버(:3000) 응답 확인
#   3. sub 키오스크 실행 (중상층, X=1920)
#   4. main 키오스크 실행 (강대상, X=3840)
#
# ⚠️ 운영자 개인 Chrome 은 건드리지 않습니다.
#    기본값은 UnoLive 공유 런타임 프로필(--user-data-dir) 을 사용해
#    제어창 로그인 세션을 SUB/MAIN/카메라 릴레이가 함께 읽습니다.
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

LOG_FILE="$HOME/Library/Logs/unolive-monitors.log"
mkdir -p "$HOME/Library/Logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== launch-monitors 시작 (args: $*) ==="

# ── 부팅 모드: 데스크톱/디스플레이 안정화 대기 ───────────────
if [ "$1" = "--boot" ]; then
  DOCK_WAIT=0
  while ! pgrep -x "Dock" > /dev/null 2>&1; do
    sleep 1
    DOCK_WAIT=$((DOCK_WAIT + 1))
    if [ $DOCK_WAIT -ge 120 ]; then
      log "ERROR: Dock 미탐지 (120s 초과)"
      exit 1
    fi
  done
  log "Dock ready (${DOCK_WAIT}s)"
  sleep 15
  log "디스플레이 안정화 대기 완료"
fi

# ── 서버 응답 대기 (최대 90초) ────────────────────────────────
MAX_WAIT=90
COUNT=0
log "서버 대기 중... ($SERVER_URL)"
until curl -s "$SERVER_URL" > /dev/null 2>&1; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_WAIT ]; then
    log "ERROR: 서버 미응답 (${MAX_WAIT}s)"
    exit 1
  fi
done
log "서버 OK (${COUNT}s)"

# ── 1) SUB / 중상층 모니터 (/sub) ────────────────────────────
log "SUB / 중상층 키오스크 실행..."
"$SCRIPT_DIR/mac-prompt-kiosk.sh" >> "$LOG_FILE" 2>&1 &
sleep 3

# ── 2) MAIN / 강대상 모니터 (/main) ──────────────────────────
log "MAIN / 강대상 키오스크 실행..."
"$SCRIPT_DIR/mac-output-kiosk.sh" >> "$LOG_FILE" 2>&1 &
sleep 2

# ── 3) [CAMERAS_RELAY] 카메라 릴레이 (/cameras-source) ─────
#   ATEM MultiView 를 USB HDMI 캡처로 받아 WebRTC 로 원격 composer 에 송출.
#   존재하지 않거나 실패해도 메인 런칭에는 영향 없도록 백그라운드 실행.
if [ -x "$SCRIPT_DIR/mac-launch-cameras-source.sh" ]; then
  log "카메라 릴레이 실행..."
  "$SCRIPT_DIR/mac-launch-cameras-source.sh" >> "$LOG_FILE" 2>&1 &
fi

log "=== launch-monitors 완료 ==="
echo "✅ 두 모니터 키오스크 실행 요청 전송 완료"
echo "   SUB / 중상층: X=${MONITOR_PROMPT_X}"
echo "   MAIN / 강대상: X=${MONITOR_OUTPUT_X}"
