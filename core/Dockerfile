# One image for both Cloud Run services: the API (default) and the worker, which only
# overrides the module (`agentdesk.cloud:app`). Cloud Run sets $PORT.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
COPY evals ./evals
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 APP_MODULE=agentdesk.api:app
# Never run as root: a code-execution bug should not also own the filesystem.
RUN useradd --system --uid 10001 agentdesk
USER agentdesk
CMD exec uvicorn "$APP_MODULE" --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers
