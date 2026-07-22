#!/bin/bash
# scripts/mac-atem-all-kiosk.sh
# 현재 방식(제어 모니터 없는 무인 부팅): 3출력 전부 ATEM 으로.
#   Fill(/atemsignal/fill→입력4) + Key(/atemsignal/key→입력5) + Sub(/atem-sub→입력6)
#   을 3개 확장 화면에 키오스크로 띄운다. 컴포즈(제어)는 안 띄움 — 원격 접속 전용.
#
#   부팅 자동실행: com.unolive.kiosk.plist 가 이 스크립트를 '--boot' 로 호출.
#   수동 실행:      ./scripts/mac-atem-all-kiosk.sh
#
#   좌표는 여기서 env 로 주입(monitor-config.sh 는 건드리지 않음 → 옛 방식 안전).
#   재부팅 테스트 후 아래 X 값만 실제 배치에 맞게 조정.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$HOME/Library/Logs/unolive-kiosk.log"
mkdir -p "$HOME/Library/Logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

log "=== ATEM all-kiosk 시작 (args: $*) ==="

# ── 부팅 모드: 데스크톱/디스플레이 안정화 대기 ────────────────
if [ "$1" = "--boot" ]; then
  W=0
  while ! pgrep -x "Dock" >/dev/null 2>&1; do
    sleep 1; W=$((W+1)); [ $W -ge 120 ] && { log "ERROR: 데스크톱 미준비(120s)"; exit 1; }
  done
  log "데스크톱 준비됨(${W}s). 디스플레이 안정화 대기..."
  sleep 15
fi

# ── 서버(3000) 응답 대기 (최대 90초) ──────────────────────────
C=0
until curl -s "http://localhost:3000" >/dev/null 2>&1; do
  sleep 1; C=$((C+1)); [ $C -ge 90 ] && { log "ERROR: 서버 무응답(90s)"; exit 1; }
done
log "서버 OK(${C}s)"

# ── 실제 디스플레이 좌표 자동 감지 (scripts/displaylist — CoreGraphics) ─────
#    HDMI(서브) 화면은 EDID가 유일(vendor/serial 구분됨) → SUB 자동 배정.
#    나머지 동일 EDID 2개(어댑터) → 왼쪽=FILL, 오른쪽=KEY (뒤바뀌면 ATEM 입력4·5 케이블 교환).
DL="$SCRIPT_DIR/displaylist"
if [ ! -x "$DL" ]; then
  log "displaylist 헬퍼 없음 → 컴파일 시도"
  clang -framework ApplicationServices -o "$DL" "$SCRIPT_DIR/displaylist.c" 2>>"$LOG" || { log "ERROR: 헬퍼 컴파일 실패"; exit 1; }
fi
DISPLAYS="$("$DL")"
log "디스플레이 배열:"; echo "$DISPLAYS" | while read -r l; do log "  $l"; done
COUNT=$(echo "$DISPLAYS" | wc -l | tr -d ' ')
if [ "$COUNT" -lt 3 ]; then log "ERROR: 화면 ${COUNT}개 — 3개 필요(케이블 확인)"; exit 1; fi

# 서브 = 유일 EDID(1회 등장하는 vendor:model:serial). 나머지 2개를 X 오름차순으로 FILL, KEY.
SUB_LINE=$(echo "$DISPLAYS" | awk '{k=$5":"$6":"$7; c[k]++; line[NR]=$0; key[NR]=k} END{for(i=1;i<=NR;i++) if(c[key[i]]==1){print line[i]; exit}}')
[ -z "$SUB_LINE" ] && SUB_LINE=$(echo "$DISPLAYS" | grep " main$" | head -1)  # 폴백: main 화면
OTHERS=$(echo "$DISPLAYS" | grep -vF -- "$SUB_LINE" | sort -n -k1,1)
FILL_LINE=$(echo "$OTHERS" | sed -n '1p')
KEY_LINE=$(echo "$OTHERS" | sed -n '2p')

SUB_X=$(echo "$SUB_LINE" | awk '{print $1}');  SUB_Y=$(echo "$SUB_LINE" | awk '{print $2}')
FILL_X=$(echo "$FILL_LINE" | awk '{print $1}'); FILL_Y=$(echo "$FILL_LINE" | awk '{print $2}')
KEY_X=$(echo "$KEY_LINE" | awk '{print $1}');  KEY_Y=$(echo "$KEY_LINE" | awk '{print $2}')
log "배정 → FILL(${FILL_X},${FILL_Y}) KEY(${KEY_X},${KEY_Y}) SUB(${SUB_X},${SUB_Y})"

# ── 기존 크롬 전부 정리 (무인 방송기 — 복원된 일반 크롬이 화면을 가리는 사고 방지) ──
pkill -x "Google Chrome" 2>/dev/null; pkill -f "Google Chrome Helper" 2>/dev/null
sleep 2

# ── 3창 직접 실행 — plist 의 AbandonProcessGroup=true 로 스크립트 종료 후에도 생존.
#    (open -na 연속 호출은 뒤 창들이 첫 인스턴스에 탭으로 합쳐지는 문제 → 직접 실행으로 회귀)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
KPROF="$HOME/Library/UnoLive"
open_win() { # url x y profile-name label
  local url="$1" x="$2" y="$3" prof="$KPROF/$4" label="$5"
  mkdir -p "$prof"
  rm -rf "$prof/SingletonLock" "$prof/SingletonCookie" "$prof/SingletonSocket" 2>/dev/null
  log "$label 창 열기 ($url @ ${x},${y})"
  nohup "$CHROME" \
    --kiosk --user-data-dir="$prof" \
    --window-position="$x,$y" --window-size=1920,1080 \
    --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs \
    --disable-session-crashed-bubble --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1 \
    "$url" >>"$LOG" 2>&1 &
  sleep 4
}
open_win "http://localhost:3000/atemsignal/fill?mode=fill" "$FILL_X" "$FILL_Y" atem-fill-profile FILL
open_win "http://localhost:3000/atemsignal/key?mode=key"   "$KEY_X"  "$KEY_Y"  atem-key-profile  KEY
open_win "http://localhost:3000/atem-sub"                  "$SUB_X"  "$SUB_Y"  atem-sub-profile  SUB

# ── 슬립 방지 ─────────────────────────────────────────────────
if ! pgrep -x caffeinate >/dev/null 2>&1; then
  nohup caffeinate -dimsu >/dev/null 2>&1 &
  log "슬립방지(caffeinate -dimsu) 시작"
fi

log "=== 완료: Fill/Key/Sub 3창 + 슬립방지 ==="
