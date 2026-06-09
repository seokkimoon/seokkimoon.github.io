@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] 아직 설치가 안 되어 있습니다. 먼저  SETUP.bat  을 더블클릭하세요.
  echo.
  pause
  exit /b
)
where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] 아직 설치가 안 되어 있습니다. 먼저  SETUP.bat  을 더블클릭하세요.
  echo.
  pause
  exit /b
)

echo.
echo  ============================================
echo    신사업 발굴 브리지를 시작합니다...
echo    - 잠시 후 브라우저가 자동으로 열립니다
echo    - 화면이 비어 있으면 F5(새로고침) 한 번
echo    - 종료하려면 이 검은 창을 닫으세요
echo  ============================================
echo.

start "" "http://localhost:4178"
node server.mjs
pause
