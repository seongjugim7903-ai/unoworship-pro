#!/bin/bash
# =============================================================
# scripts/mac-launch-control.sh
# 제어 모니터(X=0)에 운영자용 에디터 Chrome 창을 "핀"
#
# 해결하는 문제:
#   - macOS 가 새 창을 엉뚱한 모니터(강대상/중층) 에 띄워서
#     기존 키오스크 창이 밀려나는 현상
#   - 제어 모니터에서만 작업하고 싶은데 창이 제멋대로 이동
#
# 해결 방법:
#   - 독립 프로필(--user-data-dir) + 위치 강제(--window-position)
#   - 운영자 개인 Chrome 과 분리 → 개인 세션/로그인 유지
#   - AppleScript 로 실행 후 메인 모니터 쪽에 핀
#
# 사용법:
#   ./scripts/mac-launch-control.sh           # 에디터 페이지(/)
#   ./scripts/mac-launch-control.sh /output   # 다른 경로 지정
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

# URL 경로 인자 (기본값: / — 제어 모니터 콤포우즈 에디터)
URL_PATH="${1:-/}"
TARGET_URL="${SERVER_URL}${URL_PATH}"

LOG_FILE="$HOME/Library/Logs/unolive-control.log"
mkdir -p "$HOME/Library/Logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== 제어 모니터 Chrome 실행 ==="
log "URL: $TARGET_URL"
log "위치: X=${MONITOR_CONTROL_X}, Y=${MONITOR_CONTROL_Y}"

# ── 서버 응답 대기 (최대 30초) ────────────────────────────────
COUNT=0
until curl -s "$SERVER_URL" > /dev/null 2>&1; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge 30 ]; then
    log "⚠️  서버 미응답 — 그래도 창은 엽니다"
    break
  fi
done

# ── 이전 제어 프로필 인스턴스 선택 종료 ──────────────────────
#   공유 런타임 프로필에서는 프롬프트/아웃풋/카메라 릴레이도 같은 프로필을 쓰므로
#   개별 런처가 프로필 프로세스를 죽이지 않는다. 시작 커맨드에서 한 번만 정리한다.
if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" != "1" ]; then
  CTRL_PIDS=$(pgrep -f "user-data-dir=$PROFILE_CONTROL" 2>/dev/null)
  if [ -n "$CTRL_PIDS" ]; then
    log "이전 제어 창 종료 (PIDs: $CTRL_PIDS)"
    echo "$CTRL_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  # ── 잠금 정리 ───────────────────────────────────────────────
  rm -rf "${PROFILE_CONTROL}/SingletonLock" \
         "${PROFILE_CONTROL}/SingletonCookie" \
         "${PROFILE_CONTROL}/SingletonSocket" 2>/dev/null
else
  log "공유 런타임 프로필 사용 — 기존 창 종료/잠금 정리는 시작 커맨드에 위임"
fi

# ── Chrome 실행 (독립 프로필 + 위치/크기 강제) ───────────────
# 일반 창 모드 (kiosk 아님) — 운영자는 주소창/북마크 필요
open -na "Google Chrome" --args \
  --user-data-dir="${PROFILE_CONTROL}" \
  --window-position=${MONITOR_CONTROL_X},${MONITOR_CONTROL_Y} \
  --window-size=${MONITOR_CONTROL_W},${MONITOR_CONTROL_H} \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  "$TARGET_URL"

sleep 2

# ── AppleScript 로 제어 모니터 쪽에 한 번 더 핀 ───────────────
# 간혹 --window-position 이 Spaces 설정에 의해 무시될 때를 대비
osascript <<APPLESCRIPT 2>/dev/null
tell application "System Events"
  tell process "Google Chrome"
    try
      set position of front window to {${MONITOR_CONTROL_X}, ${MONITOR_CONTROL_Y}}
      set size of front window to {${MONITOR_CONTROL_W}, ${MONITOR_CONTROL_H}}
    end try
  end tell
end tell
APPLESCRIPT

log "✅ 제어 모니터에 창 고정 완료"
echo ""
echo "✅ 제어 모니터(X=${MONITOR_CONTROL_X})에 창이 고정되었습니다."
echo "   프로필: ${PROFILE_CONTROL}"
echo "   운영자 개인 Chrome 에는 영향 없음."
