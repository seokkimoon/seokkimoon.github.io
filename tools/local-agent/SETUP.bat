@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 신사업 발굴 - 최초 설치 (1회만)

echo.
echo  ============================================================
echo    신사업 발굴  -  최초 설치 (처음 한 번만 실행)
echo  ============================================================
echo.

REM ---- 1) Node.js 확인 ----
where node >nul 2>nul
if errorlevel 1 (
  echo  [1/3] Node.js가 설치되어 있지 않습니다.
  echo        설치 페이지를 엽니다. LTS 버튼으로 받아 설치한 뒤,
  echo        이 SETUP 파일을 "다시" 더블클릭하세요.
  echo.
  start "" "https://nodejs.org/ko/download"
  pause
  exit /b
)
echo  [1/3] Node.js 확인 완료.
echo.

REM ---- 2) Claude 프로그램 설치 ----
where claude >nul 2>nul
if errorlevel 1 (
  echo  [2/3] Claude 프로그램을 설치합니다... 1~2분 정도 걸립니다.
  call npm install -g @anthropic-ai/claude-code
  if errorlevel 1 (
    echo.
    echo  [!] 설치에 실패했습니다. 인터넷 연결 확인 후 SETUP을 다시 실행하세요.
    pause
    exit /b
  )
) else (
  echo  [2/3] Claude 프로그램 확인 완료.
)
echo.

REM ---- 3) 로그인 ----
echo  [3/3] 로그인 창을 엽니다.
echo.
echo        * 잠시 후 Claude 화면이 뜨면, 안내에 따라
echo          구독 계정(claude.ai)으로 로그인하세요. (브라우저가 열립니다)
echo        * 로그인이 끝나면 그 화면에서   /exit   라고 입력하고 엔터.
echo.
echo        준비되면 아무 키나 누르세요...
pause >nul

where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] claude 명령을 찾지 못했습니다. 이 창을 닫고 SETUP을 한 번 더 더블클릭하세요.
  pause
  exit /b
)
claude

echo.
echo  ============================================================
echo    설치 완료!  이제부터는  START.bat  만 더블클릭하면 됩니다.
echo  ============================================================
echo.
pause
