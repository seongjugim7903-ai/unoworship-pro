@echo off
:: ============================================================
:: UnoLive PC1 자동 시작 스크립트 (Windows)
::
:: 설치 방법:
::   1. 이 파일을 바탕화면에 복사
::   2. 자동 시작 원할 경우:
::      Win+R → shell:startup → 이 파일의 바로가기를 붙여넣기
::
:: 동작:
::   - Chrome을 키오스크(앱) 모드로 열어 브라우저 테두리 없이 실행
::   - /output 페이지가 전체화면으로 즉시 표시
::   - 두 번째 모니터에 표시하려면 --window-position 값 조정
:: ============================================================

:: ── 설정값 (상황에 맞게 수정) ──────────────────────────────
set SERVER_IP=localhost
set SERVER_PORT=3000
set OUTPUT_URL=http://%SERVER_IP%:%SERVER_PORT%/output

:: Chrome 경로 (설치 위치에 따라 수정 가능)
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

:: 두 번째 모니터 위치 (첫 모니터가 1920px 너비일 경우)
:: 단일 모니터 사용 시 --window-position=0,0 으로 변경
set MONITOR2_X=1920
set MONITOR2_Y=0
:: ──────────────────────────────────────────────────────────

echo UnoLive PC1 아웃풋 실행 중...
echo URL: %OUTPUT_URL%
echo.

:: 이전에 열려 있던 UnoLive Output 창 닫기 (선택사항)
:: taskkill /F /IM chrome.exe /T >nul 2>&1

:: Chrome 앱 모드로 실행 (브라우저 UI 없음, 전체화면)
start "" %CHROME% ^
  --app=%OUTPUT_URL% ^
  --start-fullscreen ^
  --window-position=%MONITOR2_X%,%MONITOR2_Y% ^
  --window-size=1920,1080 ^
  --disable-infobars ^
  --noerrdialogs ^
  --no-first-run ^
  --disable-session-crashed-bubble ^
  --autoplay-policy=no-user-gesture-required

echo 완료. 아웃풋 창이 열렸습니다.
