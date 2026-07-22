#!/bin/bash
# UnoLive ATEM 3화면 실행 — 서버 + Fill/Key/Sub 3창을 각 화면에 배치 (더블클릭용).
#   Fill → ATEM 입력4, Key → 입력5, Sub(/atem-sub) → 입력6(HDMI, EDID 유일로 자동 식별).
#   컴포즈(제어)는 열지 않음 — iPad/노트북에서 http://<맥IP>:3000/composer 원격 접속.
#   종료: UnoLive-Stop.command (서버·caffeinate·fill/key 창 정리. sub 창은 이 커맨드 재실행 시 자체 정리)

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# 소켓 인증 우회(현장 LAN 운영) — 기존 LinearKey 아이콘과 동일. 없으면 iPad/출력창 소켓이 거부되어 송출 안 됨.
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
LOG="$HOME/Library/Logs/unolive-3screen.log"
CHROME_LOG="$HOME/Library/Logs/unolive-chrome.log"   # 크롬 잡음은 분리 (스크립트 로그 오염 방지)
SERVER_LOG="$HOME/Library/Logs/unolive-atem-server.log"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

clear 2>/dev/null || true
echo "============================================"
echo "  UnoLive ATEM 3화면 실행 (Fill/Key/Sub)"
echo "============================================"

# ── --boot: 부팅 자동실행 모드 — 데스크톱·디스플레이가 안정될 때까지 대기 ──
if [ "${1:-}" = "--boot" ]; then
  log "부팅 모드: 데스크톱 대기..."
  W=0
  while ! pgrep -x "Dock" >/dev/null 2>&1; do
    sleep 1; W=$((W+1)); [ $W -ge 120 ] && { log "ERROR: 데스크톱 미준비(120s)"; exit 1; }
  done
  log "데스크톱 준비(${W}s). 화면 3개 + 배열 안정화 대기..."
  # displaylist 준비(컴파일 필요할 수 있음)
  BDL="$SCRIPT_DIR/displaylist"
  [ -x "$BDL" ] || clang -framework ApplicationServices -o "$BDL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" || true
  # 개수만 보면 안 됨: 부팅 직후엔 DisplayLink·HDMI가 순차 인식되며 EDID·좌표가 계속 바뀜
  # (2026-07-06 실사고: 3개 잡힌 임시 배열로 배치 → 이후 재정렬되며 필·서브 창이 밀림).
  # → 3화면 이상 + 목록(좌표·EDID)이 10초 간격 두 번 연속 동일할 때까지 대기.
  W=0; PREV=""
  while :; do
    CUR=$([ -x "$BDL" ] && "$BDL" | awk '$3==1920 && $4==1080' || true)
    N=$(echo "$CUR" | grep -c .)
    if [ "$N" -ge 3 ] && [ -n "$CUR" ] && [ "$CUR" = "$PREV" ]; then
      log "화면 ${N}개 + 배열 10초 안정 확인(${W}s)"; break
    fi
    PREV="$CUR"
    sleep 10; W=$((W+10))
    [ $W -ge 180 ] && { log "⚠ 180초에도 배열 불안정(화면 ${N}개) — 그대로 진행"; break; }
  done
fi

# ── 1. 서버 확보 (없으면 자동 시작) ──────────────────────────
if curl -s "$SERVER_URL" >/dev/null 2>&1; then
  log "서버 이미 실행 중"
else
  log "서버 시작..."
  EXISTING="$(lsof -ti:$SERVER_PORT 2>/dev/null || true)"
  [ -n "$EXISTING" ] && { kill -9 $EXISTING 2>/dev/null || true; sleep 1; }
  # dev(watch 없음) 고정 — watch 모드는 파일 변경 시 서버 재시작 → 예배 중 전 출력창 소켓 끊김
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

# ── 2. 실제 디스플레이 감지 (좌표 + EDID) ────────────────────
DL="$SCRIPT_DIR/displaylist"
if [ ! -x "$DL" ]; then
  log "displaylist 컴파일..."
  clang -framework ApplicationServices -o "$DL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" \
    || { osascript -e 'display dialog "디스플레이 감지 헬퍼 컴파일 실패" buttons {"확인"} with icon caution'; exit 1; }
fi
DISPLAYS="$("$DL" | awk '$3==1920 && $4==1080')"   # 1920x1080 실물만 (iPad 화면공유/Sidecar 가상화면 제외)
COUNT=$(echo "$DISPLAYS" | grep -c . )
log "디스플레이 ${COUNT}개:"; echo "$DISPLAYS" | while read -r l; do log "  $l"; done
if [ "$COUNT" -lt 3 ]; then
  osascript -e "display dialog \"화면이 ${COUNT}개만 감지됨 — 3개(Fill/Key/Sub) 필요. 케이블을 확인하세요.\" buttons {\"확인\"} with icon caution"
  exit 1
fi

# ── 창 ↔ 화면 매핑 (실측 배선 기준, 2026-07-06 멀티뷰 프리뷰로 확인) ─────────
#   화면 종류: main = HDMI(EDID 유일, 독 있는 메인) / left·right = 동일 어댑터 2개(X좌표순)
#   실측(2026-07-06 debug 라벨로 확정): 입력4←left, 입력5←right, 입력6←main(HDMI)
#   뒤바뀌어 보이면 아래 세 변수만 바꿔 재실행
MAP_FILL="${MAP_FILL:-left}"
MAP_KEY="${MAP_KEY:-right}"
MAP_SUB="${MAP_SUB:-main}"

coord_of() { # $1=main|left|right → "X Y"
  case "$1" in
    main)  echo "$MAIN_LINE"  | awk '{print $1, $2}' ;;
    left)  echo "$LEFT_LINE"  | awk '{print $1, $2}' ;;
    right) echo "$RIGHT_LINE" | awk '{print $1, $2}' ;;
  esac
}

compute_coords() { # $DISPLAYS → FILL_X/Y, KEY_X/Y, SUB_X/Y
  MAIN_LINE=$(echo "$DISPLAYS" | awk '{k=$5":"$6":"$7; c[k]++; line[NR]=$0; key[NR]=k} END{for(i=1;i<=NR;i++) if(c[key[i]]==1){print line[i]; exit}}')
  [ -z "$MAIN_LINE" ] && MAIN_LINE=$(echo "$DISPLAYS" | grep " main$" | head -1)
  # 주의: MAIN_LINE 이 음수 X좌표로 시작할 수 있음 → '--' 없으면 grep 이 옵션으로 해석해 전체가 빈 값이 됨
  OTHERS=$(echo "$DISPLAYS" | grep -vF -- "$MAIN_LINE" | sort -n -k1,1)
  LEFT_LINE=$(echo "$OTHERS" | sed -n '1p')
  RIGHT_LINE=$(echo "$OTHERS" | sed -n '2p')
  read -r FILL_X FILL_Y <<< "$(coord_of "$MAP_FILL")"
  read -r KEY_X  KEY_Y  <<< "$(coord_of "$MAP_KEY")"
  read -r SUB_X  SUB_Y  <<< "$(coord_of "$MAP_SUB")"
  if [ -z "$FILL_X" ] || [ -z "$KEY_X" ] || [ -z "$SUB_X" ]; then
    log "ERROR: 좌표 계산 실패 — FILL(${FILL_X},${FILL_Y}) KEY(${KEY_X},${KEY_Y}) SUB(${SUB_X},${SUB_Y})"
    osascript -e 'display dialog "화면 좌표 계산 실패 — 로그: ~/Library/Logs/unolive-3screen.log" buttons {"확인"} with icon caution' 2>/dev/null
    exit 1
  fi
  log "배정 → FILL(${FILL_X},${FILL_Y})  KEY(${KEY_X},${KEY_Y})  SUB(${SUB_X},${SUB_Y})"
}
compute_coords
echo ""
echo "  FILL → (${FILL_X},${FILL_Y}) → ATEM 입력4"
echo "  KEY  → (${KEY_X},${KEY_Y}) → ATEM 입력5"
echo "  SUB  → (${SUB_X},${SUB_Y}) → ATEM 입력6 (HDMI)"
echo ""
echo "  ※ 멀티뷰에서 FILL/KEY 가 4·5 에 뒤바뀌어 보이면 ATEM 입력4·5 케이블만 서로 교환."

# ── 3. 이전 출력 창 정리 후 3창 실행 ─────────────────────────
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -f "$CHROME" ] || { osascript -e 'display dialog "Google Chrome 이 없습니다." buttons {"확인"} with icon caution'; exit 1; }
KPROF="$HOME/Library/UnoLive"

open_win() { # url x y profile label
  local url="$1" x="$2" y="$3" prof="$KPROF/$4" label="$5"
  mkdir -p "$prof"
  local prev; prev=$(pgrep -f "user-data-dir=$prof" 2>/dev/null || true)
  [ -n "$prev" ] && { echo "$prev" | xargs kill -9 2>/dev/null || true; sleep 1; }
  rm -rf "$prof/SingletonLock" "$prof/SingletonCookie" "$prof/SingletonSocket" 2>/dev/null
  log "$label 창: $url @ ${x},${y}"
  nohup "$CHROME" \
    --kiosk --user-data-dir="$prof" \
    --window-position="$x,$y" --window-size=1920,1080 \
    --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs \
    --disable-session-crashed-bubble --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1 \
    "$url" >>"$CHROME_LOG" 2>&1 &
  sleep 4
}

# ATEM USB Relay v2 — SUB 키오스크 "직전"에 같은 좌표로 열어 전체화면 뒤에 둔다.
#   Canvas 재그리기 없이 원본 MediaStreamTrack 을 직접 WebRTC 로 전달하므로
#   창이 가려져도 프레임 생성이 멈추지 않는다. 장치가 늦게 잡히면 페이지가 자동 대기한다.
open_relay_win() {
  local prof="$KPROF/atem-cameras-profile"
  mkdir -p "$prof"
  local prev; prev=$(pgrep -f "user-data-dir=$prof" 2>/dev/null || true)
  [ -n "$prev" ] && { echo "$prev" | xargs kill -9 2>/dev/null || true; sleep 1; }
  rm -rf "$prof/SingletonLock" "$prof/SingletonCookie" "$prof/SingletonSocket" 2>/dev/null
  log "RELAY v2 창: ${SERVER_URL}/atem-usb-relay-v2 @ ${SUB_X},${SUB_Y} (SUB 뒤에 배치)"
  nohup "$CHROME" \
    --app="${SERVER_URL}/atem-usb-relay-v2" \
    --user-data-dir="$prof" \
    --window-position="$SUB_X,$SUB_Y" --window-size=800,500 \
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
  open_win "${SERVER_URL}/atem-sub"                  "$SUB_X"  "$SUB_Y"  atem-sub-profile  SUB
}
place_windows

# ── 3.5 배치 후 재검증 — 창 여는 사이 디스플레이가 재배열됐으면 1회 재배치 ──
#    (부팅 직후 HDMI·DisplayLink 늦은 인식으로 배열이 바뀌면 macOS 가 창을 임의로 밀어냄)
sleep 5
POST="$("$DL" | awk '$3==1920 && $4==1080')"
if [ "$POST" != "$DISPLAYS" ]; then
  log "⚠ 배치 중 디스플레이 재배열 감지 → 좌표 재계산 후 재배치"
  DISPLAYS="$POST"
  compute_coords
  place_windows
fi

# ── 4. 절전 방지 (기존 Stop 커맨드와 호환되는 PID 파일) ──────
CAFF_PID_FILE="$HOME/Library/Logs/unolive-atem-caffeinate.pid"
if [ -f "$CAFF_PID_FILE" ]; then
  OLD="$(cat "$CAFF_PID_FILE" 2>/dev/null || true)"
  [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null && kill "$OLD" 2>/dev/null
fi
nohup caffeinate -dis >/dev/null 2>&1 &
echo $! > "$CAFF_PID_FILE"
log "절전 방지 시작 (PID $(cat "$CAFF_PID_FILE"))"

echo ""
echo "✅ 완료 — Fill/Key/Sub 3창 + 서버 + 절전방지"
echo "   제어: iPad/노트북 → http://<맥IP>:3000/composer"
log "=== 3화면 실행 완료 ==="
