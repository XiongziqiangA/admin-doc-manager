param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,

  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
  throw "Restore is destructive. Re-run with -ConfirmRestore after confirming the backup path."
}

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.production"
$composeFile = Join-Path $root "docker-compose.prod.yml"
$dumpFile = Join-Path $BackupDir "database.dump"
$storageZip = Join-Path $BackupDir "storage.zip"

if (-not (Test-Path $envFile)) {
  throw "Missing .env.production."
}
if (-not (Test-Path $dumpFile)) {
  throw "Missing database.dump in backup directory."
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

Push-Location $root
try {
  & docker compose --env-file $envFile -f $composeFile up -d postgres
  $postgresId = (& docker compose --env-file $envFile -f $composeFile ps -q postgres).Trim()
  if (-not $postgresId) {
    throw "PostgreSQL container is not running."
  }

  & docker compose --env-file $envFile -f $composeFile stop backend frontend
  & docker cp $dumpFile "$postgresId`:/tmp/admin-docs-restore.dump"
  & docker exec $postgresId pg_restore -U $dbUser -d $dbName --clean --if-exists /tmp/admin-docs-restore.dump
  & docker exec $postgresId rm -f /tmp/admin-docs-restore.dump

  if (Test-Path $storageZip) {
    $storagePath = Join-Path $root "data\storage"
    if (Test-Path $storagePath) {
      $oldStoragePath = Join-Path $root ("data\storage.before-restore-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
      Move-Item -LiteralPath $storagePath -Destination $oldStoragePath
    }
    New-Item -ItemType Directory -Force -Path $storagePath | Out-Null
    Expand-Archive -Path $storageZip -DestinationPath $storagePath -Force
  }

  & docker compose --env-file $envFile -f $composeFile up -d
  Write-Host "Restore completed from: $BackupDir"
} finally {
  Pop-Location
}
