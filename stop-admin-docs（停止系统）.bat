@echo off
setlocal
cd /d "%~dp0"

docker compose --env-file "%~dp0.env.production" -f "%~dp0docker-compose.prod.yml" down
if errorlevel 1 (
  echo.
  echo Stop failed. Please check the error message above.
  pause
  exit /b 1
)

echo.
echo System stopped. Data files are kept under data\postgres and data\storage.
ping -n 4 127.0.0.1 >nul
