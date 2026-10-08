from functools import lru_cache

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings


def _pool(url: str, max_size: int) -> ConnectionPool:
    return ConnectionPool(
        url,
        min_size=1,
        max_size=max_size,
        kwargs={"autocommit": True, "row_factory": dict_row},
        open=True,
    )


@lru_cache
def agent_pool() -> ConnectionPool:
    """Connections as `desk_agent`: read the store, write runs and proposals, nothing else."""
    return _pool(settings().database_url_agent, settings().worker_concurrency * 2 + 2)


@lru_cache
def api_pool() -> ConnectionPool:
    """Connections as `desk_api`: ingest tickets and execute approved proposals."""
    return _pool(settings().database_url_api, 8)
