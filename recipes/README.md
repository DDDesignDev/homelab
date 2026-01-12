# Recipes App

FastAPI-based recipes app plus a scraper sidecar.

## Start/stop

- `make recipes-up`
- `make recipes-down`

## Environment

Create `recipes/.env` from `recipes/.env.example`.

Required:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

Optional:
- `PORT` (default 8000)
- `RECIPES_HOST_PORT` (default 9100)

## Ports

- `RECIPES_HOST_PORT` -> `PORT`
- Scraper: 8010 -> 8010 (optional exposure)

## Volumes

- `recipes_uploads` -> `/app/uploads`

## Notes

- The app connects to Postgres via `DB_*` env vars.
- The scraper is reachable internally at `http://recipe-scraper:8010`.
