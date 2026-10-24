$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectDir '.cache\demo\runtime.json'
if (-not (Test-Path -LiteralPath $runtimePath)) { return }
$record = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
if ($record.project -ne $projectDir) { throw 'Unexpected project in runtime record.' }
foreach ($entry in $record.processes) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.Path -ne $entry.path -or $process.StartTime.ToUniversalTime().ToString('o') -ne $entry.started_utc) { throw 'Process identity changed; refusing to stop an unrelated process.' }
    Stop-Process -Id $process.Id
}
Write-Output 'Stopped only the recorded demo processes. Database and private configuration retained.'
