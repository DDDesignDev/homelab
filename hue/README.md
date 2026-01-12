# Hue Dashboard

Local Hue dashboard and API proxy for a Philips Hue bridge.

## Start/stop

- `make hue-up`
- `make hue-down`

## Environment

Create `hue/.env` from `hue/.env.example`.

Required:
- `HUE_BRIDGE_IP`
- `HUE_USERNAME`

Optional:
- `PORT` (default 8000)
- `HUE_HOST_PORT` (default 8000)

## Ports

- `HUE_HOST_PORT` -> `PORT`

## Notes

- `HUE_USERNAME` must be created via the Hue API after pressing the bridge button.
- Service builds from the local Dockerfile.
