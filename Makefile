SHELL := /bin/bash

.PHONY: backend-install frontend-install dev up down migrate lint test build

dev-build:
	docker compose -f docker-compose.dev.yml up --build

dev-build-d:
	docker compose -f docker-compose.dev.yml up -d --build

dev-up:
	docker compose -f docker-compose.dev.yml up

dev-up-d:
	docker compose -f docker-compose.dev.yml up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

migrate:
	docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

test:
	cd backend && uv run pytest

build:
	cd frontend && npm run build
