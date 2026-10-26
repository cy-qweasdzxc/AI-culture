param([ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')][string]$RuntimeName = 'demo')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectDir ".cache\$RuntimeName\runtime.json"
if (-not (Test-Path -LiteralPath $runtimePath)) { return }
$record = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
if ($record.project -ne $projectDir) { throw 'Unexpected project in runtime record.' }
$verified = @()
foreach ($entry in $record.processes) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.Path -ne $entry.path -or $process.StartTime.ToUniversalTime().ToString('o') -ne $entry.started_utc) { throw 'Process identity changed; refusing to stop an unrelated process.' }
    $verified += $process
}
foreach ($process in $verified) { if (-not $process.HasExited) { Stop-Process -InputObject $process } }
$record | Add-Member -NotePropertyName stopped_utc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $runtimePath -Encoding utf8
Write-Output 'Stopped only the recorded demo processes. Database and private configuration retained.'
