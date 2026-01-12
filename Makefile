NETWORK ?= homelab

.PHONY: network \
	shared-up shared-down \
	homepage-up homepage-down \
	portainer-up portainer-down \
	kuma-up kuma-down \
	hue-up hue-down \
	recipes-up recipes-down

network:
	@docker network inspect "$(NETWORK)" >/dev/null 2>&1 || docker network create "$(NETWORK)"

shared-up: network
	@docker compose --project-directory _shared -f _shared/docker-compose.yml up -d

shared-down:
	@docker compose --project-directory _shared -f _shared/docker-compose.yml down

homepage-up: network
	@docker compose --project-directory homepage -f homepage/docker-compose.yml up -d

homepage-down:
	@docker compose --project-directory homepage -f homepage/docker-compose.yml down

portainer-up: network
	@docker compose --project-directory portainer -f portainer/docker-compose.yml up -d

portainer-down:
	@docker compose --project-directory portainer -f portainer/docker-compose.yml down

kuma-up: network
	@docker compose --project-directory kuma -f kuma/docker-compose.yml up -d

kuma-down:
	@docker compose --project-directory kuma -f kuma/docker-compose.yml down

hue-up: network
	@docker compose --project-directory hue -f hue/docker-compose.yml up -d --build

hue-down:
	@docker compose --project-directory hue -f hue/docker-compose.yml down

recipes-up: network
	@docker compose --project-directory recipes -f recipes/docker-compose.yml up -d --build

recipes-down:
	@docker compose --project-directory recipes -f recipes/docker-compose.yml down
