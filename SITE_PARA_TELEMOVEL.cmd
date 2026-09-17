@echo off
setlocal
cd /d "%~dp0"
title Money OS - PC e telemovel
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-phone-site.ps1"
set "siteExit=%ERRORLEVEL%"
echo.
if not "%siteExit%"=="0" echo O site nao arrancou. O erro esta indicado acima.
echo Prima uma tecla para fechar esta janela.
pause >nul
exit /b %siteExit%
