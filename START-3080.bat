@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo node_modules missing. Run INSTALL.bat first.
  pause
  exit /b 1
)
set PORT=3080
echo Starting on http://127.0.0.1:3080
node server.js
pause
