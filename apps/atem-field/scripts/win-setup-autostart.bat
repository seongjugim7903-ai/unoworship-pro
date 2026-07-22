@echo off
chcp 65001 >nul 2>&1
:: =============================================================
:: scripts/win-setup-autostart.bat
:: Windows 부팅 시 자동실행 등록/해제 스크립트
::
:: 시작 프로그램 폴더에 바로가기를 생성하여
:: 로그인 시 자동으로 서버 + 키오스크가 실행되도록 합니다.
:: =============================================================

echo ============================================
echo   UnoLive Windows 자동실행 설정
echo ============================================
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0
set SERVER_SCRIPT=%SCRIPT_DIR%win-server-start.bat
set KIOSK_SCRIPT=%SCRIPT_DIR%win-output-kiosk.bat

echo [1] 자동실행 등록 (부팅 시 서버+키오스크 자동 시작)
echo [2] 자동실행 해제
echo [3] 취소
echo.
set /p CHOICE="선택 (1/2/3): "

if "%CHOICE%"=="1" goto REGISTER
if "%CHOICE%"=="2" goto UNREGISTER
goto END

:REGISTER
echo.
echo 자동실행을 등록합니다...

:: PowerShell로 바로가기 생성 (서버)
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_DIR%\UnoLive Server.lnk'); $s.TargetPath = '%SERVER_SCRIPT%'; $s.WorkingDirectory = '%SCRIPT_DIR%..'; $s.Description = 'UnoLive Server Auto Start'; $s.Save()"
if %ERRORLEVEL%==0 (
    echo [OK] 서버 자동실행 등록 완료
) else (
    echo [ERROR] 서버 바로가기 생성 실패
)

:: PowerShell로 바로가기 생성 (키오스크)
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_DIR%\UnoLive Kiosk.lnk'); $s.TargetPath = '%KIOSK_SCRIPT%'; $s.WorkingDirectory = '%SCRIPT_DIR%..'; $s.Description = 'UnoLive Kiosk Auto Start'; $s.Save()"
if %ERRORLEVEL%==0 (
    echo [OK] 키오스크 자동실행 등록 완료
) else (
    echo [ERROR] 키오스크 바로가기 생성 실패
)

echo.
echo 등록 완료! 다음 부팅 시 자동으로 실행됩니다.
echo 바로가기 위치: %STARTUP_DIR%
goto END

:UNREGISTER
echo.
echo 자동실행을 해제합니다...
if exist "%STARTUP_DIR%\UnoLive Server.lnk" (
    del "%STARTUP_DIR%\UnoLive Server.lnk"
    echo [OK] 서버 자동실행 해제
) else (
    echo [INFO] 서버 자동실행이 등록되어 있지 않습니다
)
if exist "%STARTUP_DIR%\UnoLive Kiosk.lnk" (
    del "%STARTUP_DIR%\UnoLive Kiosk.lnk"
    echo [OK] 키오스크 자동실행 해제
) else (
    echo [INFO] 키오스크 자동실행이 등록되어 있지 않습니다
)
echo.
echo 해제 완료!
goto END

:END
echo.
pause
