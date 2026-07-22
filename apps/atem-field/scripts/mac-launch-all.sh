#!/bin/bash
# scripts/mac-launch-all.sh
# LaunchAgent 진입점 — 서버를 포그라운드로 실행 (KeepAlive 동작을 위해)
# kiosk는 별도 LaunchAgent(com.unolive.kiosk.plist)로 분리 실행

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$HOME/Library/Logs/unolive-server.log"

cd "$SCRIPT_DIR/.." || exit 1

# 부팅 직후 네트워크/시스템 안정화 대기
sleep 5

# 포트 3000 사용 중인 프로세스 정리 (EADDRINUSE 방지)
EXISTING_PID=$(lsof -ti:3000 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 포트 3000 사용 중 (PID: $EXISTING_PID), 종료 중..." >> "$LOG"
  kill -9 $EXISTING_PID 2>/dev/null
  sleep 2
fi

# 의존성 확인
if [ ! -d "node_modules" ]; then
  npm install >> "$LOG" 2>&1
fi

# 빌드 확인
if [ ! -d ".next" ]; then
  npm run build >> "$LOG" 2>&1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 서버 시작" >> "$LOG"

# 포그라운드 실행 (LaunchAgent KeepAlive 유지용)
exec npm start >> "$LOG" 2>&1
