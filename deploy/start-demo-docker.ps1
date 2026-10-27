param(
    [switch]$Lan,
    [ValidateRange(1024,65535)][int]$Port = 18080,
    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')][string]$Project = 'citystory-round2'
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $projectDir 'deploy\demo-network.ps1')
$runtimeDir = Join-Path $projectDir ".cache\docker-$Project"
$privatePath = Join-Path $runtimeDir 'private.env'
$recordPath = Join-Path $runtimeDir 'runtime.json'
$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
if ($dockerCommand) { $dockerExe = $dockerCommand.Source }
else { $dockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
if (-not (Test-Path -LiteralPath $dockerExe)) { throw 'Docker Desktop CLI is required.' }
& $dockerExe info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for its Linux engine.' }
if (Test-Path -LiteralPath $recordPath) {
    $previous = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    if ($previous.root -ne $projectDir -or $previous.project -ne $Project) { throw 'Unexpected Compose runtime owner.' }
}
$existing = & $dockerExe ps -aq --filter "label=com.docker.compose.project=$Project"
if ($existing -and -not (Test-Path -LiteralPath $recordPath)) { throw 'This Compose project is not owned by this launcher. Choose another -Project name.' }
if (-not $existing -and (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { throw 'Frontend port is occupied. Choose another -Port.' }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $privatePath)) {
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    function New-DemoSecret {
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
    }
    $lines = @("DB_PASSWORD=$(New-DemoSecret)", "SESSION_SECRET=$(New-DemoSecret)", "ADMIN_JWT_SECRET=$(New-DemoSecret)", "ADMIN_PASSWORD=$(New-DemoSecret)")
    [IO.File]::WriteAllLines($privatePath, $lines, [Text.UTF8Encoding]::new($false))
    $rng.Dispose()
}
$env:DEMO_BIND_ADDRESS = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
$env:DEMO_PORT = [string]$Port
$base = Join-Path $projectDir 'docker-compose.yml'
$overlay = Join-Path $projectDir 'docker-compose.demo.yml'
# The identity record is written before up so a failed build can be safely retried.
@{project=$Project;port=$Port;lan=[bool]$Lan;private_config=$privatePath;root=$projectDir} | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
$ErrorActionPreference = 'Continue' # Docker progress is written to stderr even on success.
& $dockerExe compose --env-file $privatePath --project-name $Project -f $base -f $overlay up -d --build --wait --wait-timeout 300
$composeExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($composeExit -ne 0) { throw 'Compose did not become healthy; inspect this project logs. No existing volumes were removed.' }
$lanEndpoints = if ($Lan) { @(Get-DemoLanEndpoints -Port $Port) } else { @() }
$addresses = @("http://127.0.0.1:$Port") + @($lanEndpoints | ForEach-Object { $_.url })
if ($lanEndpoints | Where-Object network_category -ne 'Private') { Write-Warning 'The current network is not Private. Physical phone reachability has not been verified.' }
@{url="http://127.0.0.1:$Port";addresses=$addresses;lan_endpoints=$lanEndpoints;project=$Project;model='mock';database='PostgreSQL + pgvector';lan=[bool]$Lan} | ConvertTo-Json -Depth 5
Write-Output 'Private credentials remain in the launcher cache; no default administrator password is used.'
