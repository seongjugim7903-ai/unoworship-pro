#!/bin/bash
# =============================================================
# UnoLive-Dev-Start.command
# 개발 모드 원클릭 시작 (터미널 창이 열려 로그 실시간 표시)
#
# 동작:
#   1. 기존 서버 프로세스 정리 (포트 3000)
#   2. 개발 서버 + watch 모드 시작
#   3. 서버 ready 대기 후 3대 모니터(콤포우즈/중층/강대상) 자동 배치
#   4. 터미널 창에 서버 로그 표시 (Next.js HMR 활성)
#
# 종료:
#   터미널 창에서 Ctrl+C
# =============================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 이 .command 파일이 어느 위치에 있든 프로젝트 루트 찾기
if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  # Desktop 등 외부 위치에서 실행된 경우 하드코딩 경로 사용
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus"
fi

cd "$PROJECT_DIR" || { echo "❌ 프로젝트 폴더 없음: $PROJECT_DIR"; exit 1; }

# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/monitor-config.sh"

clear
echo "============================================"
echo "  🎬 UnoLive 개발 모드 시작"
echo "============================================"
echo "  프로젝트: $PROJECT_DIR"
echo "  서버:     $SERVER_URL (LAN: http://$(ipconfig getifaddr en0 2>/dev/null || echo '?'):$SERVER_PORT)"
echo "  허용 Host: $UNOLIVE_ALLOWED_LAN_HOSTS"
echo "  모니터:   제어=$MONITOR_CONTROL_X / 중층=$MONITOR_PROMPT_X / 강대상=$MONITOR_OUTPUT_X"
echo "============================================"
echo ""

# ── 기존 서버 정리 ───────────────────────────────────────────
EXISTING=$(lsof -ti:$SERVER_PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "⚙️  기존 서버 종료 (PID: $EXISTING)"
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

# ── 키오스크·제어창은 서버 ready 후 띄우기 (백그라운드 러너) ──
(
  COUNT=0
  until curl -s "$SERVER_URL" > /dev/null 2>&1; do
    sleep 1
    COUNT=$((COUNT + 1))
    [ $COUNT -ge 60 ] && { echo "[launcher] ❌ 서버 미응답"; exit 1; }
  done
  echo ""
  echo "[launcher] ✅ 서버 ready ($COUNT s) — 콤포우즈/모니터 창 배치 중..."

  if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" = "1" ]; then
    RUNTIME_PIDS=$(pgrep -f "user-data-dir=$PROFILE_RUNTIME" 2>/dev/null)
    if [ -n "$RUNTIME_PIDS" ]; then
      echo "[launcher] 기존 UnoLive 런타임 창 종료: $RUNTIME_PIDS"
      echo "$RUNTIME_PIDS" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    rm -rf "${PROFILE_RUNTIME}/SingletonLock" \
           "${PROFILE_RUNTIME}/SingletonCookie" \
           "${PROFILE_RUNTIME}/SingletonSocket" 2>/dev/null
  fi

  "$PROJECT_DIR/scripts/mac-launch-monitors.sh" > /dev/null 2>&1
  sleep 2
  "$PROJECT_DIR/scripts/mac-launch-control.sh" > /dev/null 2>&1

  echo "[launcher] ✅ 콤포우즈 + 2대 출력 모니터 배치 완료"
  echo ""
  echo "💡 이제 코드 수정하면 Next.js HMR 이 자동 리로드."
  echo "   server.ts 변경 시 tsx watch 가 자동 재시작."
  echo "   브라우저 수동 새로고침: 창에서 Cmd+R"
  echo ""
) &

# ── 포그라운드로 dev 서버 (watch 모드 + HMR) ─────────────────
exec npm run dev:watch
