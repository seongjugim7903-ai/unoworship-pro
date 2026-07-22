#!/bin/bash
# =============================================================
# scripts/mac-server-start.sh
# UnoLive 서버 자동 시작 스크립트 (Mac Mini 전용)
#
# 역할:
#   - npm run build (최초 또는 업데이트 후 1회)
#   - npm start 로 프로덕션 서버 실행
#   - 로그는 ~/Library/Logs/unolive-server.log 에 저장
#
# 실행 방법:
#   chmod +x scripts/mac-server-start.sh
#   ./scripts/mac-server-start.sh
#
# 자동 시작 설정은 com.unolive.startup.plist 참고
# =============================================================

# ── 설정 ────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # 이 스크립트가 있는 폴더 기준
LOG_FILE="$HOME/Library/Logs/unolive-server.log"
PORT=3000
NODE_PATH=$(which node 2>/dev/null || echo "/usr/local/bin/node")
NPM_PATH=$(which npm 2>/dev/null || echo "/usr/local/bin/npm")

# ── 로그 폴더 생성 ────────────────────────────────────────────
mkdir -p "$HOME/Library/Logs"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] UnoLive 서버 시작 중..." >> "$LOG_FILE"

# ── 이전 프로세스 종료 (중복 실행 방지) ─────────────────────
pkill -f "tsx server.ts" 2>/dev/null || true
pkill -f "node.*unolive" 2>/dev/null || true
sleep 1

# ── 프로젝트 폴더로 이동 ─────────────────────────────────────
cd "$PROJECT_DIR" || {
  echo "[$(date)] 오류: 프로젝트 폴더를 찾을 수 없습니다: $PROJECT_DIR" >> "$LOG_FILE"
  exit 1
}

# ── 의존성 설치 확인 ─────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm install 실행 중..." >> "$LOG_FILE"
  "$NPM_PATH" install >> "$LOG_FILE" 2>&1
fi

# ── 빌드 (최초 1회 또는 .next 폴더 없을 때) ─────────────────
if [ ! -d ".next" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm run build 실행 중..." >> "$LOG_FILE"
  "$NPM_PATH" run build >> "$LOG_FILE" 2>&1
fi

# ── 서버 실행 ─────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 서버 시작 PORT=$PORT" >> "$LOG_FILE"
exec "$NPM_PATH" start >> "$LOG_FILE" 2>&1
