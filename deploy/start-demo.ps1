param(
    [switch]$Lan,
    [ValidateRange(1024,65535)][int]$FrontendPort = 5173,
    [ValidateRange(1024,65535)][int]$BackendPort = 8000,
    [string]$Python = '',
    [string]$Node = '',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')][string]$RuntimeName = 'demo'
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectDir 'backend'
$frontendDir = Join-Path $projectDir 'frontend'
$runtimeDir = Join-Path $projectDir ".cache\$RuntimeName"
. (Join-Path $projectDir 'deploy\demo-network.ps1')
$runtimePath = Join-Path $runtimeDir 'runtime.json'
if (Test-Path -LiteralPath $runtimePath) {
    $previous = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    if ($previous.project -ne $projectDir) { throw 'Unexpected runtime owner; choose another -RuntimeName.' }
    foreach ($entry in $previous.processes) {
        $running = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
        if ($running) { throw "Runtime $RuntimeName has a live PID; stop that runtime or choose another -RuntimeName." }
    }
}
if (-not $Python) { $Python = Join-Path $backendDir '.venv\Scripts\python.exe' }
if (-not (Test-Path -LiteralPath $Python)) { throw 'Create backend/.venv or provide -Python with an existing Python 3.12+ environment.' }
# Prefer the checksum-verified project-local runtime without changing system PATH.
if (-not $Node) {
    $nodeVersionFile = Join-Path $projectDir '.node-version'
    if (Test-Path -LiteralPath $nodeVersionFile) {
        $nodeVersion = (Get-Content -LiteralPath $nodeVersionFile -Raw).Trim().TrimStart('v')
        if ($nodeVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid .node-version.' }
        $localNode = Join-Path $projectDir ".cache\node\node-v$nodeVersion-win-x64\node.exe"
        if (Test-Path -LiteralPath $localNode) { $Node = $localNode }
    }
}
$nodePath = if ($Node) { (Get-Command $Node -ErrorAction Stop).Source } else { (Get-Command node.exe -ErrorAction Stop).Source }
& $nodePath (Join-Path $frontendDir 'scripts\check-node.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Unsupported Node runtime; use .node-version or pass -Node with a supported node.exe.' }
$vitePath = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Run npm ci in frontend first.' }
foreach ($port in @($FrontendPort,$BackendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is already occupied; choose another port." }
}
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$privatePath = Join-Path $runtimeDir 'private-config.json'
if (-not (Test-Path -LiteralPath $privatePath)) {
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    function New-DemoSecret {
        $bytes = New-Object byte[] 36
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    }
    @{ SESSION_SECRET=(New-DemoSecret); ADMIN_JWT_SECRET=(New-DemoSecret); ADMIN_PASSWORD=(New-DemoSecret) } |
        ConvertTo-Json | Set-Content -LiteralPath $privatePath -Encoding utf8
    $rng.Dispose()
}
$private = Get-Content -LiteralPath $privatePath -Raw | ConvertFrom-Json
$env:APP_ENV = 'development'
$env:DATABASE_URL = 'sqlite:///' + ((Join-Path $runtimeDir 'demo.db') -replace '\\','/')
$env:SESSION_SECRET = $private.SESSION_SECRET
$env:ADMIN_JWT_SECRET = $private.ADMIN_JWT_SECRET
$env:ADMIN_PASSWORD = $private.ADMIN_PASSWORD
$env:SESSION_COOKIE_SECURE = 'false'
$env:SESSION_COOKIE = if ($RuntimeName -eq 'demo') { 'citystory_round2_demo' } else { 'citystory_demo_' + $RuntimeName }
$env:LLM_PROVIDER = 'mock'
$env:EMBEDDING_PROVIDER = 'none'
$env:LLM_API_KEY = ''
$env:EMBEDDING_API_KEY = ''
$env:VITE_TMAP_KEY = ''
$env:TMAP_WEB_SERVICE_KEY = ''
$env:API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
$env:PYTHONDONTWRITEBYTECODE = '1'
$created = @()
try {
    Push-Location $backendDir
    try {
        # PowerShell 5 treats normal native stderr (including Alembic INFO logs)
        # as a terminating error when a caller redirects this script's output.
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $Python -m alembic upgrade head
            $migrationExit = $LASTEXITCODE
            if ($migrationExit -eq 0) {
                & $Python scripts/seed.py
                $seedExit = $LASTEXITCODE
            }
        } finally { $ErrorActionPreference = $previousPreference }
        if ($migrationExit -ne 0) { throw 'Isolated demo migration failed.' }
        if ($seedExit -ne 0) { throw 'Isolated demo seed failed.' }
    } finally { Pop-Location }
    $apiProcess = Start-Process -FilePath $Python -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$BackendPort") -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'api.stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'api.stderr.log')
    $created += $apiProcess
    $bind = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
    # Vite treats inherited stdin EOF as shutdown outside CI. A background server
    # must survive the launcher shell closing; set this for the child only.
    $previousCi = $env:CI
    try {
        $env:CI = 'true'
        $frontProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$vitePath`"",'--host',$bind,'--port',"$FrontendPort",'--strictPort') -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'vite.stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'vite.stderr.log')
    } finally {
        if ($null -eq $previousCi) { Remove-Item Env:CI -ErrorAction SilentlyContinue }
        else { $env:CI = $previousCi }
    }
    $created += $frontProcess
    $healthy = $false
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        if (Test-DemoHttpHealth "http://127.0.0.1:$FrontendPort/api/health") { $healthy=$true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $healthy) { throw 'Demo did not become ready; inspect .cache/demo logs.' }
    $addresses = @("http://127.0.0.1:$FrontendPort")
    $lanEndpoints = @()
    if ($Lan) {
        $lanEndpoints = @(Get-DemoLanEndpoints -Port $FrontendPort)
        $addresses += @($lanEndpoints | ForEach-Object { $_.url })
        if ($lanEndpoints.Count -eq 0) { Write-Warning 'No active IPv4 interface with a default gateway was found.' }
        if ($lanEndpoints | Where-Object network_category -ne 'Private') { Write-Warning 'An advertised network is not Private. Phone access is unverified; firewall and Wi-Fi isolation may still block it. No network policy was changed.' }
    }
    $record = @{ started_at=(Get-Date -Format o); project=$projectDir; runtime_name=$RuntimeName; addresses=$addresses; lan_endpoints=$lanEndpoints; lan=[bool]$Lan; frontend_port=$FrontendPort; backend_port=$BackendPort; model='mock'; database='isolated demo SQLite'; geolocation='HTTPS required on a physical phone'; processes=@($created | ForEach-Object { $p=Get-Process -Id $_.Id; @{id=$p.Id;path=$p.Path;started_utc=$p.StartTime.ToUniversalTime().ToString('o')} }) }
    $record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtimeDir 'runtime.json') -Encoding utf8
    [pscustomobject]$record | Select-Object addresses,lan_endpoints,runtime_name,lan,model,geolocation | ConvertTo-Json -Depth 4
    Write-Output "Admin credentials remain private in .cache/$RuntimeName/private-config.json. Use stop-demo.ps1 -RuntimeName $RuntimeName to stop only this instance."
} catch {
    foreach ($process in $created) { if (-not $process.HasExited) { Stop-Process -InputObject $process -ErrorAction SilentlyContinue } }
    throw
}
