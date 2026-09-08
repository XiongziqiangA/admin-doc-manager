@echo off
setlocal
cd /d "%~dp0"

set "ADMIN_DOCS_ROOT=%~dp0"
pnpm --filter desktop dev
if errorlevel 1 (
  echo.
  echo Desktop app startup failed. Please check the error message above.
  pause
  exit /b 1
)
