#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# scripts/macos-app-wrapper/build-app.sh
#
# 맥미니 서버 PC 용 UnoLive.app 번들 생성기
#
# 이 스크립트는:
#   1. /Applications/UnoLive.app 디렉토리 구조 생성
#   2. Info.plist, 실행 스크립트, 아이콘 배치
#   3. 더블클릭하면 Terminal 창 없이 백그라운드에서 `npm run electron:dev` 기동
#
# 주의:
#   - 내 맥미니 전용 (Node + 프로젝트 경로가 고정). 고객 배포용 아님.
#   - 프로젝트 경로를 옮기면 스크립트 재생성 필요.
#   - 고객 배포용 .dmg 는 안정화 문서 3.4 참조.
#
# 사용:
#   bash scripts/macos-app-wrapper/build-app.sh
# ──────────────────────────────────────────────────────────────────

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="UnoLive"
APP_BUNDLE="/Applications/${APP_NAME}.app"
CONTENTS="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"
ICON_SRC="${PROJECT_ROOT}/build/icon.icns"

echo "[build-app] 프로젝트 경로: ${PROJECT_ROOT}"
echo "[build-app] 앱 번들 경로: ${APP_BUNDLE}"

# ── 기존 번들 제거 ──
if [ -d "${APP_BUNDLE}" ]; then
  echo "[build-app] 기존 ${APP_BUNDLE} 제거"
  rm -rf "${APP_BUNDLE}"
fi

# ── 디렉토리 구조 ──
mkdir -p "${MACOS_DIR}" "${RESOURCES}"

# ── 아이콘 ──
if [ ! -f "${ICON_SRC}" ]; then
  echo "[build-app] ⚠️  ${ICON_SRC} 없음. 먼저 아이콘 생성 필요."
  echo "[build-app] 힌트: sips + iconutil 로 public/icons/icon.svg 에서 생성"
  exit 1
fi
cp "${ICON_SRC}" "${RESOURCES}/AppIcon.icns"

# ── Info.plist ──
cat > "${CONTENTS}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>                <string>UnoLive</string>
  <key>CFBundleDisplayName</key>         <string>UnoLive</string>
  <key>CFBundleIdentifier</key>          <string>io.unolive.app</string>
  <key>CFBundleVersion</key>             <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>  <string>0.1.0</string>
  <key>CFBundleExecutable</key>          <string>UnoLive</string>
  <key>CFBundleIconFile</key>            <string>AppIcon</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>LSMinimumSystemVersion</key>      <string>11.0</string>
  <key>NSHighResolutionCapable</key>     <true/>
  <key>LSUIElement</key>                 <false/>
  <key>NSCameraUsageDescription</key>    <string>UnoLive 는 라이브 방송을 위해 카메라에 접근합니다.</string>
  <key>NSMicrophoneUsageDescription</key><string>UnoLive 는 라이브 방송을 위해 마이크에 접근합니다.</string>
</dict>
</plist>
EOF

# ── 실행 스크립트 ──
#   GUI 에서 .app 을 띄우면 사용자 쉘 환경(PATH, nvm) 을 상속받지 않음.
#   → PATH 를 수동으로 세팅하고 nohup 으로 백그라운드 기동하여 Terminal 창 없이 실행.
cat > "${MACOS_DIR}/UnoLive" <<EOF
#!/bin/bash
# UnoLive 런처 (자동 생성, 수정하지 마세요)

# ── 환경 ──
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"
export NODE_ENV=development
export UNOLIVE_DEVICE_TYPE=server

# ── 로그 ──
LOG_DIR="\${HOME}/Library/Logs/UnoLive"
mkdir -p "\${LOG_DIR}"
LOG_FILE="\${LOG_DIR}/unolive-\$(date +%Y%m%d-%H%M%S).log"

# ── 프로젝트 디렉토리 이동 ──
cd "${PROJECT_ROOT}"

# ── 이미 실행 중인지 체크 (중복 기동 방지) ──
if pgrep -f "electron .* ${PROJECT_ROOT}" >/dev/null; then
  osascript -e 'display notification "UnoLive 가 이미 실행 중입니다" with title "UnoLive"'
  exit 0
fi

# ── Electron 기동 ──
#   foreground 로 실행하면 .app 이 Dock 에 계속 떠있고, Electron 이 종료되면 같이 종료됨.
#   stdout/stderr 은 로그 파일로.
exec /opt/homebrew/bin/npm run electron:dev > "\${LOG_FILE}" 2>&1
EOF

chmod +x "${MACOS_DIR}/UnoLive"

# ── 캐시된 아이콘 무효화 (Finder/Dock 이 새 아이콘 인식하도록) ──
touch "${APP_BUNDLE}"
/usr/bin/killall -HUP Finder 2>/dev/null || true
/usr/bin/killall Dock 2>/dev/null || true

# ── 로그인 항목 등록 (부팅 시 자동 시작) ──
#   기존 동일 경로의 로그인 항목은 먼저 제거한 뒤 재등록 (중복 방지).
echo "[build-app] 로그인 항목 등록 (부팅 시 자동 실행)..."
osascript <<OSA 2>/dev/null || echo "[build-app] ⚠️  로그인 항목 등록 실패 — 수동으로 시스템 설정 → 로그인 항목에서 추가해 주세요"
tell application "System Events"
  try
    delete (every login item whose name is "${APP_NAME}")
  end try
  make login item at end with properties {path:"${APP_BUNDLE}", hidden:false}
end tell
OSA

echo ""
echo "✅ ${APP_BUNDLE} 생성 완료"
echo "✅ 로그인 항목 등록됨 — 맥미니 부팅 시 UnoLive 자동 실행"
echo ""
echo "다음 단계:"
echo "  1. Finder → 응용 프로그램 → UnoLive 더블클릭"
echo "  2. Dock 에 고정하려면: Dock 아이콘 우클릭 → 옵션 → Dock 에 유지"
echo "  3. 바탕화면 아이콘: Finder 에서 UnoLive.app 을 바탕화면으로 ⌥⌘드래그 (별칭 생성)"
echo "  4. 자동 시작 해제: 시스템 설정 → 일반 → 로그인 항목 → UnoLive ➖"
echo ""
echo "로그 위치: ~/Library/Logs/UnoLive/"
