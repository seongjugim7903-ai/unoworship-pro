#!/bin/bash
# scripts/mac-server-dev.sh
# 방송 서버(dev) 자동 시작 — LaunchAgent(com.unolive.startup, KeepAlive)용.
#   dev 서버(next dev + socket.io, tsx server.ts)는 빌드 불필요 + 항상 최신 코드.
#   컴포즈 제어는 다른 디바이스에서 http://<맥IP>:3000/composer 로 원격 접속.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# [FIX 2026-07-10] 소켓 인증 우회 + ATEM IP — 이게 없으면 부팅 자동실행 서버가
#   출력창/컴포즈 소켓을 전부 거부해 "Offline·송출 불가"가 된다 (아침 실사고).
export UNOLIVE_SOCKET_DEV_BYPASS="${UNOLIVE_SOCKET_DEV_BYPASS:-1}"
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"
LOG="$HOME/Library/Logs/unolive-launch.log"
mkdir -p "$HOME/Library/Logs"
cd /Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field || exit 1

# 부팅 직후 네트워크/시스템 안정화
sleep 3

# 포트3000 기존 프로세스 정리 (재부팅 시 떠있던 서버/터미널 서버 죽이기)
EXIST=$(lsof -ti:3000 2>/dev/null)
if [ -n "$EXIST" ]; then
  echo "[$(date '+%F %T')] 포트3000 기존 PID 정리: $EXIST" >> "$LOG"
  kill -9 $EXIST 2>/dev/null
  sleep 1
fi

# 의존성 확인
[ -d node_modules ] || npm install >> "$LOG" 2>&1

echo "[$(date '+%F %T')] dev 서버 시작 (npm run dev)" >> "$LOG"
exec npm run dev >> "$LOG" 2>&1
