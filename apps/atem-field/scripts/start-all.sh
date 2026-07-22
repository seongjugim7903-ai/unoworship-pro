#!/bin/bash
# =============================================================
# scripts/start-all.sh
# 원클릭 시작: 서버 + 두 키오스크 + 제어 Chrome
#
# 사용법:
#   ./scripts/start-all.sh
#
# 동작 순서:
#   1. 서버가 이미 켜져 있으면 스킵, 아니면 백그라운드로 시작
#   2. 서버 응답 대기
#   3. 두 키오스크 실행 (중층 + 강대상)
#   4. 제어 모니터에 에디터 창 핀
# =============================================================

# 이 파일이 scripts/ 안에 있을 때와 복사되어 다른 위치에 있을 때 둘 다 지원
if [ -f "$(dirname "$0")/monitor-config.sh" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
else
  SCRIPT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus/scripts"
fi
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

LOG_FILE="$HOME/Library/Logs/unolive-server.log"
mkdir -p "$HOME/Library/Logs"

echo "============================================"
echo "  UnoLive 원클릭 시작"
echo "============================================"

# ── 1) 서버 상태 확인 ────────────────────────────────────────
if curl -s "$SERVER_URL" > /dev/null 2>&1; then
  echo "[1/4] ✅ 서버 이미 실행 중 ($SERVER_URL)"
else
  echo "[1/4] 서버 실행 중..."
  # 프로젝트 루트 결정 — scripts/ 상위에 package.json 있으면 그쪽, 없으면 하드코딩 경로
  if [ -f "$SCRIPT_DIR/../package.json" ]; then
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  else
    PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus"
  fi
  cd "$PROJECT_DIR" || { echo "❌ 프로젝트 폴더 없음: $PROJECT_DIR"; exit 1; }

  # 빌드 확인
  if [ ! -d ".next" ]; then
    echo "   빌드 파일 없음 — npm run build 실행"
    npm run build >> "$LOG_FILE" 2>&1
  fi

  # 백그라운드로 서버 실행 (터미널 닫아도 유지)
  nohup npm start >> "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "   서버 PID: $SERVER_PID"
  disown
fi

# ── 2) 서버 응답 대기 ────────────────────────────────────────
echo "[2/4] 서버 응답 대기..."
COUNT=0
until curl -s "$SERVER_URL" > /dev/null 2>&1; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge 60 ]; then
    echo "   ❌ 서버 미응답 (60s)"
    echo "   로그: tail -f $LOG_FILE"
    exit 1
  fi
done
echo "   ✅ 서버 OK (${COUNT}s)"

if [ "${UNOLIVE_SHARED_RUNTIME_PROFILE:-0}" = "1" ]; then
  RUNTIME_PIDS=$(pgrep -f "user-data-dir=$PROFILE_RUNTIME" 2>/dev/null)
  if [ -n "$RUNTIME_PIDS" ]; then
    echo "   기존 UnoLive 런타임 창 종료: $RUNTIME_PIDS"
    echo "$RUNTIME_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  rm -rf "${PROFILE_RUNTIME}/SingletonLock" \
         "${PROFILE_RUNTIME}/SingletonCookie" \
         "${PROFILE_RUNTIME}/SingletonSocket" 2>/dev/null
fi

# ── 3) 두 키오스크 실행 ──────────────────────────────────────
echo "[3/4] 키오스크 실행..."
"$SCRIPT_DIR/mac-launch-monitors.sh" > /dev/null 2>&1

# ── 4) 제어 모니터 Chrome 핀 ─────────────────────────────────
echo "[4/4] 제어 모니터 Chrome..."
"$SCRIPT_DIR/mac-launch-control.sh" > /dev/null 2>&1

echo ""
echo "============================================"
echo "  ✅ 전체 시작 완료"
echo "============================================"
echo "  서버:     $SERVER_URL"
echo "  제어:     X=${MONITOR_CONTROL_X}"
echo "  중층:     X=${MONITOR_PROMPT_X}"
echo "  강대상:   X=${MONITOR_OUTPUT_X}"
echo ""
echo "  로그 확인:"
echo "    tail -f ~/Library/Logs/unolive-server.log"
echo "    tail -f ~/Library/Logs/unolive-monitors.log"
