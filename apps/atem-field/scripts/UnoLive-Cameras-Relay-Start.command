#!/bin/bash
# 카메라 릴레이 실행 — /cameras-source 창을 열어 캡처(FEELWORLD 등)를 컴포즈 카메라 그리드로 중계.
#   FEELWORLD USB가 맥에 잡혀 있으면 자동 선택·자동 시작된다 (수동 클릭 불필요).
#   창을 닫으면 릴레이도 꺼진다. 전체 종료는 UnoLive-Stop.command.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SERVER_URL="http://localhost:3000"
if ! curl -s "$SERVER_URL" >/dev/null 2>&1; then
  osascript -e 'display dialog "서버가 실행 중이 아닙니다. 먼저 3화면 실행(또는 개발서버 실행)을 하세요." buttons {"확인"} with icon caution'
  exit 1
fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -f "$CHROME" ] || { osascript -e 'display dialog "Google Chrome 이 없습니다." buttons {"확인"} with icon caution'; exit 1; }

PROF="$HOME/Library/UnoLive/atem-cameras-profile"
mkdir -p "$PROF"
# 이전 릴레이 창 정리
PREV=$(pgrep -f "user-data-dir=$PROF" 2>/dev/null || true)
[ -n "$PREV" ] && { echo "$PREV" | xargs kill -9 2>/dev/null || true; sleep 1; }
rm -rf "$PROF/SingletonLock" "$PROF/SingletonCookie" "$PROF/SingletonSocket" 2>/dev/null

echo "카메라 릴레이 창 실행 — ${SERVER_URL}/cameras-source"
# --use-fake-ui-for-media-stream: 카메라 권한 팝업 자동 허용 (릴레이 무인 기동용)
nohup "$CHROME" \
  --app="${SERVER_URL}/cameras-source" \
  --user-data-dir="$PROF" \
  --window-size=820,560 --window-position=60,60 \
  --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs \
  --disable-session-crashed-bubble --disable-restore-session-state \
  --use-fake-ui-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  --disable-backgrounding-occluded-windows \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  >>"$HOME/Library/Logs/unolive-chrome.log" 2>&1 &

echo "✅ 릴레이 창이 열렸습니다. 컴포즈 우측 '카메라 1~4'에서 수신을 확인하세요."
sleep 2
