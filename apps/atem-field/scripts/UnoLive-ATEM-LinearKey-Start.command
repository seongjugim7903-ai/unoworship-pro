#!/bin/bash
# =============================================================
# UnoLive-ATEM-LinearKey-Start.command
# ATEM Linear Key 실험용 3화면 실행 아이콘
#
# 화면 역할:
#   - CONTROL:   http://localhost:3000/composer
#   - FILL:      http://localhost:3000/atemsignal/fill?mode=fill → ATEM Input 4
#   - KEY:       http://localhost:3000/atemsignal/key?mode=key   → ATEM Input 5
#
# ATEM 설정:
#   - Input 4 = Fill Source
#   - Input 5 = Key Source
#   - Key Type = Linear Key
#   - ON AIR
# =============================================================

set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field"
fi

cd "$PROJECT_DIR" || {
  osascript -e 'display dialog "UnoLive 프로젝트 폴더를 찾지 못했습니다." buttons {"확인"} default button "확인" with icon caution'
  exit 1
}

# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/monitor-config.sh"

export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
export UNOLIVE_BIND_HOST="${UNOLIVE_BIND_HOST:-0.0.0.0}"
# ATEM 자동 연결 IP — 없으면 카메라 그리드 전환이 죽는다(disconnected). 이 현장 = 172.26.42.5
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"
export PORT="${PORT:-$SERVER_PORT}"

LOG_FILE="$HOME/Library/Logs/unolive-atem-linear-key.log"
SERVER_LOG_FILE="$HOME/Library/Logs/unolive-atem-server.log"
mkdir -p "$HOME/Library/Logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BROWSER_APP_NAME="Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  BROWSER_APP_NAME="Microsoft Edge"
fi

if [ ! -f "$CHROME_PATH" ]; then
  osascript -e 'display dialog "Google Chrome 또는 Microsoft Edge를 찾지 못했습니다." buttons {"확인"} default button "확인" with icon caution'
  exit 1
fi

FILL_URL="${SERVER_URL}/atemsignal/fill?mode=fill"
KEY_URL="${SERVER_URL}/atemsignal/key?mode=key"
COMPOSER_URL="${SERVER_URL}/composer"

FILL_PROFILE="${PROFILE_ATEM_FILL:-${PROFILE_DIR}/atem-fill-profile}"
KEY_PROFILE="${PROFILE_ATEM_KEY:-${PROFILE_DIR}/atem-key-profile}"
CONTROL_PROFILE="${PROFILE_DIR}/atem-control-profile"

mkdir -p "$FILL_PROFILE" "$KEY_PROFILE" "$CONTROL_PROFILE"

clear
echo "============================================"
echo "  UnoLive ATEM Linear Key start"
echo "============================================"
echo "  Project:  $PROJECT_DIR"
echo "  Server:   $SERVER_URL"
echo "  FILL:     $FILL_URL  → ATEM Input 4"
echo "  KEY:      $KEY_URL   → ATEM Input 5"
echo "  CONTROL:  $COMPOSER_URL"
echo "============================================"
echo ""

log "=== ATEM Linear Key 실행 시작 ==="
log "FILL: ${FILL_URL} @ ${MONITOR_ATEM_FILL_X},${MONITOR_ATEM_FILL_Y} ${MONITOR_ATEM_FILL_W}x${MONITOR_ATEM_FILL_H}"
log "KEY: ${KEY_URL} @ ${MONITOR_ATEM_KEY_X},${MONITOR_ATEM_KEY_Y} ${MONITOR_ATEM_KEY_W}x${MONITOR_ATEM_KEY_H}"
log "CONTROL: ${COMPOSER_URL} @ ${MONITOR_CONTROL_X},${MONITOR_CONTROL_Y} ${MONITOR_CONTROL_W}x${MONITOR_CONTROL_H}"

ensure_server() {
  if curl -s "$SERVER_URL" > /dev/null 2>&1; then
    log "서버 이미 실행 중"
    return 0
  fi

  log "서버 미응답 — 자동 시작 시도"
  echo "서버가 꺼져 있어 자동으로 시작합니다..."

  local existing
  existing="$(lsof -ti:"$SERVER_PORT" 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    log "포트 ${SERVER_PORT} 점유 프로세스 종료: ${existing}"
    kill -9 $existing 2>/dev/null || true
    sleep 1
  fi

  nohup npm run dev:watch >> "$SERVER_LOG_FILE" 2>&1 &
  log "서버 시작 명령 전송: npm run dev:watch (log: ${SERVER_LOG_FILE})"

  local count=0
  until curl -s "$SERVER_URL" > /dev/null 2>&1; do
    sleep 1
    count=$((count + 1))
    if [ "$count" -ge 90 ]; then
      log "ERROR: 서버 자동 시작 실패 (${SERVER_URL})"
      osascript -e 'display dialog "UnoLive 서버 자동 시작에 실패했습니다. 로그를 확인해 주세요: ~/Library/Logs/unolive-atem-server.log" buttons {"확인"} default button "확인" with icon caution'
      exit 1
    fi
  done

  log "서버 자동 시작 완료 (${count}s)"
}

# ── 디스플레이 절전 방지 ──────────────────────────────────────
#   맥미니가 유휴 상태로 들어가면 확장 디스플레이의 HDMI 출력이 끊겨
#   ATEM Input 4/5 가 "No Signal" 로 빠진다.
#   런처가 실행되는 동안 caffeinate 로 디스플레이/시스템 절전을 강제로 막는다.
#     -d: 디스플레이 절전 방지, -i: 유휴 시스템 절전 방지, -s: AC 전원 시스템 절전 방지
#   종료는 UnoLive-Stop.command 가 PID 파일을 읽어 처리한다.
CAFFEINATE_PID_FILE="$HOME/Library/Logs/unolive-atem-caffeinate.pid"
prevent_display_sleep() {
  if [ -f "$CAFFEINATE_PID_FILE" ]; then
    local old
    old="$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null || true)"
    if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
      kill "$old" 2>/dev/null || true
      log "이전 caffeinate 정리: ${old}"
    fi
    rm -f "$CAFFEINATE_PID_FILE"
  fi

  nohup caffeinate -dis >/dev/null 2>&1 &
  echo $! > "$CAFFEINATE_PID_FILE"
  log "디스플레이 절전 방지 활성화 (caffeinate PID: $(cat "$CAFFEINATE_PID_FILE"))"
  echo "🖥  디스플레이 절전 방지 ON — 종료는 UnoLive-Stop 아이콘으로"
}

close_profile_windows() {
  local profile="$1"
  local label="$2"
  local pids
  pids="$(pgrep -f "user-data-dir=${profile}" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    log "기존 ${label} 창 종료: ${pids}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  rm -rf "${profile}/SingletonLock" \
         "${profile}/SingletonCookie" \
         "${profile}/SingletonSocket" 2>/dev/null
}

open_kiosk_window() {
  local label="$1"
  local url="$2"
  local profile="$3"
  local x="$4"
  local y="$5"
  local w="$6"
  local h="$7"

  log "${label} 키오스크 실행"
  open -na "$BROWSER_APP_NAME" --args \
    --kiosk \
    --user-data-dir="$profile" \
    --window-position="${x},${y}" \
    --window-size="${w},${h}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-infobars \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required \
    --force-device-scale-factor=1 \
    --overscroll-history-navigation=0 \
    "$url" \
    &
  sleep 2

  # macOS Spaces/최근 창 상태가 --window-position 을 무시하는 경우가 있어
  # 방금 열린 전면 Chrome 창을 한 번 더 정확한 모니터 좌표로 고정한다.
  osascript <<APPLESCRIPT 2>/dev/null || true
tell application "System Events"
  tell process "${BROWSER_APP_NAME}"
    try
      set position of front window to {${x}, ${y}}
      set size of front window to {${w}, ${h}}
    end try
  end tell
end tell
APPLESCRIPT
}

open_control_window() {
  log "CONTROL 콤포우즈 제어창 실행"
  open -na "$BROWSER_APP_NAME" --args \
    --user-data-dir="$CONTROL_PROFILE" \
    --window-position="${MONITOR_CONTROL_X},${MONITOR_CONTROL_Y}" \
    --window-size="${MONITOR_CONTROL_W},${MONITOR_CONTROL_H}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required \
    "$COMPOSER_URL"

  sleep 2

  osascript <<APPLESCRIPT 2>/dev/null
tell application "System Events"
  tell process "${BROWSER_APP_NAME}"
    try
      set position of front window to {${MONITOR_CONTROL_X}, ${MONITOR_CONTROL_Y}}
      set size of front window to {${MONITOR_CONTROL_W}, ${MONITOR_CONTROL_H}}
    end try
  end tell
end tell
APPLESCRIPT
}

close_profile_windows "$FILL_PROFILE" "FILL"
close_profile_windows "$KEY_PROFILE" "KEY"
close_profile_windows "$CONTROL_PROFILE" "CONTROL"

ensure_server
prevent_display_sleep

open_kiosk_window "FILL / ATEM Input 4" "$FILL_URL" "$FILL_PROFILE" "$MONITOR_ATEM_FILL_X" "$MONITOR_ATEM_FILL_Y" "$MONITOR_ATEM_FILL_W" "$MONITOR_ATEM_FILL_H"
open_kiosk_window "KEY / ATEM Input 5" "$KEY_URL" "$KEY_PROFILE" "$MONITOR_ATEM_KEY_X" "$MONITOR_ATEM_KEY_Y" "$MONITOR_ATEM_KEY_W" "$MONITOR_ATEM_KEY_H"
open_control_window

log "=== ATEM Linear Key 실행 완료 ==="
echo ""
echo "✅ ATEM Linear Key 3화면 실행 요청 완료"
echo "   FILL / ATEM Input 4: ${FILL_URL}"
echo "   KEY  / ATEM Input 5: ${KEY_URL}"
echo "   CONTROL / Composer:  ${COMPOSER_URL}"
echo ""
echo "ATEM Software Control에서 Input 4=Fill, Input 5=Key, Key Type=Linear Key, ON AIR를 확인하세요."
