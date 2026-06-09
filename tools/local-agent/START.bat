@echo off
title New Business Discovery - Start
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto NEED_SETUP
where claude >nul 2>nul
if errorlevel 1 goto NEED_SETUP

echo.
echo  ============================================
echo    Starting New Business Discovery bridge...
echo    - The browser opens automatically in a moment
echo    - If the page is blank, press F5 (refresh)
echo    - To stop: close this black window
echo  ============================================
echo.

start "" "http://localhost:4178"
node server.mjs
pause
goto END

:NEED_SETUP
echo.
echo  [!] Not set up yet. Please double-click  SETUP.bat  first.
echo.
pause

:END
