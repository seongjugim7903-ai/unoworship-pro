#!/usr/bin/env bash
# 방송 출력 런처 — 슬립 방지(caffeinate) + ATEM 출력 창(Fill/Key/자막) 자동 열기·복구.
#   무인 원격 운영에서 부팅 후/사고 후 출력을 한 번에 세팅·복구하는 용도.
#   사용법:  ./scripts/broadcast-launcher.sh [start|stop|restart]
#
#   ⚠️ start 는 Chrome 전체화면 창 3개를 엽니다. 이미 출력이 살아있는 라이브 중엔 쓰지 말고,
#      부팅 직후나 출력이 흐트러졌을 때 복구용으로 쓰세요.

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="http://localhost:3000"

# ── 각 출력 디스플레이 좌상단 좌표 (System Settings > 디스플레이 '배열'에 맞게 조정) ──
#   1920x1080 3대 가로 배열 가정. 창이 엉뚱한 화면에 뜨면 아래 X값(0/1920/3840)만 바꾸세요.
FILL_URL="$BASE/atem-fill";  FILL_POS="0,0"       # ATEM 입력4 (Fill, 회중 output)
KEY_URL="$BASE/atem-key";    KEY_POS="1920,0"     # ATEM 입력5 (Key, 회중 output)
SUB_URL="$BASE/atem-sub";    SUB_POS="3840,0"     # ATEM 입력6 (무대 sub, prompt=black-white 등)

open_kiosk() {
  # $1=url  $2=window-position(x,y)  $3=tag(프로필 격리용)
  "$CHROME" \
    --user-data-dir="/tmp/unolive-out-$3" \
    --new-window --kiosk \
    --window-position="$2" \
    --no-first-run --no-default-browser-check \
    --disable-session-crashed-bubble --disable-infobars \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    "$1" >/dev/null 2>&1 &
}

keep_awake() {
  if pgrep -x caffeinate >/dev/null 2>&1; then
    echo "· 슬립방지 이미 동작중"
  else
    nohup caffeinate -dimsu >/dev/null 2>&1 &
    echo "· 슬립방지(caffeinate -dimsu) 시작"
  fi
}

wait_server() {
  echo "· dev 서버(3000) 대기..."
  local i
  for i in $(seq 1 60); do
    if curl -sf "$BASE" >/dev/null 2>&1; then echo "· 서버 응답 OK"; return 0; fi
    sleep 1
  done
  echo "· ⚠ 서버 응답 없음 — dev 서버(npm run dev)가 떠 있는지 확인하세요"
}

start() {
  keep_awake
  wait_server
  echo "· 출력 창 여는 중 (Fill / Key / 자막)..."
  open_kiosk "$FILL_URL" "$FILL_POS" fill
  open_kiosk "$KEY_URL"  "$KEY_POS"  key
  open_kiosk "$SUB_URL"  "$SUB_POS"  sub
  echo "✅ 완료. 창 위치가 틀리면 스크립트 상단 *_POS 좌표를 조정 후 restart."
}

stop() {
  echo "· 출력 창 닫는 중..."
  pkill -f "unolive-out-" >/dev/null 2>&1 || true
  echo "✅ 출력 창 종료. (슬립방지는 유지 — 끄려면: pkill caffeinate)"
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  *) echo "사용법: $0 [start|stop|restart]"; exit 1 ;;
esac
