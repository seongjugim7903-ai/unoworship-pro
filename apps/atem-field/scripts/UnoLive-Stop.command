#!/bin/bash
# =============================================================
# UnoLive-Stop.command
# 전체 종료 — 서버 + 3대 모니터 키오스크 창
#
# 개인 Chrome 은 건드리지 않음 (독립 프로필만 타겟)
# =============================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field"
fi

# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/monitor-config.sh"

clear
echo "============================================"
echo "  ✖ UnoLive 전체 종료"
echo "============================================"

# ── 서버 종료 ────────────────────────────────────────────────
WATCHDOG_PID_FILE="$HOME/Library/Logs/unolive-server-watchdog.pid"
if [ -f "$WATCHDOG_PID_FILE" ]; then
  WATCHDOG_PID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null)"
  if [ -n "$WATCHDOG_PID" ] && kill -0 "$WATCHDOG_PID" 2>/dev/null; then
    echo "⚙️  서버 워치독 종료 (PID: $WATCHDOG_PID)"
    kill "$WATCHDOG_PID" 2>/dev/null || true
  fi
  rm -f "$WATCHDOG_PID_FILE"
else
  echo "ℹ️  서버 워치독 미실행"
fi

EXISTING=$(lsof -ti:$SERVER_PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "⚙️  서버 종료 (PID: $EXISTING)"
  kill -9 $EXISTING 2>/dev/null
else
  echo "ℹ️  서버 미실행"
fi

# ── 디스플레이 절전 방지(caffeinate) 해제 ────────────────────
CAFFEINATE_PID_FILE="$HOME/Library/Logs/unolive-atem-caffeinate.pid"
if [ -f "$CAFFEINATE_PID_FILE" ]; then
  CAFF_PID="$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null)"
  if [ -n "$CAFF_PID" ] && kill -0 "$CAFF_PID" 2>/dev/null; then
    kill "$CAFF_PID" 2>/dev/null && echo "🖥  디스플레이 절전 방지 해제 (caffeinate PID: $CAFF_PID)"
  fi
  rm -f "$CAFFEINATE_PID_FILE"
else
  echo "ℹ️  절전 방지 프로세스 없음"
fi

# ── UnoLive 런타임 Chrome 선택 종료 ───────────────────────────
# 공유 프로필일 때는 같은 경로가 반복되므로 한 번만 처리한다.
SEEN_PROFILES=""
# atem-*-profile: 3화면 스크립트(Fill/Key/Sub 키오스크) + 카메라 릴레이 창
for PROFILE in "$PROFILE_CONTROL" "$PROFILE_PROMPT" "$PROFILE_OUTPUT" "$PROFILE_CAMERAS" \
               "$PROFILE_DIR/atem-fill-profile" "$PROFILE_DIR/atem-key-profile" "$PROFILE_DIR/atem-sub-profile" \
               "$PROFILE_DIR/atem-cameras-profile"; do
  case ":$SEEN_PROFILES:" in
    *":$PROFILE:"*) continue ;;
  esac
  SEEN_PROFILES="${SEEN_PROFILES}:$PROFILE"

  PIDS=$(pgrep -f "user-data-dir=$PROFILE" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    LABEL=$(basename "$PROFILE")
    echo "⚙️  Chrome $LABEL 종료 (PIDs: $PIDS)"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fi
done

echo ""
echo "✅ 전체 종료 완료 — 운영자 개인 Chrome 은 영향 없음"
echo ""
echo "(이 창은 3초 후 자동 닫힙니다)"
sleep 3
osascript -e 'tell application "Terminal" to close front window' &>/dev/null
