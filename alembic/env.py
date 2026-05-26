from logging.config import fileConfig

from sqlalchemy import engine_from_config, create_engine
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Wire Pipeline Rakshak models and DATABASE_URL ─────────────────────────────
# Import the app's settings (reads DATABASE_URL from env / .env file) and the
# ORM Base so that autogenerate can diff the current schema.
from backend.app.config import settings
from backend.app.database import Base
import backend.app.models  # noqa: F401  — registers all ORM models with Base

# NOTE: We do NOT use config.set_main_option("sqlalchemy.url", ...) here
# because configparser treats percent-encoded characters (e.g. %40 for @) as
# interpolation syntax and raises ValueError.  Instead the URL is passed
# directly to create_engine() in both offline and online migration functions.

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection required)."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
