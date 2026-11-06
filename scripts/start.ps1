# Starts the ChronoOS Python engine and the Vite frontend together (Windows PowerShell).
# Press Ctrl+C to stop both.
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$HostName = if ($env:CHRONOOS_API_HOST) { $env:CHRONOOS_API_HOST } else { '127.0.0.1' }
$Port = if ($env:CHRONOOS_API_PORT) { $env:CHRONOOS_API_PORT } else { '8787' }
$HealthUrl = "http://${HostName}:${Port}/api/health"
$env:CHRONOOS_API_PORT = $Port
$env:VITE_ENGINE_URL = "http://${HostName}:${Port}"

function Require-Command($Name, $Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $Hint"
  }
}

Require-Command python 'Install Python 3.9 or newer from python.org and tick "Add to PATH".'
Require-Command npm 'Install Node.js 18 or newer from nodejs.org.'

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host 'Installing frontend dependencies...'
  Push-Location $Root
  try { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }
  finally { Pop-Location }
}

$Engine = $null
$Web = $null
try {
  Write-Host "Starting the Python engine on ${HostName}:${Port}..."
  $Engine = Start-Process -FilePath python -ArgumentList '-m', 'chronoos' -WorkingDirectory (Join-Path $Root 'backend') -PassThru -NoNewWindow

  $Healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    if ($Engine.HasExited) { throw "The engine exited during startup. Port $Port may be in use." }
    try {
      Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2 | Out-Null
      $Healthy = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $Healthy) { throw "The engine did not answer its health check at $HealthUrl." }
  Write-Host "Engine is healthy at $HealthUrl."

  Write-Host 'Starting the frontend...'
  $Web = Start-Process -FilePath npm.cmd -ArgumentList 'run', 'dev', '--', '--host', '127.0.0.1' -WorkingDirectory $Root -PassThru -NoNewWindow
  Wait-Process -Id $Web.Id
}
finally {
  foreach ($Process in @($Web, $Engine)) {
    if ($Process -and -not $Process.HasExited) { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue }
  }
  Write-Host 'Stopped.'
}
