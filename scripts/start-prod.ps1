param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.production"
$composeFile = Join-Path $root "docker-compose.prod.yml"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or is not available in PATH."
}

function Wait-DockerReady {
  $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

  if ((Test-Path $dockerDesktop) -and -not (docker ps 2>$null)) {
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  for ($i = 1; $i -le 36; $i++) {
    docker ps 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 5
  }

  throw "Docker engine is not ready. Open Docker Desktop and try again."
}

function Read-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

if (-not (Test-Path $envFile)) {
  throw "Missing .env.production. Copy .env.production.example to .env.production, then replace all REPLACE_WITH_* values."
}

$envContent = Get-Content -Raw $envFile
if ($envContent -match "REPLACE_WITH_") {
  throw ".env.production still contains REPLACE_WITH_* placeholders. Replace them before starting production."
}

$databasePassword = Read-EnvValue "POSTGRES_PASSWORD"
$jwtSecret = Read-EnvValue "JWT_SECRET"
$adminPassword = Read-EnvValue "ADMIN_PASSWORD"
$adminUsername = Read-EnvValue "ADMIN_USERNAME"
$origins = Read-EnvValue "ALLOWED_ORIGINS"
if (-not $databasePassword -or $databasePassword.Length -lt 20) {
  throw "POSTGRES_PASSWORD must be at least 20 characters."
}
if (-not $jwtSecret -or $jwtSecret.Length -lt 32) {
  throw "JWT_SECRET must be at least 32 characters."
}
if (-not $adminPassword -or $adminPassword.Length -lt 12) {
  throw "ADMIN_PASSWORD must be at least 12 characters."
}
if (-not $adminUsername -or $adminUsername -eq "admin") {
  throw "Set ADMIN_USERNAME to a non-default administrator account."
}
if ($origins -match "http://(?!(localhost|127\\.0\\.1)(:|,|$))") {
  throw "Non-local ALLOWED_ORIGINS must use HTTPS."
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "data\postgres") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root "data\storage") | Out-Null

Wait-DockerReady

Push-Location $root
try {
  if ($Build) {
    $env:COMPOSE_PARALLEL_LIMIT = "1"

    & docker compose --env-file $envFile -f $composeFile build backend
    if ($LASTEXITCODE -ne 0) {
      throw "Backend image build failed with exit code $LASTEXITCODE."
    }

    & docker compose --env-file $envFile -f $composeFile build frontend
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend image build failed with exit code $LASTEXITCODE."
    }
  }

  & docker compose --env-file $envFile -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose startup failed with exit code $LASTEXITCODE."
  }

  & docker compose --env-file $envFile -f $composeFile ps
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose status check failed with exit code $LASTEXITCODE."
  }
  Write-Host ""
  Write-Host "Production stack started."
  Write-Host "Open: http://localhost:8080"
  Write-Host "Health: http://localhost:8080/api/health"
} finally {
  Pop-Location
}
