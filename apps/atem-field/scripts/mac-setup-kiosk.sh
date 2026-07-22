#!/bin/bash
# =============================================================
# scripts/mac-setup-kiosk.sh
# 키오스크 자동실행 원클릭 설정 (교회 배포용)
#
# ⚠️ 중요:
#   기존의 pkill -9 'Google Chrome' 은 제거됨.
#   운영자 개인 Chrome 세션(Gmail, Supabase 등)을 보호하기 위해
#   키오스크 프로필(--user-data-dir) 로 실행된 인스턴스만 선택 종료.
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/monitor-config.sh"

echo "============================================"
echo "  UnoLive 키오스크 자동실행 설정"
echo "============================================"
echo ""

# ── 1. 기존 항목 전부 정리 ───────────────────────────────────
echo "[1/3] 기존 설정 정리..."
launchctl bootout "gui/$(id -u)/com.unolive.kiosk" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.unolive.prompt-kiosk" 2>/dev/null || true

osascript -e 'tell application "System Events"
  try
    delete login item "UnoLiveKiosk"
  end try
  try
    delete login item "UnoLive Kiosk"
  end try
  try
    delete login item "UnoLiveMonitors"
  end try
end tell' 2>/dev/null || true

rm -rf ~/Applications/UnoLiveKiosk.app 2>/dev/null
rm -rf ~/Applications/UnoLiveMonitors.app 2>/dev/null
echo "  완료"
echo ""

# ── 2. AppleScript 앱 생성 — 두 키오스크 동시 실행 ──────────
echo "[2/3] UnoLiveMonitors.app 생성..."
mkdir -p ~/Applications

LAUNCH_SCRIPT="$SCRIPT_DIR/mac-launch-monitors.sh"

cat > /tmp/unolive-monitors.applescript << APPLESCRIPT
on run
  -- 통합 런처(mac-launch-monitors.sh) 를 --boot 모드로 실행
  -- 내부에서 Dock/디스플레이 안정화 대기 + 서버 대기 + 두 모니터 순차 실행
  do shell script "'${LAUNCH_SCRIPT}' --boot > /dev/null 2>&1 &"
end run
APPLESCRIPT

osacompile -o ~/Applications/UnoLiveMonitors.app /tmp/unolive-monitors.applescript
rm /tmp/unolive-monitors.applescript

if [ -d ~/Applications/UnoLiveMonitors.app ]; then
  echo "  ~/Applications/UnoLiveMonitors.app 생성 완료"
else
  echo "  [ERROR] 앱 생성 실패"
  exit 1
fi
echo ""

# ── 3. 로그인 항목 등록 ─────────────────────────────────────
echo "[3/3] 로그인 항목 등록..."
osascript -e 'tell application "System Events" to make login item at end with properties {path:"'"$HOME"'/Applications/UnoLiveMonitors.app", hidden:true, name:"UnoLiveMonitors"}' 2>/dev/null || true

LOGIN_ITEMS=$(osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null)
echo "  현재 로그인 항목: $LOGIN_ITEMS"
echo ""

# ── 안내 ─────────────────────────────────────────────────────
cat <<EOF
============================================
  ✅ 설정 완료! 재부팅하면 자동 실행됩니다.
============================================

💡 운영자 Chrome (개인 로그인) 은 영향받지 않습니다:
   - 키오스크는 독립 프로필 사용
     · 중층: $PROFILE_PROMPT
     · 강대상: $PROFILE_OUTPUT
   - 즉시 테스트: $SCRIPT_DIR/mac-launch-monitors.sh

💡 제어 모니터에 에디터 창 띄우기:
   - $SCRIPT_DIR/mac-launch-control.sh
   - 독립 프로필 $PROFILE_CONTROL 사용
   - 운영자 개인 Chrome 과 분리됨
EOF
