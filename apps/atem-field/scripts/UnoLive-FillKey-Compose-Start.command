#!/bin/bash
# UnoLive 필앤키+컴포즈 실행 — Fill/Key 2창(ATEM 입력4/5) + 제어 모니터(HDMI)에 컴포즈 (더블클릭용).
#   DisplayLink 도착 전 임시 운영 구성: HDMI를 ATEM 입력6 대신 제어 모니터에 직결한 상태용.
#   무대(서브) 모니터는 ATEM Out2 소스를 Program 으로 → 메인과 같은 화면(PGM 미러).
#   화면 배정: 동일 어댑터 2개(C타입) = Fill/Key, EDID 유일(HDMI) = 컴포즈(제어).
#   종료: UnoLive-Stop.command

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# 소켓 인증 우회(현장 LAN 운영) — 3화면 커맨드와 동일.
export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
# ATEM 자동 연결 (카메라 전환·DSK) — 맥미니 en9 이더넷 직결 고정 IP
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"

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
LOG="$HOME/Library/Logs/unolive-fillkey-compose.log"
CHROME_LOG="$HOME/Library/Logs/unolive-chrome.log"
SERVER_LOG="$HOME/Library/Logs/unolive-atem-server.log"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

clear 2>/dev/null || true
echo "============================================"
echo "  UnoLive 필앤키 + 컴포즈 실행"
echo "============================================"
echo "  FILL/KEY → ATEM 입력4/5 (C타입 2개)"
echo "  컴포즈   → HDMI 제어 모니터"
echo "  무대     → ATEM Out2 = Program (PGM 미러) 로 설정하세요"
echo ""

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

# ── 2. 디스플레이 감지 (3화면 커맨드와 동일한 EDID 로직) ─────
DL="$SCRIPT_DIR/displaylist"
if [ ! -x "$DL" ]; then
  log "displaylist 컴파일..."
  clang -framework ApplicationServices -o "$DL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" \
    || { osascript -e 'display dialog "디스플레이 감지 헬퍼 컴파일 실패" buttons {"확인"} with icon caution'; exit 1; }
fi
DISPLAYS="$("$DL" | awk '$3==1920 && $4==1080')"
COUNT=$(echo "$DISPLAYS" | grep -c . )
log "디스플레이 ${COUNT}개:"; echo "$DISPLAYS" | while read -r l; do log "  $l"; done

# main = EDID 유일(HDMI 제어 모니터), 나머지 동일 어댑터 2개 = Fill/Key (X좌표순)
MAIN_LINE=$(echo "$DISPLAYS" | awk '{k=$5":"$6":"$7; c[k]++; line[NR]=$0; key[NR]=k} END{for(i=1;i<=NR;i++) if(c[key[i]]==1){print line[i]; exit}}')
[ -z "$MAIN_LINE" ] && MAIN_LINE=$(echo "$DISPLAYS" | grep " main$" | head -1)
OTHERS=$(echo "$DISPLAYS" | grep -vF -- "$MAIN_LINE" | sort -n -k1,1)
LEFT_LINE=$(echo "$OTHERS" | sed -n '1p')
RIGHT_LINE=$(echo "$OTHERS" | sed -n '2p')

read -r CTRL_X CTRL_Y <<< "$(echo "$MAIN_LINE"  | awk '{print $1, $2}')"
read -r FILL_X FILL_Y <<< "$(echo "$LEFT_LINE"  | awk '{print $1, $2}')"
read -r KEY_X  KEY_Y  <<< "$(echo "$RIGHT_LINE" | awk '{print $1, $2}')"

if [ "$COUNT" -lt 3 ] || [ -z "${FILL_X:-}" ] || [ -z "${KEY_X:-}" ]; then
  osascript -e "display dialog \"화면이 ${COUNT}개만 감지됨 — 3개(Fill/Key/제어) 필요. HDMI가 제어 모니터에, C타입 2개가 ATEM에 꽂혀 있는지 확인하세요.\" buttons {\"확인\"} with icon caution"
  exit 1
fi
log "배정 → FILL(${FILL_X},${FILL_Y})  KEY(${KEY_X},${KEY_Y})  컴포즈(${CTRL_X},${CTRL_Y})"
echo ""
echo "  FILL   → (${FILL_X},${FILL_Y}) → ATEM 입력4"
echo "  KEY    → (${KEY_X},${KEY_Y}) → ATEM 입력5"
echo "  컴포즈 → (${CTRL_X},${CTRL_Y}) → 제어 모니터(HDMI)"
echo ""
echo "  ※ 멀티뷰에서 FILL/KEY 가 뒤바뀌어 보이면 ATEM 입력4·5 케이블만 서로 교환."

# ── 3. 디스플레이 절전 방지 (예배 중 HDMI 신호 유지) ─────────
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

open_win "${SERVER_URL}/atemsignal/fill?mode=fill" "$FILL_X" "$FILL_Y" atem-fill-profile FILL
open_win "${SERVER_URL}/atemsignal/key?mode=key"   "$KEY_X"  "$KEY_Y"  atem-key-profile  KEY
# 컴포즈는 kiosk 가 아닌 최대화 창 — 운영 중 다른 페이지 접근 가능해야 함
open_win "${SERVER_URL}/composer" "$CTRL_X" "$CTRL_Y" atem-control-profile 컴포즈 --start-maximized

echo ""
echo "  ✅ 배치 완료 — 원격 보조: http://<맥IP>:${SERVER_PORT}/composer"
echo "     ATEM Software Control 에서 Out2 = Program 설정 (무대 미러)"
echo "     종료: UnoLive-Stop.command"
log "필앤키+컴포즈 실행 완료"
