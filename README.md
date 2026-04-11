# Splitwise MVP

Full-stack bill-splitting app for exactly two members per group.

## Stack
- Backend: FastAPI + SQLAlchemy async + Alembic + PostgreSQL
- Frontend: React + TypeScript + Vite + Tailwind
- OCR: OpenAI GPT-4o through backend service
- Infra: Docker Compose for dev and prod

## Quick Start
1. Copy `.env.example` to `.env` and set values.
2. Install local dependencies (optional if running only in Docker):
   - `cd backend && uv sync --all-extras`
   - `cd frontend && npm install`
3. Start dev services:
   - `docker compose -f docker-compose.dev.yml up --build`
4. Run migrations:
   - `docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head`
5. Open apps:
   - Frontend: `http://localhost:3000`
   - Backend docs: `http://localhost:8000/docs`

## Auth + Invitations
- Authentication uses email and password.
- Group invitations are code-based:
  - generate with `POST /api/groups/{group_id}/invite`
  - join with `POST /api/groups/{group_id}/join` using `invitation_id`

## Database Schema Strategy
- **Recommended and adopted approach:** use **Alembic** as the single source of truth for database schema.
- On a fresh database, create tables by running `alembic upgrade head`.
- For all later schema work (add/drop/alter columns or tables), create new Alembic revisions and upgrade.
- SQLAlchemy declarative models define metadata, but tables are only created when DDL is executed (for this project, via Alembic migrations).
- This keeps schema history explicit, reproducible, and consistent across environments.

## Backend With uv
- Install Python deps: `cd backend && uv sync --all-extras`
- Run API locally: `cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Run migrations: `cd backend && uv run alembic upgrade head`
- Run tests: `cd backend && uv run pytest`

Backend: `http://localhost:8000/docs`  
Frontend: `http://localhost:3000`

## Production
- `docker-compose.yml` is the default production compose file.
- The production stack expects an external Docker network named `postgres-net`.
- Host Nginx terminates TLS and proxies:
  - `/api` -> `${BACKEND_PORT:-8000}`
  - `/` -> `${FRONTEND_PORT:-3000}`

## CI/CD Deploy (GitHub Actions)
- Workflow: `.github/workflows/deploy.yml` (`push` to `main` and manual dispatch).
- Deployment target: `/srv/apps/<repo>` on the VPS over SSH.
- The workflow writes `.env`, runs `docker compose build`, `docker compose up -d --force-recreate`, then runs migrations with:
  - `docker compose exec -T backend bash -c "cd /app && ./run_migrations.sh"`

Required GitHub secrets:
- SSH/repo access: `VPS_SSH_KEY`, `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `GH_USERNAME`, `GH_PAT`
- App env: `ENVIRONMENT`, `APP_NAME`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS`, `CORS_ALLOWED_ORIGINS`, `COOKIE_SECURE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `UPLOADS_DIR`, `BACKEND_PORT`, `FRONTEND_PORT`, `DOMAIN`
