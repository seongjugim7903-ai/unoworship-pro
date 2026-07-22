#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h:h}"

cd "$PROJECT_ROOT"

echo ""
echo "UnoLive PPT/Keynote 이미지 슬라이드 생성"
echo "----------------------------------------"
echo "1. generator/ppt-slides/inbox 안에 이미지 폴더를 넣어 주세요."
echo "2. 생성 파일은 FILES/02_PRAISE에 저장되고, 원본은 inbox/archive로 이동합니다."
echo ""

read "?프로그램 이름: " PROGRAM_NAME
if [[ -z "$PROGRAM_NAME" ]]; then
  PROGRAM_NAME="이미지 슬라이드"
fi

npm run generate:ppt -- --name "$PROGRAM_NAME" --library praise

echo ""
echo "완료되었습니다."
echo "콤포우즈 페이지에서 PPT 버튼을 눌러 가져오세요."
echo ""
read "?창을 닫으려면 Enter 키를 누르세요. "
