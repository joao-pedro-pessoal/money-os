@echo off
setlocal
cd /d "%~dp0"
title Money OS - site para o telemovel

echo.
echo  Money OS - site para o telemovel
echo  --------------------------------
echo  A preparar a versao mais recente do site (demora um a dois minutos)...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo  A preparacao falhou. Le as mensagens acima.
  pause
  exit /b 1
)

echo.
echo  Pronto. Na app Money OS do telemovel, escreve este endereco:
powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty IPAddress; if ($ip) { '     http://' + $ip + ':3000' } else { '     Nao encontrei o Wi-Fi deste PC. Usa o endereco IPv4 que o comando ipconfig mostra.' }"
echo.
echo  O telemovel tem de estar no mesmo Wi-Fi que este PC.
echo  Se o Windows perguntar se o Node.js pode usar a rede, escolhe
echo  "Redes privadas" e carrega em Permitir.
echo  Deixa esta janela aberta enquanto usas a app. Para desligar, fecha-a.
echo.
call npm run start -- -H 0.0.0.0 -p 3000
endlocal
