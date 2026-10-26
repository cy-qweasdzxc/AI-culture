param([ValidatePattern('^[a-z0-9][a-z0-9-]*$')][string]$Project = 'citystory-round2')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir ".cache\docker-$Project"
$recordPath = Join-Path $runtimeDir 'runtime.json'
if (-not (Test-Path -LiteralPath $recordPath)) { throw 'No owned Compose runtime record exists.' }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.root -ne $projectDir -or $record.project -ne $Project) { throw 'Unexpected Compose runtime owner.' }
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
$dockerExe = if ($docker) { $docker.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
& $dockerExe compose --env-file (Join-Path $runtimeDir 'private.env') --project-name $Project -f (Join-Path $projectDir 'docker-compose.yml') -f (Join-Path $projectDir 'docker-compose.demo.yml') stop
if ($LASTEXITCODE -ne 0) { throw 'Owned Compose project did not stop cleanly.' }
Write-Output 'Stopped only the recorded Compose project; containers and all database volumes are retained.'
