#!/bin/bash
# ============================================================
# UnoLive PC1 아웃풋 실행 (더블클릭 진입점)
#
# 역할:
#   - 강대상 모니터에 /output 키오스크 띄우기
#   - 독립 프로필 사용 → 운영자 개인 Chrome 과 완전 격리
#
# 설치:
#   chmod +x scripts/pc1-start-mac.command
#   시스템 환경설정 → 일반 → 로그인 항목 → + → 이 파일 추가
#   또는 더블클릭으로 즉시 실행
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

OUTPUT_URL="${SERVER_URL}/output"

echo "UnoLive PC1 아웃풋 실행 중..."
echo "URL: ${OUTPUT_URL}"
echo "모니터 좌표: X=${MONITOR_OUTPUT_X}"
echo "프로필: ${PROFILE_OUTPUT} (운영자 개인 Chrome 과 격리)"

# Chrome 경로 확인
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
fi

if [ ! -f "$CHROME_PATH" ]; then
  echo "⚠️  Chrome/Edge 미탐지 — 기본 브라우저로 엽니다."
  open "${OUTPUT_URL}"
  exit 0
fi

# 기존 키오스크 프로필 잠금 정리
# 공유 런타임 프로필에서는 다른 UnoLive 창이 같은 프로필을 사용 중일 수 있으므로
# 잠금 파일을 건드리지 않는다.
if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" != "1" ]; then
  rm -rf "${PROFILE_OUTPUT}/SingletonLock" \
         "${PROFILE_OUTPUT}/SingletonCookie" \
         "${PROFILE_OUTPUT}/SingletonSocket" 2>/dev/null
fi

# Chrome 앱 키오스크 실행
"$CHROME_PATH" \
  --app="${OUTPUT_URL}" \
  --kiosk \
  --user-data-dir="${PROFILE_OUTPUT}" \
  --window-position=${MONITOR_OUTPUT_X},${MONITOR_OUTPUT_Y} \
  --window-size=${MONITOR_OUTPUT_W},${MONITOR_OUTPUT_H} \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  &

echo "✅ 강대상 모니터(X=${MONITOR_OUTPUT_X})에 아웃풋 창이 열렸습니다."
