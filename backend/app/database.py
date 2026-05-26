# backend/app/database.py

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# Create the SQLAlchemy engine
_is_sqlite = "sqlite" in settings.DATABASE_URL
if _is_sqlite:
    engine_kwargs: dict = {"connect_args": {"check_same_thread": False}}
else:
    # PostgreSQL / Supabase Pooler: enable pre-ping to detect stale connections
    # and rely on the default connection pool (5 connections + 10 overflow).
    engine_kwargs = {"pool_pre_ping": True}

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base
Base = declarative_base()


def get_db():
    """
    FastAPI dependency — yields a database session and closes it when done.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _existing_columns(conn, table: str) -> set:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {row[1] for row in rows}  # column name is index 1


def _existing_tables(conn) -> set:
    rows = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table'")
    ).fetchall()
    return {row[0] for row in rows}


def run_migrations(eng=None) -> None:
    """
    Apply additive SQLite migrations.

    Adds any columns / tables that are missing from the live DB without
    touching existing data.  Safe to call on every startup.

    On PostgreSQL (production) this function is a no-op — schema is created
    by SQLAlchemy's Base.metadata.create_all() and managed by Alembic.
    """
    if eng is None:
        eng = engine

    # Skip SQLite-specific migration logic on PostgreSQL / other databases.
    if "sqlite" not in str(eng.url):
        return

    with eng.connect() as conn:
        tables = _existing_tables(conn)

        # ── retraining_jobs extra columns ─────────────────────────────────────
        if "retraining_jobs" in tables:
            cols = _existing_columns(conn, "retraining_jobs")
            new_cols = {
                "training_mode":     "ALTER TABLE retraining_jobs ADD COLUMN training_mode VARCHAR",
                "hyperparameters":   "ALTER TABLE retraining_jobs ADD COLUMN hyperparameters TEXT",
                "progress_epoch":    "ALTER TABLE retraining_jobs ADD COLUMN progress_epoch INTEGER DEFAULT 0",
                "total_epochs":      "ALTER TABLE retraining_jobs ADD COLUMN total_epochs INTEGER",
                "progress_pct":      "ALTER TABLE retraining_jobs ADD COLUMN progress_pct FLOAT DEFAULT 0.0",
                "best_val_accuracy": "ALTER TABLE retraining_jobs ADD COLUMN best_val_accuracy FLOAT",
                "checkpoint_path":   "ALTER TABLE retraining_jobs ADD COLUMN checkpoint_path VARCHAR",
                "export_path":       "ALTER TABLE retraining_jobs ADD COLUMN export_path VARCHAR",
                "evaluation_dir":    "ALTER TABLE retraining_jobs ADD COLUMN evaluation_dir VARCHAR",
                "worker_pid":        "ALTER TABLE retraining_jobs ADD COLUMN worker_pid INTEGER",
                "error_message":     "ALTER TABLE retraining_jobs ADD COLUMN error_message TEXT",
                "cancelled_at":      "ALTER TABLE retraining_jobs ADD COLUMN cancelled_at DATETIME",
            }
            for col, stmt in new_cols.items():
                if col not in cols:
                    conn.execute(text(stmt))

        # ── model_versions extra columns ──────────────────────────────────────
        if "model_versions" in tables:
            cols = _existing_columns(conn, "model_versions")
            new_cols = {
                "file_path":      "ALTER TABLE model_versions ADD COLUMN file_path VARCHAR",
                "auc_roc":        "ALTER TABLE model_versions ADD COLUMN auc_roc FLOAT",
                "evaluation_dir": "ALTER TABLE model_versions ADD COLUMN evaluation_dir VARCHAR",
                "training_mode":  "ALTER TABLE model_versions ADD COLUMN training_mode VARCHAR",
            }
            for col, stmt in new_cols.items():
                if col not in cols:
                    conn.execute(text(stmt))

        # ── training_epoch_logs table ─────────────────────────────────────────
        if "training_epoch_logs" not in tables:
            conn.execute(text("""
                CREATE TABLE training_epoch_logs (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id       INTEGER NOT NULL,
                    epoch        INTEGER NOT NULL,
                    train_loss   FLOAT,
                    val_loss     FLOAT,
                    val_accuracy FLOAT,
                    val_f1       FLOAT,
                    learning_rate FLOAT,
                    duration_sec  FLOAT,
                    timestamp    DATETIME
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_epoch_logs_job_id ON training_epoch_logs (job_id)"
            ))

        conn.commit()
