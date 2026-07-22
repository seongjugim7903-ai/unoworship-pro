#!/bin/bash
# UnoLive 미러 2화면 실행 (구방식 복구) — 서버 + 같은 출력화면 2창(/main·/output)을 모니터에 배치 (더블클릭용).
#   두 모니터가 맥에 "직결"된 상태용 — 두 창 모두 동일한 최종 송출 화면(미러).
#   컴포즈(제어)는 열지 않음 — iPad/노트북에서 http://<맥IP>:3000/composer 원격 접속.
#   ⚠ 필앤키(ATEM 입력) 케이블이 꽂혀 있는 화면에 실행하면 Fill/Key 창과 겹칩니다.
#     이 커맨드는 모니터 직결 실험/구방식 운영 전용입니다.
#   종료: UnoLive-Stop.command 또는 이 커맨드 재실행(자체 정리).

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# 소켓 인증 우회(현장 LAN 운영) — 3화면 커맨드와 동일. 없으면 iPad/출력창 소켓이 거부되어 송출 안 됨.
export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
# ATEM 자동 연결 IP — 없으면 카메라 그리드 전환이 죽는다(disconnected). 이 현장 = 172.26.42.5
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
LOG="$HOME/Library/Logs/unolive-mirror2.log"
CHROME_LOG="$HOME/Library/Logs/unolive-chrome.log"
SERVER_LOG="$HOME/Library/Logs/unolive-atem-server.log"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

clear 2>/dev/null || true
echo "============================================"
echo "  UnoLive 미러 2화면 실행 (구방식 /main·/output)"
echo "============================================"
echo "  ※ 두 창 모두 같은 최종 송출 화면(미러)입니다."
echo "  ※ 모니터 직결 상태에서 사용 — ATEM 필앤키 화면과 겹치지 않게 주의."
echo ""

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

# ── 2. 디스플레이 감지 (1920x1080 실물만) ────────────────────
DL="$SCRIPT_DIR/displaylist"
if [ ! -x "$DL" ]; then
  log "displaylist 컴파일..."
  clang -framework ApplicationServices -o "$DL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" \
    || { osascript -e 'display dialog "디스플레이 감지 헬퍼 컴파일 실패" buttons {"확인"} with icon caution'; exit 1; }
fi
DISPLAYS="$("$DL" | awk '$3==1920 && $4==1080')"
COUNT=$(echo "$DISPLAYS" | grep -c . )
log "디스플레이 ${COUNT}개:"; echo "$DISPLAYS" | while read -r l; do log "  $l"; done
if [ "$COUNT" -lt 1 ]; then
  osascript -e 'display dialog "1920x1080 화면이 없습니다 — 모니터 케이블을 확인하세요." buttons {"확인"} with icon caution'
  exit 1
fi

# X좌표 오름차순 정렬 → 왼쪽부터 OUT1, OUT2
SORTED="$(echo "$DISPLAYS" | sort -n -k1,1)"
OUT1_LINE="$(echo "$SORTED" | sed -n '1p')"
OUT2_LINE="$(echo "$SORTED" | sed -n '2p')"
read -r OUT1_X OUT1_Y <<< "$(echo "$OUT1_LINE" | awk '{print $1, $2}')"
read -r OUT2_X OUT2_Y <<< "$(echo "$OUT2_LINE" | awk '{print $1, $2}')"
log "배정 → OUT1(/main): ${OUT1_X},${OUT1_Y}  OUT2(/output): ${OUT2_X:-없음},${OUT2_Y:-}"

# ── 3. 이전 미러 창 정리 후 실행 ─────────────────────────────
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

open_win "${SERVER_URL}/main"   "$OUT1_X" "$OUT1_Y" mirror-out1-profile "미러 OUT1"
if [ "$COUNT" -ge 2 ] && [ -n "${OUT2_X:-}" ]; then
  open_win "${SERVER_URL}/output" "$OUT2_X" "$OUT2_Y" mirror-out2-profile "미러 OUT2"
else
  log "화면이 1개뿐 — OUT2(미러 두 번째 창)는 생략"
fi

echo ""
echo "  ✅ 미러 창 배치 완료 — 컴포즈 원격: http://<맥IP>:${SERVER_PORT}/composer"
echo "     종료는 UnoLive-Stop.command 또는 이 커맨드 재실행."
log "미러 2화면 실행 완료"
