param(
  [string]$BackupRoot = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.production"
$composeFile = Join-Path $root "docker-compose.prod.yml"

if (-not (Test-Path $envFile)) {
  throw "Missing .env.production."
}

function Read-EnvValue([string]$Name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

$dbName = Read-EnvValue "POSTGRES_DB"
$dbUser = Read-EnvValue "POSTGRES_USER"
if (-not $dbName -or -not $dbUser) {
  throw "POSTGRES_DB and POSTGRES_USER must be set in .env.production."
}

if (-not $BackupRoot) {
  $BackupRoot = Join-Path $root "backups"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot "admin-docs-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Push-Location $root
try {
  $postgresId = (& docker compose --env-file $envFile -f $composeFile ps -q postgres).Trim()
  if (-not $postgresId) {
    throw "PostgreSQL container is not running."
  }

  & docker exec $postgresId pg_dump -U $dbUser -d $dbName -Fc -f /tmp/admin-docs.dump
  & docker cp "$postgresId`:/tmp/admin-docs.dump" (Join-Path $backupDir "database.dump")
  & docker exec $postgresId rm -f /tmp/admin-docs.dump

  $storagePath = Join-Path $root "data\storage"
  $storageZip = Join-Path $backupDir "storage.zip"
  if (Test-Path $storagePath) {
    $storageItems = @(Get-ChildItem -LiteralPath $storagePath -Force)
    if ($storageItems.Count -gt 0) {
      Compress-Archive -Path $storageItems.FullName -DestinationPath $storageZip -Force
    } else {
      $emptyStorageDir = Join-Path $env:TEMP "admin-docs-empty-storage"
      New-Item -ItemType Directory -Force -Path $emptyStorageDir | Out-Null
      New-Item -ItemType File -Force -Path (Join-Path $emptyStorageDir ".empty") | Out-Null
      Compress-Archive -Path (Join-Path $emptyStorageDir "*") -DestinationPath $storageZip -Force
      Remove-Item -LiteralPath $emptyStorageDir -Recurse -Force
    }
  } else {
    $emptyStorageDir = Join-Path $env:TEMP "admin-docs-missing-storage"
    New-Item -ItemType Directory -Force -Path $emptyStorageDir | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $emptyStorageDir ".empty") | Out-Null
    Compress-Archive -Path (Join-Path $emptyStorageDir "*") -DestinationPath $storageZip -Force
    Remove-Item -LiteralPath $emptyStorageDir -Recurse -Force
  }

  @(
    "created_at=$((Get-Date).ToString("s"))",
    "database=$dbName",
    "storage_archive=storage.zip",
    "note=Keep .env.production in a separate secure location; this backup does not copy secrets."
  ) | Set-Content -Encoding UTF8 (Join-Path $backupDir "manifest.txt")

  if (-not (Test-Path -LiteralPath (Join-Path $backupDir "database.dump"))) {
    throw "Backup validation failed: database.dump was not created."
  }
  if (-not (Test-Path -LiteralPath $storageZip)) {
    throw "Backup validation failed: storage.zip was not created."
  }
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $backupDir "manifest.txt")
  if ($manifest -notmatch "database=" -or $manifest -notmatch "storage_archive=storage\.zip") {
    throw "Backup validation failed: manifest is incomplete."
  }

  Write-Host "Backup created: $backupDir"
} finally {
  Pop-Location
}
