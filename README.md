# Homelab Docker (Raspberry Pi)

Small, separate Docker Compose projects that share one Docker network: `homelab`.

## Overview

- Each service lives in its own folder with a `docker-compose.yml`.
- A shared stack provides Postgres, pgAdmin, and MinIO in `_shared/`.
- All stacks attach to the external `homelab` network.

## Quick start

1) Create the shared network (one-time):

- `make network`

2) Start shared services (Postgres/pgAdmin/MinIO):

- `make shared-up`

3) Start apps (pick what you want):

- `make homepage-up`
- `make portainer-up`
- `make kuma-up`
- `make hue-up`
- `make recipes-up`

## Environment files

- `.env` files are intentionally gitignored; use the `.env.example` templates as a starting point.
- Each service folder contains its own `.env.example` next to its `docker-compose.yml`.

## Services

- Shared services: `_shared/README.md`
- Homepage: `homepage/README.md`
- Portainer: `portainer/README.md`
- Uptime Kuma: `kuma/README.md`
- Hue Dashboard: `hue/README.md`
- Recipes app: `recipes/README.md`

## Network and volumes

- All compose files reference `networks: homelab: external: true`, so the `homelab` network must exist before `up`.
- Volumes are declared per-service; see each service README for details.

## Backups

- Postgres backup helper: `_shared/scripts/backup_postgres.sh`
- Backups output to `_shared/backups/`


