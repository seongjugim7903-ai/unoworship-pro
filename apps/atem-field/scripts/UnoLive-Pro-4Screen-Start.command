#!/bin/bash
# UnoLive Pro 4화면 실행 — 서버 + Fill/Key(ATEM 입력4/5) + 서브 직결(HDMI) + 제어(DisplayLink) 컴포즈 (더블클릭용).
#   Pro 프로필 완성형 배선 (2026-07-09 실측 EDID 기준):
#     Blackmagic ×2 (2468:48652) → FILL(왼쪽)/KEY(오른쪽) → ATEM 입력4/5 → Out1 회중
#     HSC TV      (19854:544)   → 서브(/atem-sub) 무대 직결
#     F3275T      (22821:2700)  → 컴포즈(/composer) 제어 — DisplayLink
#   종료: UnoLive-Stop.command / 부팅 자동실행: com.unolive.kiosk.plist 가 이 스크립트를 --boot 로 실행

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"

# ── 화면 식별 EDID (vendor product) — 장비 교체 시 이 값만 갱신 ─────────────
SUB_EDID="19854 544"        # HSC TV (HDMI 직결 서브)
CONTROL_EDID="22821 2700"   # F3275T (DisplayLink 제어)
FILLKEY_EDID="2468 48652"   # Blackmagic HDMI-SDI ×2 (필앤키)

# ── 프로젝트 폴더 ────────────────────────────────────────────
if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field"
fi
cd "$PROJECT_DIR" || { osascript -e 'display dialog "UnoLive 프로젝트 폴더를 찾지 못했습니다." buttons {"확인"} with icon caution'; exit 1; }

SCRIPT_DIR="$PROJECT_DIR/scripts"
SERVER_PORT=3000
SERVER_URL="http://localhost:${SERVER_PORT}"
LOG="$HOME/Library/Logs/unolive-pro4.log"
CHROME_LOG="$HOME/Library/Logs/unolive-chrome.log"
SERVER_LOG="$HOME/Library/Logs/unolive-atem-server.log"
WATCHDOG_LOG="$HOME/Library/Logs/unolive-server-watchdog.log"
WATCHDOG_PID_FILE="$HOME/Library/Logs/unolive-server-watchdog.pid"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

clear 2>/dev/null || true
echo "============================================"
echo "  UnoLive Pro 4화면 실행"
echo "============================================"
echo "  FILL/KEY → ATEM 입력4/5 (Blackmagic ×2)"
echo "  SUB      → HSC TV 직결 (무대)"
echo "  컴포즈   → F3275T (DisplayLink 제어)"
echo ""

DL="$SCRIPT_DIR/displaylist"
if [ ! -x "$DL" ]; then
  log "displaylist 컴파일..."
  clang -framework ApplicationServices -o "$DL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" \
    || { osascript -e 'display dialog "디스플레이 감지 헬퍼 컴파일 실패" buttons {"확인"} with icon caution'; exit 1; }
fi

# ── --boot: 부팅 자동실행 — 데스크톱 + 4화면 배열 안정 대기 ──────────────────
#   DisplayLink 는 드라이버(DisplayLink Manager) 기동 후에야 인식되므로 특히 늦다.
if [ "${1:-}" = "--boot" ]; then
  log "부팅 모드: 데스크톱 대기..."
  W=0
  while ! pgrep -x "Dock" >/dev/null 2>&1; do
    sleep 1; W=$((W+1)); [ $W -ge 120 ] && { log "ERROR: 데스크톱 미준비(120s)"; exit 1; }
  done
  log "데스크톱 준비(${W}s). 화면 4개 + 배열 안정화 대기..."
  W=0; PREV=""
  while :; do
    CUR=$("$DL" 2>/dev/null | awk '$3==1920 && $4==1080' || true)
    N=$(echo "$CUR" | grep -c .)
    if [ "$N" -ge 4 ] && [ -n "$CUR" ] && [ "$CUR" = "$PREV" ]; then
      log "화면 ${N}개 + 배열 10초 안정 확인(${W}s)"; break
    fi
    PREV="$CUR"
    sleep 10; W=$((W+10))
    [ $W -ge 240 ] && { log "⚠ 240초에도 4화면 미안정(화면 ${N}개) — 그대로 진행 (DisplayLink Manager 자동시작 확인 필요)"; break; }
  done
fi

# ── 1. 서버 확보 (없으면 자동 시작 — watch 없음, 예배 안전) ──
if curl -s "$SERVER_URL" >/dev/null 2>&1; then
  log "서버 이미 실행 중"
else
  log "서버 시작..."
  EXISTING="$(lsof -ti:$SERVER_PORT 2>/dev/null || true)"
  [ -n "$EXISTING" ] && { kill -9 $EXISTING 2>/dev/null || true; sleep 1; }
  nohup npm run dev >> "$SERVER_LOG" 2>&1 &
  C=0
  until curl -s "$SERVER_URL" >/dev/null 2>&1; do
    sleep 1; C=$((C+1))
    if [ $C -ge 90 ]; then
      osascript -e 'display dialog "서버 시작 실패. 로그: ~/Library/Logs/unolive-atem-server.log" buttons {"확인"} with icon caution'
      exit 1
    fi
  done
  log "서버 시작 완료 (${C}s)"
fi

# ── 1.5. 예배용 서버 워치독 ─────────────────────────────────
#   브라우저/영상 요청 중 서버가 순간적으로 내려가면, 페이지 내부 재연결만으로는
#   복구할 수 없다. 수동 실행 세션 동안만 별도 감시 프로세스가 127.0.0.1 health를
#   확인하고, 3회 연속 실패 시 서버만 조용히 재기동한다.
start_watchdog() {
  local old
  if [ -f "$WATCHDOG_PID_FILE" ]; then
    old="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
    if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
      log "서버 워치독 이미 실행 중 (PID ${old})"
      return 0
    fi
  fi

  UNOLIVE_PROJECT_DIR="$PROJECT_DIR" \
  SERVER_PORT="$SERVER_PORT" \
  SERVER_URL="http://127.0.0.1:${SERVER_PORT}" \
  HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/api/health" \
  UNOLIVE_SERVER_LOG="$SERVER_LOG" \
  UNOLIVE_WATCHDOG_LOG="$WATCHDOG_LOG" \
  UNOLIVE_WATCHDOG_PID_FILE="$WATCHDOG_PID_FILE" \
  nohup bash "$PROJECT_DIR/scripts/unolive-server-watchdog.sh" >/dev/null 2>&1 &
  sleep 1
  log "서버 워치독 시작 (PID $(cat "$WATCHDOG_PID_FILE" 2>/dev/null || echo '?'))"
}
start_watchdog

# ── 2. EDID 로 화면 식별 ─────────────────────────────────────
compute_coords() {
  DISPLAYS="$("$DL" | awk '$3==1920 && $4==1080')"
  log "디스플레이:"; echo "$DISPLAYS" | while read -r l; do log "  $l"; done

  SUB_LINE=$(echo "$DISPLAYS" | awk -v e="$SUB_EDID" '$5" "$6==e' | head -1)
  CTRL_LINE=$(echo "$DISPLAYS" | awk -v e="$CONTROL_EDID" '$5" "$6==e' | head -1)
  FK_LINES=$(echo "$DISPLAYS" | awk -v e="$FILLKEY_EDID" '$5" "$6==e' | sort -n -k1,1)
  FILL_LINE=$(echo "$FK_LINES" | sed -n '1p')
  KEY_LINE=$(echo "$FK_LINES" | sed -n '2p')

  read -r SUB_X  SUB_Y  <<< "$(echo "$SUB_LINE"  | awk '{print $1, $2}')"
  read -r CTRL_X CTRL_Y <<< "$(echo "$CTRL_LINE" | awk '{print $1, $2}')"
  read -r FILL_X FILL_Y <<< "$(echo "$FILL_LINE" | awk '{print $1, $2}')"
  read -r KEY_X  KEY_Y  <<< "$(echo "$KEY_LINE"  | awk '{print $1, $2}')"

  if [ -z "${FILL_X:-}" ] || [ -z "${KEY_X:-}" ]; then
    osascript -e 'display dialog "필앤키 화면(Blackmagic ×2)을 찾지 못했습니다 — C타입 케이블 확인." buttons {"확인"} with icon caution'
    exit 1
  fi
  if [ -z "${SUB_X:-}" ]; then
    log "⚠ 서브(HSC TV) 미감지 — SUB 창 생략"
  fi
  if [ -z "${CTRL_X:-}" ]; then
    log "⚠ 제어(F3275T/DisplayLink) 미감지 — 컴포즈 창 생략 (DisplayLink Manager 실행 확인)"
  fi
  log "배정 → FILL(${FILL_X},${FILL_Y}) KEY(${KEY_X},${KEY_Y}) SUB(${SUB_X:-없음},${SUB_Y:-}) 컴포즈(${CTRL_X:-없음},${CTRL_Y:-})"
}
compute_coords
echo ""
echo "  FILL   → (${FILL_X},${FILL_Y}) → ATEM 입력4"
echo "  KEY    → (${KEY_X},${KEY_Y}) → ATEM 입력5"
echo "  SUB    → (${SUB_X:-미감지}) → HSC TV 무대"
echo "  컴포즈 → (${CTRL_X:-미감지}) → F3275T 제어"
echo ""
echo "  ※ 멀티뷰에서 FILL/KEY 가 뒤바뀌면 ATEM 입력4·5 케이블만 교환."

# ── 3. 절전 방지 ─────────────────────────────────────────────
CAFFEINATE_PID_FILE="$HOME/Library/Logs/unolive-atem-caffeinate.pid"
if [ -f "$CAFFEINATE_PID_FILE" ] && kill -0 "$(cat "$CAFFEINATE_PID_FILE")" 2>/dev/null; then
  log "caffeinate 이미 실행 중"
else
  nohup caffeinate -dis >/dev/null 2>&1 &
  echo $! > "$CAFFEINATE_PID_FILE"
  log "caffeinate 시작 (PID $(cat "$CAFFEINATE_PID_FILE"))"
fi

# ── 4. 창 실행 ───────────────────────────────────────────────
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -f "$CHROME" ] || { osascript -e 'display dialog "Google Chrome 이 없습니다." buttons {"확인"} with icon caution'; exit 1; }
KPROF="$HOME/Library/UnoLive"

open_win() { # url x y profile label extra_flag
  local url="$1" x="$2" y="$3" prof="$KPROF/$4" label="$5" extra="${6:---kiosk}"
  mkdir -p "$prof"
  local prev; prev=$(pgrep -f "user-data-dir=$prof" 2>/dev/null || true)
  [ -n "$prev" ] && { echo "$prev" | xargs kill -9 2>/dev/null || true; sleep 1; }
  rm -rf "$prof/SingletonLock" "$prof/SingletonCookie" "$prof/SingletonSocket" 2>/dev/null
  log "$label 창: $url @ ${x},${y} ($extra)"
  nohup "$CHROME" \
    "$extra" --user-data-dir="$prof" \
    --window-position="$x,$y" --window-size=1920,1080 \
    --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs \
    --disable-session-crashed-bubble --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1 \
    "$url" >>"$CHROME_LOG" 2>&1 &
  sleep 4
}

open_relay_win() { # 맥 릴레이 (ATEM 최종영상 캡처 → WebRTC) — 서브 PGM 영상·컴포즈 미러 소스
  local prof="$KPROF/atem-cameras-profile"
  mkdir -p "$prof"
  local prev; prev=$(pgrep -f "user-data-dir=$prof" 2>/dev/null || true)
  [ -n "$prev" ] && { echo "$prev" | xargs kill -9 2>/dev/null || true; sleep 1; }
  rm -rf "$prof/SingletonLock" "$prof/SingletonCookie" "$prof/SingletonSocket" 2>/dev/null
  log "릴레이 창: /cameras-source"
  nohup "$CHROME" \
    --app="${SERVER_URL}/cameras-source" \
    --user-data-dir="$prof" \
    --window-position="${CTRL_X:-0},${CTRL_Y:-0}" --window-size=800,500 \
    --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs \
    --disable-session-crashed-bubble --disable-restore-session-state \
    --use-fake-ui-for-media-stream \
    --autoplay-policy=no-user-gesture-required \
    --disable-backgrounding-occluded-windows \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    >>"$CHROME_LOG" 2>&1 &
  sleep 3
}

place_windows() {
  open_win "${SERVER_URL}/atemsignal/fill?mode=fill" "$FILL_X" "$FILL_Y" atem-fill-profile FILL
  open_win "${SERVER_URL}/atemsignal/key?mode=key"   "$KEY_X"  "$KEY_Y"  atem-key-profile  KEY
  open_relay_win
  [ -n "${SUB_X:-}" ]  && open_win "${SERVER_URL}/atem-sub"  "$SUB_X"  "$SUB_Y"  atem-sub-profile     SUB
  [ -n "${CTRL_X:-}" ] && open_win "${SERVER_URL}/composer"  "$CTRL_X" "$CTRL_Y" atem-control-profile 컴포즈 --start-maximized
}
place_windows

# ── 4.5 배치 후 재검증 — 창 여는 사이 재배열됐으면 1회 재배치 ─────────────────
sleep 5
PRE="$DISPLAYS"
compute_coords
if [ "$DISPLAYS" != "$PRE" ]; then
  log "⚠ 배치 중 디스플레이 재배열 감지 → 재배치"
  place_windows
fi

echo ""
echo "  ✅ Pro 4화면 배치 완료 — 원격 보조: http://<맥IP>:${SERVER_PORT}/composer"
echo "     종료: UnoLive-Stop.command"
log "Pro 4화면 실행 완료"
