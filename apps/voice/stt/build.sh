#!/bin/bash
# Apple Speech STT 빌드 — 정식 .app 번들로 만든다.
#
# 왜 번들인가: macOS TCC(개인정보 권한)는 실행 파일에 심은 __info_plist 섹션을 인정하지 않는다.
#   번들 없이 실행하면 음성 인식 접근 순간 SIGABRT 로 죽는다.
#     "attempted to access privacy-sensitive data without a usage description"
#   Contents/Info.plist 를 갖춘 .app 안에서 실행해야 권한 프롬프트가 뜨고 허용이 기억된다.
#
# 산출물: stt/UnoWorshipVoice.app/Contents/MacOS/unoworship-stt  (Node 어댑터가 이 경로를 실행)

set -euo pipefail
cd "$(dirname "$0")"

APP="UnoWorshipVoice.app"
MACOS_DIR="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS_DIR"
cp Info.plist "$APP/Contents/Info.plist"

echo "▸ 컴파일"
swiftc -O \
  -framework Speech -framework AVFoundation \
  -o "$MACOS_DIR/unoworship-stt" \
  AppleSpeechCLI.swift

echo "▸ 서명 (애드혹)"
# 번들 전체를 서명해야 TCC 가 Info.plist 와 실행 파일을 한 몸으로 인식한다.
codesign --force --deep -s - "$APP"

echo "✅ 빌드 완료: $(pwd)/$MACOS_DIR/unoworship-stt"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature" || true
