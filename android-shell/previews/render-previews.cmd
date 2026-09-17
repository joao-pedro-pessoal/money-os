@echo off
rem Draws the widget pictures shown in the launcher's widget list, with Edge.
rem Run it after changing previews.html; the PNGs go to res\drawable-nodpi.
setlocal
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "HERE=%~dp0"
set "OUT=%HERE%..\app\src\main\res\drawable-nodpi"
if not exist "%OUT%" mkdir "%OUT%"
set "PAGE=file:///%HERE:\=/%previews.html"

call :shot quick 260 90
call :shot dashboard 260 170
call :shot networth 300 170
call :shot where 300 170
call :shot cashflow 260 170
call :shot investments 300 170
call :shot allocation 300 170
call :shot movers 300 170
call :shot dividends 300 170
call :shot opentrades 300 170
echo Done.
exit /b 0

:shot
"%EDGE%" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 ^
  --default-background-color=00000000 --no-first-run --disable-extensions ^
  --user-data-dir="%TEMP%\money-os-previews\%1" ^
  --window-size=%2,%3 --screenshot="%OUT%\widget_preview_%1.png" "%PAGE%?w=%1&width=%2&height=%3"
exit /b 0
