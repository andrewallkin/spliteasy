SHELL := /bin/bash

.PHONY: backend-install frontend-install dev up down migrate seed lint test build

backend-install:
	cd backend && uv sync --all-extras

frontend-install:
	cd frontend && npm install

dev:
	docker compose -f docker-compose.dev.yml up --build

up:
	docker compose -f docker-compose.dev.yml up -d --build

down:
	docker compose -f docker-compose.dev.yml down

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m scripts.seed

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

test:
	cd backend && uv run pytest

build:
	cd frontend && npm run build
