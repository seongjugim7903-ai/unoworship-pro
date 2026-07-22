#!/bin/bash
# =============================================================
# scripts/mac-launch-cameras-source.sh
# 서버 Mac mini 에 /cameras-source 카메라 릴레이 페이지를 띄움
#
# 동작:
#   1. 서버 응답 대기
#   2. Chrome 창 준비
#   3. Chrome 키오스크 모드(또는 최소창)로 /cameras-source 실행
#   4. ATEM MultiView 캡처 장치를 자동 선택하여 WebRTC publish 시작
#
# 배치 권장:
#   - 제어 모니터(X=0)의 한쪽에 작은 창으로 배치 또는
#   - 백그라운드 탭으로 두고 Chrome 최소화
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

PROFILE="${PROFILE_CAMERAS:-$PROFILE_DIR/cameras-source-profile}"
mkdir -p "$PROFILE"

# 제어 모니터에 작게 띄움 (사용자가 원하면 resize/minimize 가능)
WIN_X=$((MONITOR_CONTROL_X + 100))
WIN_Y=$((MONITOR_CONTROL_Y + 100))
WIN_W=800
WIN_H=500

LOG_FILE="$HOME/Library/Logs/unolive-cameras.log"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

log "=== cameras-source 런처 시작 ==="

# 서버 응답 대기
COUNT=0
until curl -s "$SERVER_URL" > /dev/null 2>&1; do
  sleep 1; COUNT=$((COUNT+1))
  [ $COUNT -ge 60 ] && { log "ERROR: 서버 미응답"; exit 1; }
done
log "서버 OK"

# 이전 인스턴스 선택 종료
# 공유 런타임 프로필에서는 제어/아웃풋/프롬프트 창도 같은 프로필을 쓰므로
# 개별 런처에서 죽이지 않고 시작 커맨드에서 한 번만 정리한다.
if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" != "1" ]; then
  PIDS=$(pgrep -f "user-data-dir=$PROFILE" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    log "이전 인스턴스 종료: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  # Singleton 잠금 정리
  rm -rf "$PROFILE/SingletonLock" "$PROFILE/SingletonCookie" "$PROFILE/SingletonSocket" 2>/dev/null
else
  log "공유 런타임 프로필 사용 — 기존 창 종료/잠금 정리는 시작 커맨드에 위임"
fi

# Chrome 실행 — 일반 창 모드 (작게, 기본 Chrome UI 최소화)
log "Chrome 실행 (카메라 릴레이)"
open -na "Google Chrome" --args \
  --app="${SERVER_URL}/cameras-source" \
  --window-position=${WIN_X},${WIN_Y} \
  --window-size=${WIN_W},${WIN_H} \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --use-fake-ui-for-media-stream

sleep 2
NEW_PID=$(pgrep -f "user-data-dir=$PROFILE" 2>/dev/null | head -1)
if [ -n "$NEW_PID" ]; then
  log "✅ 카메라 릴레이 실행 (PID: $NEW_PID)"
  echo "✅ 카메라 릴레이 창이 제어 모니터에 떴습니다."
  echo "   이 창은 배경에 떠 있기만 하면 되고, 최소화해도 스트림은 유지됩니다."
else
  log "⚠️  프로세스 미탐지"
fi
