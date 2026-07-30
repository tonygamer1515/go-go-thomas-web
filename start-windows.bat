@echo off
setlocal
cd /d "%~dp0"
echo Starting the fully offline Go Go Thomas web port...
echo Keep this window open while you play.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-windows.ps1"
if errorlevel 1 (
  echo.
  echo The local server could not start. Try right-clicking this file and choosing Run as administrator.
  pause
)
