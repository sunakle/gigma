@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 26 or open Gigma for Windows.
  pause
  exit /b 1
)
if not exist "build\server.cjs" (
  if not exist "node_modules\.bin\vite.cmd" call npm ci
  if errorlevel 1 goto :failed
  call npm run build
  if errorlevel 1 goto :failed
)
node build\server.cjs --open
if errorlevel 1 goto :failed
exit /b 0
:failed
echo Gigma could not start. See the error above.
pause
exit /b 1
