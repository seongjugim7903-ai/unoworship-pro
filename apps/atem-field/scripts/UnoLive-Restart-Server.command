#!/bin/bash
# =============================================================
# UnoLive-Restart-Server.command
# 서버만 재시작 (3대 모니터 창은 유지)
#
# 사용 시점:
#   - server.ts 를 수정했는데 tsx watch 가 반영 안 될 때
#   - 캐시 꼬임·소켓 끊김 등 "서버만 새로 띄우자" 일 때
#
# 키오스크·제어창은 그대로 유지되고, 서버 재시작 후
# 자동으로 WebSocket 재연결됨.
# =============================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus"
fi

# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/monitor-config.sh"

cd "$PROJECT_DIR" || exit 1

clear
echo "============================================"
echo "  ↻ UnoLive 서버 재시작"
echo "============================================"

# ── 기존 서버 종료 ───────────────────────────────────────────
EXISTING=$(lsof -ti:$SERVER_PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "⚙️  기존 서버 종료 (PID: $EXISTING)"
  kill -9 $EXISTING 2>/dev/null
  sleep 2
else
  echo "ℹ️  실행 중인 서버 없음 — 새로 시작"
fi

# ── 서버 재시작 (watch 모드, 이 터미널 창에 로그) ────────────
echo "🚀 서버 시작 ($SERVER_URL)..."
echo "🔒 허용 Host: $UNOLIVE_ALLOWED_LAN_HOSTS"
echo ""
echo "💡 키오스크·제어 창은 유지됩니다."
echo "   재시작 완료 후 자동으로 재연결됩니다."
echo ""

exec npm run dev:watch
