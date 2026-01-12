# Homelab Docker (Raspberry Pi)

This folder is organized as small, separate compose projects that share one Docker network: `homelab`.

## Quick start guide

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

## Notes

- All compose files reference `networks: homelab: external: true`, so the `homelab` network must exist before `up`.
- `.env` files are intentionally gitignored; use the included `.env.example` templates as a starting point (each app folder has its own `.env` next to its `docker-compose.yml`).
