@echo off
powershell.exe -NoProfile -File "%~dp0Install-AlaskaCaja.ps1" -RuntimeArchive "%~dp0python-runtime.zip"
pause
