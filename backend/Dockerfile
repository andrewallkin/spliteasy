FROM python:3.12-slim AS base

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock /app/
COPY app /app/app
RUN uv sync --frozen --no-dev

COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts
COPY run_migrations.sh /app/run_migrations.sh
RUN chmod +x /app/run_migrations.sh

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
