@echo off
setlocal
cd /d "%~dp0"
if not exist ".local-checkpoints\run-local.mjs" (
  echo Esta pre-visualizacao precisa das ferramentas locais preparadas nesta copia.
  echo Consulte docs\PLANO_MOBILE.md.
  pause
  exit /b 1
)
echo Money OS - pre-visualizacao local com dados ficticios
echo Site: http://127.0.0.1:3000
echo A password esta em .local-checkpoints\ACESSO_LOCAL.txt
echo Mantenha esta janela aberta. Para parar, use Ctrl+C.
node .local-checkpoints/run-local.mjs
endlocal
