$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$resultCode = 0
$transcribing = $false
$ownsMutex = $false
$launcherMutex = New-Object System.Threading.Mutex($false, 'Local\MoneyOS-PhoneSite-3000')

try {
    try { $ownsMutex = $launcherMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) {
        Write-Host 'O arranque do Money OS ja esta aberto noutra janela.'
        Write-Host 'Espera por Ready nessa janela e abre http://localhost:3000'
    } else {
        $logDir = Join-Path $projectRoot '.local-checkpoints'
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        Start-Transcript -Path (Join-Path $logDir 'site-startup.log') -Force | Out-Null
        $transcribing = $true
        $nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
        $nextCli = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
        if (-not (Test-Path -LiteralPath $nextCli)) {
            throw 'Faltam as dependencias do site. Executa npm install nesta pasta.'
        }

        # Validate every owner before stopping anything. Never stop another app.
        $owners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
            Where-Object LocalPort -EQ 3000 | Select-Object -ExpandProperty OwningProcess -Unique)
        $siteProcesses = @()
        foreach ($ownerId in $owners) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
            $command = $owner.CommandLine -replace '/', '\'
            $escapedCli = [regex]::Escape($nextCli)
            if ($owner.Name -ne 'node.exe' -or $command -notmatch ($escapedCli + '"?\s+start(?:\s|$)')) {
                throw "A porta 3000 esta ocupada por outro programa (processo $ownerId). Fecha esse programa e tenta novamente."
            }
            $siteProcesses += $owner
        }
        foreach ($siteProcess in $siteProcesses) {
            # Recheck identity immediately before stopping the known server.
            $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($siteProcess.ProcessId)"
            if ($current.CreationDate -ne $siteProcess.CreationDate -or $current.CommandLine -ne $siteProcess.CommandLine) {
                throw 'O processo do site mudou. Tenta novamente.'
            }
            Write-Host 'A parar a instancia anterior do Money OS para a atualizar...'
            Stop-Process -Id $siteProcess.ProcessId -ErrorAction Stop
            Wait-Process -Id $siteProcess.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
        }

        Write-Host 'A preparar a versao mais recente. Aguarda ate aparecer Ready.'
        & $nodeCommand $nextCli build
        if ($LASTEXITCODE -ne 0) { throw 'A preparacao do site falhou. Consulta o erro acima.' }

        Write-Host ''
        Write-Host 'No PC: http://localhost:3000'
        $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' })
        foreach ($address in $addresses) {
            Write-Host ("No telemovel, na mesma rede ({0}): http://{1}:3000" -f $address.InterfaceAlias, $address.IPAddress)
        }
        Write-Host 'Deixa esta janela aberta enquanto usas o site.'
        Write-Host 'Se o Windows pedir acesso a rede, permite em Redes privadas.'
        Write-Host ''
        & $nodeCommand $nextCli start --hostname 0.0.0.0 --port 3000
        if ($LASTEXITCODE -ne 0) { throw 'O servidor parou com erro. Consulta a mensagem acima.' }
        Write-Host 'O site foi parado. Abre novamente SITE_PARA_TELEMOVEL.cmd para iniciar.'
    }
} catch {
    $resultCode = 1
    Write-Host ("ERRO: {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Registo: .local-checkpoints\site-startup.log'
} finally {
    if ($transcribing) { Stop-Transcript | Out-Null }
    if ($ownsMutex) { $launcherMutex.ReleaseMutex() }
    $launcherMutex.Dispose()
}
exit $resultCode
