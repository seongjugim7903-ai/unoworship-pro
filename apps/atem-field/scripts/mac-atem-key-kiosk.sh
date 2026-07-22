#!/bin/bash
# =============================================================
# scripts/mac-atem-key-kiosk.sh
# ATEM 입력용 /atemsignal/key 자막 Key Source 화면 실행
#
# 목적:
#   - 일반 Chrome 주소창/탭이 ATEM 입력에 보이지 않게 함
#   - 기존 운영자 Chrome 세션과 분리된 별도 프로필 사용
#   - ATEM 5번 입력(Key Source)으로 들어가는 확장 화면 좌표에 배치
#
# 사용:
#   ./scripts/mac-atem-key-kiosk.sh
#   ATEM_KEY_DEBUG=1 ./scripts/mac-atem-key-kiosk.sh
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

ATEM_KEY_URL="${SERVER_URL}/atemsignal/key?mode=key"
if [ "${ATEM_KEY_DEBUG:-0}" = "1" ]; then
  ATEM_KEY_URL="${ATEM_KEY_URL}&test=1&debug=1"
fi

ATEM_KEY_PROFILE="${PROFILE_ATEM_KEY:-${PROFILE_DIR}/atem-key-profile}"
BROWSER_APP_NAME="Google Chrome"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  BROWSER_APP_NAME="Microsoft Edge"
fi

if [ ! -f "$CHROME_PATH" ]; then
  echo "Chrome/Edge를 찾지 못했습니다. 기본 브라우저로 엽니다."
  open "$ATEM_KEY_URL"
  exit 0
fi

mkdir -p "$ATEM_KEY_PROFILE"

# 이전 ATEM key 전용 Chrome만 종료한다. 운영자 개인 Chrome은 건드리지 않는다.
PREV_PIDS=$(pgrep -f "user-data-dir=${ATEM_KEY_PROFILE}" 2>/dev/null || true)
if [ -n "$PREV_PIDS" ]; then
  echo "기존 ATEM key 창 종료: $PREV_PIDS"
  echo "$PREV_PIDS" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

rm -rf "${ATEM_KEY_PROFILE}/SingletonLock" \
       "${ATEM_KEY_PROFILE}/SingletonCookie" \
       "${ATEM_KEY_PROFILE}/SingletonSocket" 2>/dev/null

echo "ATEM key 화면 실행"
echo "URL: ${ATEM_KEY_URL}"
echo "좌표: X=${MONITOR_ATEM_KEY_X}, Y=${MONITOR_ATEM_KEY_Y}, W=${MONITOR_ATEM_KEY_W}, H=${MONITOR_ATEM_KEY_H}"
echo "프로필: ${ATEM_KEY_PROFILE}"

open -na "${BROWSER_APP_NAME}" --args \
  --kiosk \
  --user-data-dir="${ATEM_KEY_PROFILE}" \
  --window-position=${MONITOR_ATEM_KEY_X},${MONITOR_ATEM_KEY_Y} \
  --window-size=${MONITOR_ATEM_KEY_W},${MONITOR_ATEM_KEY_H} \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --force-device-scale-factor=1 \
  --overscroll-history-navigation=0 \
  "${ATEM_KEY_URL}" \
  &

sleep 2
osascript <<APPLESCRIPT 2>/dev/null || true
tell application "System Events"
  tell process "${BROWSER_APP_NAME}"
    try
      set position of front window to {${MONITOR_ATEM_KEY_X}, ${MONITOR_ATEM_KEY_Y}}
      set size of front window to {${MONITOR_ATEM_KEY_W}, ${MONITOR_ATEM_KEY_H}}
    end try
  end tell
end tell
APPLESCRIPT

echo "ATEM key 창을 열었습니다. 브라우저 주소창이 보이면 Control+Command+F를 한 번 눌러 주세요."
