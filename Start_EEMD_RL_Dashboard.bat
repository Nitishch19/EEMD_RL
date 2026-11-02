@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)
echo Installing verified dependencies...
if exist "node_modules\vinext\dist\cli.js" goto launch
call npx --yes pnpm@11.25.0 install --frozen-lockfile
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)
:launch
echo.
echo EEMD-RL will be available at http://127.0.0.1:5173
echo Press Ctrl+C to stop the dashboard.
node ".\node_modules\next\dist\bin\next" dev --webpack --hostname 127.0.0.1 --port 5173
if errorlevel 1 (
  echo Startup failed. Read the error above. If another server is reported,
  echo verify its PID and command line before stopping that process.
  echo Do not close every node.exe process or delete your research data.
)
pause
