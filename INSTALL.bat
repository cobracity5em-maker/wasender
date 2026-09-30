@echo off
cd /d "%~dp0"
echo ========================================
echo   WASender - Install dependencies
echo ========================================
echo.
if exist node_modules (
  echo Removing old node_modules...
  rmdir /s /q node_modules
)
if exist package-lock.json del /f /q package-lock.json
echo Installing...
call npm install
if errorlevel 1 call npm install --force
echo.
echo Done. Start with START-3080.bat
pause
