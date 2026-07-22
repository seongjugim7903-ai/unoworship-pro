#!/bin/bash
# =============================================================
# scripts/install-desktop-shortcuts.sh
# 바탕화면에 원클릭 런처 .command 파일 설치
#
# 실행 후 바탕화면에 생기는 것:
#   🎚  UnoLive-Compose-Start.command  ← 컴포즈 에디터 + 출력 모니터 시작
#   🎬 UnoLive-Dev-Start.command      ← 개발 모드 시작 (watch + HMR)
#   ↻  UnoLive-Restart-Server.command ← 서버만 재시작 (창 유지)
#   ✖  UnoLive-Stop.command           ← 전체 종료
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP="$HOME/Desktop"

echo "============================================"
echo "  바탕화면 런처 설치"
echo "============================================"
echo ""

for NAME in UnoLive-Compose-Start UnoLive-Dev-Start UnoLive-Restart-Server UnoLive-Stop; do
  SRC="$SCRIPT_DIR/${NAME}.command"
  DST="$DESKTOP/${NAME}.command"

  if [ ! -f "$SRC" ]; then
    echo "⚠️  원본 없음: $SRC"
    continue
  fi

  chmod +x "$SRC"

  # 기존 링크/파일 백업
  if [ -e "$DST" ] || [ -L "$DST" ]; then
    BACKUP="$DST.backup-$(date +%Y%m%d-%H%M%S)"
    mv "$DST" "$BACKUP"
    echo "↳ 기존 항목 백업: $BACKUP"
  fi

  # Finder 더블클릭 안정성을 위해 심볼릭 링크 대신 실제 .command 파일 복사
  cp "$SRC" "$DST"
  chmod +x "$DST"
  xattr -d com.apple.quarantine "$DST" 2>/dev/null || true

  echo "✅ $DST"
done

echo ""
echo "💡 바탕화면에서 더블클릭으로 실행하세요."
echo "   최초 1회 — macOS 가 '확인되지 않은 개발자' 경고 시:"
echo "     시스템 설정 → 개인정보 보호 및 보안 → '확인 없이 열기'"
