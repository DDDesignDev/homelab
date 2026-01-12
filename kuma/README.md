# Uptime Kuma

Uptime Kuma monitoring service.

## Start/stop

- `make kuma-up`
- `make kuma-down`

## Environment

Create `kuma/.env` from `kuma/.env.example`.

- `KUMA_HOST_PORT` (default 3001)

## Ports

- `KUMA_HOST_PORT` -> 3001

## Volumes

- `uptime_kuma_data` -> `/app/data`
