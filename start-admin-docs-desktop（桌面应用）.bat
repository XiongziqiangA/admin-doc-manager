@echo off
setlocal
cd /d "%~dp0"

set "ADMIN_DOCS_ROOT=%~dp0"
set "DESKTOP_EXE=%~dp0desktop\release\企业行政资料管理系统 便携版 0.1.0.exe"
if exist "%DESKTOP_EXE%" (
  start "" "%DESKTOP_EXE%"
  exit /b 0
)

pnpm --filter desktop dev
if errorlevel 1 (
  echo.
  echo Desktop app startup failed. Please check the error message above.
  pause
  exit /b 1
)
