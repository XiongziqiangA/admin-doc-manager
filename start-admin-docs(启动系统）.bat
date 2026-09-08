@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-prod.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. Please check the error message above.
  pause
  exit /b 1
)

start "" "http://localhost:8080"
echo.
echo System started: http://localhost:8080
ping -n 4 127.0.0.1 >nul
