@echo off
title New Business Discovery - Setup (run once)
cd /d "%~dp0"

echo.
echo  ==========================================================
echo    New Business Discovery  -  First-time Setup (run once)
echo  ==========================================================
echo.

REM ---- 1) Node.js ----
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
echo  [1/3] Node.js : OK
echo.

REM ---- 2) Claude CLI ----
where claude >nul 2>nul
if errorlevel 1 goto INSTALL_CLAUDE
echo  [2/3] Claude   : OK
goto LOGIN

:INSTALL_CLAUDE
echo  [2/3] Installing Claude ... (about 1-2 minutes)
call npm install -g @anthropic-ai/claude-code
where claude >nul 2>nul
if errorlevel 1 goto NPM_FAIL
echo        Claude installed.

:LOGIN
echo.
echo  [3/3] Opening Claude to log in.
echo.
echo     - When Claude opens, follow the prompts and log in with
echo       your subscription account (a web browser will open).
echo     - After login finishes, type   /exit   and press Enter.
echo.
pause
claude
echo.
echo  ==========================================================
echo    Setup complete!  From now on, just run  START.bat
echo  ==========================================================
echo.
pause
goto END

:NO_NODE
echo  [1/3] Node.js is NOT installed.
echo        Opening the download page now. Install the LTS version,
echo        then double-click this SETUP file again.
start "" "https://nodejs.org/en/download"
echo.
pause
goto END

:NPM_FAIL
echo.
echo  [!] Install failed. Check your internet connection and
echo      run SETUP again.
pause
goto END

:END
