# Homepage

Homepage dashboard service using `ghcr.io/gethomepage/homepage`.

## Start/stop

- `make homepage-up`
- `make homepage-down`

## Environment

Create `homepage/.env` from `homepage/.env.example`.

- `HOMEPAGE_HOST_PORT` (default 9000)
- `HOMEPAGE_ALLOWED_HOSTS` (comma-separated host:port list)

## Ports

- `HOMEPAGE_HOST_PORT` -> 3000

## Volumes

- `homepage/config` -> `/app/config`
- `/var/run/docker.sock` -> `/var/run/docker.sock:ro`

## Notes

- `homepage/config/` is local state and ignored by git.
- Add widgets and services in `homepage/config/` as needed.
