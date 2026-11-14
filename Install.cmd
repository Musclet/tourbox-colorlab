@echo off
set "COLORLAB_MODE=Install"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0ColorLab.ps1"
pause
