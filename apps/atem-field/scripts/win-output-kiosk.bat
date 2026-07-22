@echo off
chcp 65001 >nul 2>&1
:: =============================================================
:: scripts/win-output-kiosk.bat
:: 강대상 모니터에 /output 키오스크 전체화면 자동 실행 (Windows)
::
:: 사용법:
::   1. 서버가 실행된 상태에서 이 파일을 더블클릭
::   2. 자동 시작: Win+R → shell:startup → 이 파일의 바로가기 붙여넣기
::
:: 설정:
::   - SERVER_IP: 서버 PC의 IP (같은 PC면 localhost)
::   - MONITOR_X: 강대상 모니터의 X 좌표
::     단일 모니터: 0  |  듀얼(오른쪽): 1920  |  3번째(오른쪽): 3840
:: =============================================================

:: ── 설정값 (상황에 맞게 수정) ────────────────────────────────
set SERVER_IP=localhost
set SERVER_PORT=3000
set OUTPUT_URL=http://%SERVER_IP%:%SERVER_PORT%/output
set MONITOR_X=1920
set MONITOR_Y=0
set KIOSK_PROFILE=%TEMP%\unolive-kiosk-profile

:: Chrome 경로 자동 탐색
set CHROME=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if "%CHROME%"=="" if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
if "%CHROME%"=="" (
    echo [ERROR] Chrome을 찾을 수 없습니다.
    echo "C:\Program Files\Google\Chrome\Application\chrome.exe" 경로를 확인하세요.
    pause
    exit /b 1
)
:: ─────────────────────────────────────────────────────────────

echo ============================================
echo   UnoLive Output Kiosk Launcher (Windows)
echo ============================================
echo.

:: ── 서버 응답 대기 (최대 90초) ───────────────────────────────
echo [1/3] 서버 응답 대기 중... (%OUTPUT_URL%)
set /a COUNT=0
set /a MAX_WAIT=90

:WAIT_LOOP
curl -s "http://%SERVER_IP%:%SERVER_PORT%" >nul 2>&1
if %ERRORLEVEL%==0 goto SERVER_OK
set /a COUNT+=1
if %COUNT% GEQ %MAX_WAIT% (
    echo [ERROR] 서버가 %MAX_WAIT%초 내에 응답하지 않습니다.
    echo 서버를 먼저 실행하세요: npm start
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:SERVER_OK
echo [OK] 서버 확인 완료 (%COUNT%초 대기)
echo.

:: ── Chrome 강제 종료 ─────────────────────────────────────────
echo [2/3] Chrome 종료 중...
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 3 /nobreak >nul

:: 잠금 파일 삭제
if exist "%KIOSK_PROFILE%\SingletonLock" del /f "%KIOSK_PROFILE%\SingletonLock" >nul 2>&1
if exist "%KIOSK_PROFILE%\SingletonCookie" del /f "%KIOSK_PROFILE%\SingletonCookie" >nul 2>&1
if exist "%KIOSK_PROFILE%\SingletonSocket" del /f "%KIOSK_PROFILE%\SingletonSocket" >nul 2>&1

echo [OK] Chrome 종료 완료
echo.

:: ── Chrome 키오스크 모드 실행 ────────────────────────────────
echo [3/3] Chrome 키오스크 실행 중...
start "" "%CHROME%" ^
  --kiosk ^
  --window-position=%MONITOR_X%,%MONITOR_Y% ^
  --user-data-dir="%KIOSK_PROFILE%" ^
  --no-first-run ^
  --disable-infobars ^
  --noerrdialogs ^
  --disable-session-crashed-bubble ^
  --autoplay-policy=no-user-gesture-required ^
  --use-fake-ui-for-media-stream ^
  "%OUTPUT_URL%"

echo.
echo ============================================
echo   강대상 모니터에 Output이 열렸습니다.
echo   이 창은 닫아도 됩니다.
echo ============================================
echo.
timeout /t 5
