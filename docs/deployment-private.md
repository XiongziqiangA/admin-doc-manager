# Private Deployment Guide

This guide is for local private deployment of the enterprise administrative document management system on a company PC or internal server.

## What This Production Setup Provides

- Starts PostgreSQL, backend, and frontend together.
- Keeps database files under `data/postgres`.
- Keeps uploaded files under `data/storage`.
- Exposes only the frontend port to the host by default.
- Runs database migrations and base-data seed before the backend starts.
- Creates the initial admin account only when it does not already exist.
- Provides backup and restore scripts for PostgreSQL and uploaded files.
- Supports optional local text indexing and API-backed semantic retrieval without granting the assistant write access.

## Files

| File | Purpose |
| --- | --- |
| `.env.production.example` | Production environment template. Copy it to `.env.production`. |
| `docker-compose.prod.yml` | Production Docker Compose stack. |
| `scripts/start-prod.ps1` | One-command production startup helper. |
| `scripts/backup-prod.ps1` | Creates a database dump and uploaded-file archive. |
| `scripts/restore-prod.ps1` | Restores a backup after explicit confirmation. |
| `start-admin-docs.bat` | Daily double-click startup script. |
| `rebuild-admin-docs.bat` | Rebuild images and start after code changes. |
| `stop-admin-docs.bat` | Stop the production stack without deleting data. |

## First-Time Setup

1. Copy `.env.production.example` to `.env.production`.
2. Replace every `REPLACE_WITH_*` value.
3. Set `ADMIN_USERNAME` to the required administrator username.
4. Set `ADMIN_PASSWORD` to a unique strong production password.
5. Start the system:

```powershell
.\scripts\start-prod.ps1 -Build
```

Open:

```text
http://localhost:8080
```

Health check:

```text
http://localhost:8080/api/health
```

## Daily Startup

Double-click:

```text
start-admin-docs.bat
```

Or run:

```powershell
.\scripts\start-prod.ps1
```

## Stop

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

This stops containers but keeps `data/postgres` and `data/storage`.

## Backup

Run this while the production stack is running:

```powershell
.\scripts\backup-prod.ps1
```

The backup is written to:

```text
backups/admin-docs-yyyyMMdd-HHmmss
```

Store `.env.production` separately in a secure location. The backup script does not copy secrets.

## Restore

Use the exact backup folder path:

```powershell
.\scripts\restore-prod.ps1 -BackupDir "C:\path\to\backup\admin-docs-yyyyMMdd-HHmmss" -ConfirmRestore
```

Restore replaces the database. Existing `data/storage` is moved to a timestamped folder before restored files are expanded.

## Private Network Access

For single-machine use, keep:

```text
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

For LAN access, add the server address:

```text
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://192.168.1.10:8080
```

Then restart:

```powershell
.\scripts\start-prod.ps1
```

## Optional Semantic Retrieval

Leave `AI_SEARCH_ENABLED=false` when all search processing must remain local. To enable semantic ranking, set `AI_SEARCH_ENABLED=true`, provide `OPENAI_API_KEY`, and review the configured `OPENAI_BASE_URL` and `EMBEDDING_MODEL` in `.env.production`. After startup, an administrator can rebuild indexes from the File Center using the rebuild-index action.

## Production Acceptance Checklist

- [ ] `docker compose --env-file .env.production -f docker-compose.prod.yml ps` shows all services healthy.
- [ ] `http://localhost:8080/api/health` returns a healthy response.
- [ ] Admin can log in.
- [ ] File upload works.
- [ ] Uploaded PDF can be opened or downloaded.
- [ ] File delete works.
- [ ] Base categories are visible.
- [ ] Backup script creates `database.dump` and `storage.zip`.
- [ ] Restore has been tested once on a non-production copy.

For a repeatable isolated validation without touching the production `data` directory or port 8080, use `docker-compose.acceptance.yml` with `ACCEPTANCE_FRONTEND_PORT=18080`. It writes only to `data/acceptance-postgres` and `data/acceptance-storage`; stop and remove it after testing with the same Compose file and project name.

## Hardening Notes

- Do not expose PostgreSQL to the LAN.
- Do not commit `.env.production`.
- Use strong database and JWT secrets.
- `start-prod.ps1` rejects short database/JWT/admin secrets, the default admin username, and non-local HTTP origins before startup.
- Production containers have memory/CPU bounds, `no-new-privileges`, and read-only root filesystems where the service does not need persistent writes; `/tmp` and Nginx runtime directories are temporary filesystems.
- Keep Docker Desktop updated.
- Back up both database and uploaded files.
- Test restore regularly.

For a public or company-wide server, put the frontend behind an HTTPS reverse proxy, use a certificate with automatic renewal, and set `ALLOWED_ORIGINS` to the exact HTTPS origin(s). The current Compose file intentionally exposes only the frontend port; PostgreSQL and backend remain on the internal Compose network.
