function Get-DemoLanEndpoints {
    param([ValidateRange(1024,65535)][int]$Port)
    $profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
    foreach ($configuration in (Get-NetIPConfiguration -ErrorAction SilentlyContinue)) {
        if (-not $configuration.IPv4DefaultGateway -or $configuration.NetAdapter.Status -ne 'Up') { continue }
        $profile = $profiles | Where-Object InterfaceIndex -eq $configuration.InterfaceIndex | Select-Object -First 1
        $category = if ($profile) { [string]$profile.NetworkCategory } else { 'Unknown' }
        foreach ($address in $configuration.IPv4Address.IPAddress) {
            if ($address -match '^(127.|169.254.|0.)') { continue }
            [pscustomobject]@{url="http://${address}:$Port";ipv4=$address;interface=$configuration.InterfaceAlias;network_category=$category;phone_verified=$false}
        }
    }
}

function Test-DemoHttpHealth {
    param([string]$Url)
    # A local per-request proxy override: do not change the user's system proxy.
    $request = [Net.WebRequest]::Create($Url)
    $request.Proxy = $null
    $request.Timeout = 2000
    $response = $null
    try { $response = $request.GetResponse(); return ([int]$response.StatusCode -eq 200) }
    catch { return $false }
    finally { if ($response) { $response.Close() } }
}
