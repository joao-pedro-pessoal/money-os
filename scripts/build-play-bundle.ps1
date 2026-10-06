$ErrorActionPreference = 'Stop'
# The file Google Play receives: the store build of android-shell, signed with
# the upload key. ASCII only, like start-phone-site.ps1: Windows PowerShell
# reads a file without a BOM in the old code page.
#
# The key lives outside every project folder, in %USERPROFILE%\MoneyOS-PlayStore:
# a worktree that is deleted, or a git clean, must never take it along.
# The password is asked here, kept in this process only for the one build, and
# never written to a file.

$projectRoot = Split-Path -Parent $PSScriptRoot
$shell = Join-Path $projectRoot 'android-shell'
$keyDir = Join-Path $env:USERPROFILE 'MoneyOS-PlayStore'
$key = Join-Path $keyDir 'upload-key.jks'
$resultCode = 0

try {
    # JDK 17 for this window only; the university's Java stays as it is.
    $adoptium = Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'
    $jdk = Get-ChildItem -LiteralPath $adoptium -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
        Sort-Object Name | Select-Object -Last 1
    if (-not $jdk) { throw "Nao encontrei o JDK 17 em $adoptium. E o mesmo que compila a app Android (docs/APP_ANDROID.md)." }
    $env:JAVA_HOME = $jdk.FullName
    $keytool = Join-Path $jdk.FullName 'bin\keytool.exe'

    $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    $localProperties = Join-Path $shell 'local.properties'
    if (-not (Test-Path -LiteralPath $localProperties)) {
        if (-not (Test-Path -LiteralPath $sdk)) { throw "Nao encontrei o Android SDK em $sdk." }
        # Forward slashes: with unescaped backslashes Gradle cannot read the path.
        Set-Content -LiteralPath $localProperties -Value ('sdk.dir=' + ($sdk -replace '\\', '/')) -Encoding ASCII
    }

    if (-not (Test-Path -LiteralPath $key)) {
        Write-Host ''
        Write-Host '=== Primeira vez: criar a chave de envio para a Play Store ==='
        Write-Host ''
        Write-Host "Vai ficar em $key"
        Write-Host 'O Java pede uma palavra-passe (duas vezes). Nao aparece nada enquanto escreves; e normal.'
        Write-Host 'Escolhe uma palavra-passe nova, com pelo menos 12 caracteres, e guarda-a num gestor de'
        Write-Host 'palavras-passe. Vais precisar dela sempre que criares uma versao nova da app.'
        Write-Host ''
        New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
        & $keytool -genkeypair -keystore $key -storetype PKCS12 -alias upload -keyalg RSA -keysize 2048 `
            -validity 10000 -dname 'CN=Money OS upload key'
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $key)) { throw 'A chave nao foi criada.' }
        Write-Host ''
        Write-Host 'Chave criada. Faz ja uma copia da pasta MoneyOS-PlayStore para uma pen ou para a nuvem.'
        Write-Host ''
    }

    # Asked for unless the caller already put it in this process's environment
    # (how the script itself is tested, with a throwaway key).
    if (-not $env:MONEYOS_UPLOAD_PASSWORD) {
        $secure = Read-Host 'Palavra-passe da chave de envio' -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $env:MONEYOS_UPLOAD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
    $env:MONEYOS_UPLOAD_KEYSTORE = $key

    # Checked before the build, so a typo costs a second and not a minute of compiling.
    # :env reads it from the environment, so it never appears on a command line.
    & $keytool -list -keystore $key -storetype PKCS12 -alias upload -storepass:env MONEYOS_UPLOAD_PASSWORD *> $null
    if ($LASTEXITCODE -ne 0) { throw 'A palavra-passe nao abre a chave. Nada foi compilado; tenta outra vez.' }

    Write-Host ''
    Write-Host 'A compilar a app para a Play Store (um ou dois minutos)...'
    Push-Location -LiteralPath $shell
    try {
        # No daemon: the password must not stay behind in a Gradle process after this window closes.
        & .\gradlew.bat bundleStoreRelease --no-daemon --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'A compilacao falhou. O erro esta indicado acima.' }
    } finally {
        Pop-Location
    }

    $gradle = Get-Content -LiteralPath (Join-Path $shell 'app\build.gradle') -Raw
    $versionName = [regex]::Match($gradle, "versionName = '([^']+)'").Groups[1].Value
    $versionCode = [regex]::Match($gradle, 'versionCode = (\d+)').Groups[1].Value
    $built = Join-Path $shell 'app\build\outputs\bundle\storeRelease\app-store-release.aab'
    $target = Join-Path $keyDir ("money-os-$versionName-$versionCode.aab")
    Copy-Item -LiteralPath $built -Destination $target -Force

    Write-Host ''
    Write-Host '=== Pronto ==='
    Write-Host ''
    Write-Host "Ficheiro para enviar a Play Store:"
    Write-Host "  $target"
    Write-Host ''
    Write-Host "Versao $versionName (codigo $versionCode). Na Play Console: Testes > Teste fechado >"
    Write-Host 'Criar nova versao > carrega este ficheiro. Os passos todos estao em docs\PLAY_STORE.md.'
} catch {
    $resultCode = 1
    Write-Host ''
    Write-Host ('ERRO: ' + $_.Exception.Message)
} finally {
    Remove-Item Env:MONEYOS_UPLOAD_PASSWORD -ErrorAction SilentlyContinue
}
exit $resultCode
