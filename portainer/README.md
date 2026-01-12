# Portainer

Portainer CE for managing Docker locally.

## Start/stop

- `make portainer-up`
- `make portainer-down`

## Environment

Create `portainer/.env` from `portainer/.env.example`.

- `PORTAINER_HOST_PORT` (default 9001)

## Ports

- `PORTAINER_HOST_PORT` -> 9000

## Volumes

- `/var/run/docker.sock` -> `/var/run/docker.sock`
- `portainer_data` -> `/data`
