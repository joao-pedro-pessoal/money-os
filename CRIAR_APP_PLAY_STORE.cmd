@echo off
setlocal
cd /d "%~dp0"
title Money OS - app para a Play Store
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-play-bundle.ps1"
set "bundleExit=%ERRORLEVEL%"
echo.
echo Prima uma tecla para fechar esta janela.
pause >nul
exit /b %bundleExit%
