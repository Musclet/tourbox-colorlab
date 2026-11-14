@echo off
set "COLORLAB_MODE=Restore"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0ColorLab.ps1"
pause
