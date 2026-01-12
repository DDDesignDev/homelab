# Shared Services (Postgres, pgAdmin, MinIO)

Provides shared infrastructure services for other stacks.

## Start/stop

- `make shared-up`
- `make shared-down`

## Environment

Create `_shared/.env` from `_shared/.env.example`.

Required:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Optional:
- `PGADMIN_EMAIL`
- `PGADMIN_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `POSTGRES_PORT` (default 5432)
- `PGADMIN_PORT` (default 5050)
- `MINIO_API_PORT` (default 9002)
- `MINIO_CONSOLE_PORT` (default 9003)

## Ports

- Postgres: `POSTGRES_PORT` -> 5432
- pgAdmin: `PGADMIN_PORT` -> 80
- MinIO API: `MINIO_API_PORT` -> 9000
- MinIO Console: `MINIO_CONSOLE_PORT` -> 9001

## Volumes

- `postgres_data` -> `/var/lib/postgresql/data`
- `pgadmin_data` -> `/var/lib/pgadmin`
- `minio_data` -> `/data`

## Notes

- SQL init scripts in `_shared/init/` are loaded by Postgres on first run.
- Backup helper: `_shared/scripts/backup_postgres.sh` writes to `_shared/backups/`.
