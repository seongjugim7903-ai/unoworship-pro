#!/bin/bash
# scripts/mac-atem-sub-kiosk.sh
# 현재 방식(3→ATEM): 무대(sub) 화면 /atem-sub 를 ATEM 입력6 용 확장 화면에 키오스크로.
#   - prompt 타깃(검정+흰 큰 글자 등)을 그대로 출력 → ATEM 입력6 → Out2(무대 모니터)
#   - fill/key 키오스크와 동일 패턴(별도 프로필 + AppleScript 위치 강제)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

ATEM_SUB_URL="${SERVER_URL}/atem-sub"

# 좌표: 오케스트레이터가 MONITOR_ATEM_SUB_* 를 env로 주입. 없으면 기본값.
SUB_X="${MONITOR_ATEM_SUB_X:-3840}"
SUB_Y="${MONITOR_ATEM_SUB_Y:-0}"
SUB_W="${MONITOR_ATEM_SUB_W:-1920}"
SUB_H="${MONITOR_ATEM_SUB_H:-1080}"

ATEM_SUB_PROFILE="${PROFILE_DIR}/atem-sub-profile"
BROWSER_APP_NAME="Google Chrome"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  BROWSER_APP_NAME="Microsoft Edge"
fi
if [ ! -f "$CHROME_PATH" ]; then
  echo "Chrome/Edge를 찾지 못했습니다. 기본 브라우저로 엽니다."
  open "$ATEM_SUB_URL"
  exit 0
fi

mkdir -p "$ATEM_SUB_PROFILE"

# 이전 sub 전용 창만 종료 (운영자 개인 Chrome은 건드리지 않음)
PREV_PIDS=$(pgrep -f "user-data-dir=${ATEM_SUB_PROFILE}" 2>/dev/null || true)
if [ -n "$PREV_PIDS" ]; then
  echo "기존 ATEM sub 창 종료: $PREV_PIDS"
  echo "$PREV_PIDS" | xargs kill -9 2>/dev/null || true
  sleep 1
fi
rm -rf "${ATEM_SUB_PROFILE}/SingletonLock" \
       "${ATEM_SUB_PROFILE}/SingletonCookie" \
       "${ATEM_SUB_PROFILE}/SingletonSocket" 2>/dev/null

echo "ATEM sub 화면 실행 — URL: ${ATEM_SUB_URL} / 좌표: X=${SUB_X},Y=${SUB_Y},W=${SUB_W},H=${SUB_H}"

open -na "${BROWSER_APP_NAME}" --args \
  --kiosk \
  --user-data-dir="${ATEM_SUB_PROFILE}" \
  --window-position=${SUB_X},${SUB_Y} \
  --window-size=${SUB_W},${SUB_H} \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --force-device-scale-factor=1 \
  --overscroll-history-navigation=0 \
  "${ATEM_SUB_URL}" \
  &

sleep 2
osascript <<APPLESCRIPT 2>/dev/null || true
tell application "System Events"
  tell process "${BROWSER_APP_NAME}"
    try
      set position of front window to {${SUB_X}, ${SUB_Y}}
      set size of front window to {${SUB_W}, ${SUB_H}}
    end try
  end tell
end tell
APPLESCRIPT

echo "ATEM sub 창을 열었습니다."
