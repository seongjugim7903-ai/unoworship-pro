@echo off
chcp 65001 >nul 2>&1
:: =============================================================
:: scripts/win-server-start.bat
:: UnoLive 서버 시작 스크립트 (Windows)
::
:: 사용법: 이 파일을 더블클릭하면 서버가 시작됩니다.
:: =============================================================

echo ============================================
echo   UnoLive Server Starter (Windows)
echo ============================================
echo.

:: ── 프로젝트 폴더로 이동 ────────────────────────────────────
cd /d "%~dp0\.."
echo [INFO] 프로젝트 경로: %CD%
echo.

:: ── Node.js 확인 ────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 LTS 버전을 설치하세요.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

:: ── 의존성 설치 확인 ────────────────────────────────────────
if not exist "node_modules" (
    echo [INFO] 의존성 설치 중... (첫 실행 시 1-2분 소요)
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install 실패
        pause
        exit /b 1
    )
    echo [OK] 의존성 설치 완료
    echo.
)

:: ── 빌드 확인 ───────────────────────────────────────────────
if not exist ".next" (
    echo [INFO] 프로젝트 빌드 중... (첫 실행 시 1-2분 소요)
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] 빌드 실패
        pause
        exit /b 1
    )
    echo [OK] 빌드 완료
    echo.
)

:: ── 서버 시작 ───────────────────────────────────────────────
echo [INFO] 서버 시작 중...
echo.
echo ============================================
echo   서버가 시작되면 다른 PC에서 접속 가능:
echo   http://[이 PC의 IP]:3000
echo.
echo   이 창을 닫으면 서버가 종료됩니다.
echo ============================================
echo.

npm start
