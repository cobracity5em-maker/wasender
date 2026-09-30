@echo off
cd /d "%~dp0"
echo Killing old process on 3000 if any...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>&1
)
echo Starting FULL WASender...
node server.js
pause
