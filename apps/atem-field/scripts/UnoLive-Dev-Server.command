#!/bin/bash
# 개발용 서버 전용 실행 — 창 배치 없음. 서버만 띄우고 터미널에 로그 표시.
#   개발 워크플로: 이 커맨드 실행 → 브라우저에서 /composer + /atem-dev 열기.
#   현장(예배)은 이 커맨드가 아니라 부팅 자동실행/3화면 아이콘을 사용할 것.
#   watch 모드: 서버 코드(server.ts, lib/server 등) 수정 시 자동 재시작 — 개발에선 편리,
#   운영에선 금지(그래서 3화면 스크립트는 non-watch).

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
# 현장과 동일한 소켓/미들웨어 우회 — 없으면 출력창·iPad 소켓이 인증에 걸릴 수 있음
export UNOLIVE_SOCKET_DEV_BYPASS=1
# ATEM 자동 연결 (맥미니 en9 직결 고정 IP)
export UNOLIVE_ATEM_IP="${UNOLIVE_ATEM_IP:-172.26.42.5}"

if [ -f "$(dirname "$0")/../package.json" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
  PROJECT_DIR="/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field"
fi
cd "$PROJECT_DIR" || { echo "❌ 프로젝트 폴더 없음: $PROJECT_DIR"; exit 1; }

clear
echo "============================================"
echo "  🛠  UnoLive 개발 서버 (창 배치 없음)"
echo "============================================"
echo "  멀티뷰:  http://localhost:3000/atem-dev"
echo "  컴포즈:  http://localhost:3000/composer"
echo "  LAN:     http://$(ipconfig getifaddr en0 2>/dev/null || echo '?'):3000"
echo "  종료:    Ctrl+C"
echo "============================================"
echo ""

# 이미 서버가 있으면 그대로 사용 (자동실행이 띄운 서버 재활용)
if curl -s http://localhost:3000 >/dev/null 2>&1; then
  echo "ℹ️  서버가 이미 실행 중입니다 — 그대로 사용하세요."
  echo "   (재시작하려면 UnoLive-Stop.command 후 다시 실행)"
  exit 0
fi

npm run dev:watch
