# Deployment

## Local development

1. Copy [`.env.example`](../.env.example) to `.env` and set secrets (at minimum `JWT_SECRET_KEY`).
2. Start the stack:

   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

3. Run migrations:

   ```bash
   docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head
   ```

4. Open the frontend at `http://localhost:3000` (or your `FRONTEND_PORT`). API docs: `http://localhost:8000/docs`.

## Standalone

Run the full product on a single machine without the VPS control panel, Cloudflare, or the shared `postgres-net` network.

1. Copy `.env.example` to `.env`. Keep `POSTGRES_HOST=postgres` so the backend uses the bundled database.
2. Build and start:

   ```bash
   docker compose -f docker-compose.standalone.yml up --build -d
   ```

3. Migrate:

   ```bash
   docker compose -f docker-compose.standalone.yml exec backend bash /app/run_migrations.sh
   ```

4. Open `http://localhost:3000`. The backend API is on loopback only (`127.0.0.1:8000` by default); the frontend container proxies `/api` to it.

To update: `docker compose -f docker-compose.standalone.yml pull` (when using prebuilt images) or `up --build` again. Logs: `docker compose -f docker-compose.standalone.yml logs -f`. Database backup: `docker compose -f docker-compose.standalone.yml exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"`.

Before exposing the frontend port on a public host, put your own reverse proxy and firewall in front of `${FRONTEND_PORT:-3000}`.

## This VPS

Production deploys through the **VPS control panel**. The panel pulls `andrewallkin/spliteasy` images built by GitHub Actions, writes `.env` (including `DOCKER_IMAGE_BACKEND`, `DOCKER_IMAGE_FRONTEND`, and production `POSTGRES_*` values), attaches the stack to the external Docker network `postgres-net`, binds host ports on `127.0.0.1`, runs `bash /app/run_migrations.sh` on the `backend` service, and health-checks `GET /api/health`.

No panel source or host configuration lives in this repository.