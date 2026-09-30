@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Missing node_modules. Run INSTALL.bat first.
  pause
  exit /b 1
)
npm start
pause
