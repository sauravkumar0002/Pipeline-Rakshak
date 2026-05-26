# backend/app/main.py

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.config import settings
from backend.app.database import engine, Base, run_migrations
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.app.api.endpoints import inspections, analytics, model_mgmt, reports, retraining, auth, settings as settings_router_mod, notifications, live_detection
from backend.app.services.inference import inference_service
from backend.app.services.storage import storage_service
from backend.app.services.auth import seed_default_admin

limiter = Limiter(key_func=get_remote_address)

# ── Required working directories ─────────────────────────────────────────────
# These are created at startup if absent, ensuring the platform works on a
# fresh clone or after a training reset.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND_ROOT.parent

REQUIRED_DIRS: list[Path] = [
    _PROJECT_ROOT / "uploads",
    _BACKEND_ROOT / "datasets" / "retraining",
    _BACKEND_ROOT / "models" / "checkpoints",
    _BACKEND_ROOT / "models" / "exports",
    _BACKEND_ROOT / "models" / "evaluation",
    _BACKEND_ROOT / "models" / "onnx",
    _PROJECT_ROOT / "reports",
    _PROJECT_ROOT / "plots",
    _PROJECT_ROOT / "logs",
]


def ensure_working_dirs() -> None:
    """
    Create all required working directories if they do not exist.
    Runs at every startup — safe to call repeatedly.
    """
    missing: list[str] = []
    for d in REQUIRED_DIRS:
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            missing.append(str(d.relative_to(_PROJECT_ROOT)))
    if missing:
        print(f"[startup] Created {len(missing)} missing director{'ies' if len(missing)!=1 else 'y'}: {', '.join(missing)}")
    else:
        print("[startup] All required working directories present.")


def _run_startup_checks() -> list[dict]:
    """
    Verify critical external dependencies at startup.
    Returns a list of check result dicts; prints a summary to stdout.
    """
    checks: list[dict] = []

    # ── 0. Active database configuration ─────────────────────────────────────
    db_url_raw = settings.DATABASE_URL
    db_dialect = "sqlite" if "sqlite" in db_url_raw else "postgresql"
    db_masked = (
        db_url_raw.split("@")[-1] if "@" in db_url_raw else db_url_raw
    )
    print(f"[startup] DATABASE ENGINE : {db_dialect.upper()}")
    print(f"[startup] DATABASE HOST   : {db_masked}")
    print(f"[startup] STORAGE BACKEND : {settings.STORAGE_BACKEND.upper()}")
    if db_dialect == "sqlite" and settings.STORAGE_BACKEND == "supabase":
        print(
            "[startup] WARNING: STORAGE_BACKEND=supabase but DATABASE_URL is SQLite. "
            "This is a misconfiguration — set DATABASE_URL to your PostgreSQL/Supabase "
            "connection string in .env and restart the server."
        )

    # ── 1. PostgreSQL / database connection ───────────────────────────────────
    try:
        with engine.connect() as _conn:
            _conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks.append({"name": "database", "ok": True, "detail": str(engine.url).split("@")[-1]})
    except Exception as _db_err:
        checks.append({"name": "database", "ok": False, "detail": str(_db_err)[:200]})

    # ── 2. Storage backend (Supabase Storage or local) ────────────────────────
    _storage_check = storage_service.health_check()
    checks.append({"name": "storage", **_storage_check})

    # ── Print summary ─────────────────────────────────────────────────────────
    for c in checks:
        icon = "[OK ]" if c["ok"] else "[FAIL]"
        print(f"[startup-check] {icon} {c['name']}: {c.get('detail', '')}")

    failed = [c for c in checks if not c["ok"]]
    if failed:
        print(f"[startup-check] WARNING: {len(failed)} check(s) failed — review above.")
    else:
        print("[startup-check] All checks passed.")
    return checks


# This function will be called at startup to create database tables.
def create_db_and_tables():
    """
    Creates all database tables defined by SQLAlchemy models.
    This is typically called once at application startup.
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully.")
    except Exception as e:
        print(f"Error creating database tables: {e}")

# Create the FastAPI app instance
@asynccontextmanager
async def lifespan(application: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    print("Starting up the application...")
    ensure_working_dirs()
    # Initialise storage backend (local or Supabase)
    storage_service.init_from_settings()
    create_db_and_tables()
    run_migrations(engine)
    # Reset any jobs that were interrupted by a previous server restart
    from backend.app.database import SessionLocal
    from sqlalchemy import text as _text
    _reset_db = SessionLocal()
    try:
        _reset_db.execute(
            _text(
                "UPDATE retraining_jobs SET status = 'failed', "
                "error_message = 'Interrupted by server restart' "
                "WHERE status IN ('running', 'queued', 'evaluating', 'exporting')"
            )
        )
        _reset_db.commit()
    finally:
        _reset_db.close()
    # Seed default admin user on startup
    from backend.app.database import SessionLocal
    from backend.app.services import settings_service as _svc
    _db = SessionLocal()
    try:
        seed_default_admin(_db)
        # Ensure project-level defaults are written to DB on every startup
        _svc.set_value(_db, "system.app_name", "Pipeline Rakshak", updated_by="system")
        _svc.set_value(_db, "system.timezone", "Asia/Kolkata", updated_by="system")
        _svc.set_value(_db, "system.default_theme", "dark", updated_by="system")
    finally:
        _db.close()
    # Run startup health checks (DB + Storage)
    _run_startup_checks()
    yield
    print("Shutting down the application...")


app = FastAPI(
    title="Pipeline Rakshak",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Serve uploaded inspection images
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIRECTORY), name="uploads")

# Add CORS middleware to allow cross-origin requests
if settings.ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.ALLOWED_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- API Routers ---
# Include the routers from the endpoints modules with a common prefix.
app.include_router(inspections.router, prefix="/api/v1/inspections", tags=["Inspections"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(model_mgmt.router, prefix="/api/v1/models", tags=["Model Management"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(retraining.router, prefix="/api/v1/retraining", tags=["Retraining"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(settings_router_mod.router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(live_detection.router, prefix="/api/v1/live-detection", tags=["Live Detection"])

# Rate limiter error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# --- Root and Health Check Endpoints ---
@app.get("/", tags=["Health Check"])
def read_root():
    """
    Root endpoint providing a welcome message.
    """
    return {"message": f"Welcome to the {settings.PROJECT_NAME}"}

@app.get("/health", tags=["Health Check"])
def health_check():
    """
    Health check endpoint that reports API status and model readiness.
    """
    active_model = inference_service.get_active_model()
    available_models = inference_service.list_available_models()
    return {
        "status": "ok",
        "model_loaded": active_model is not None,
        "active_model": active_model or "none",
        "available_models_count": len(available_models),
    }


@app.get("/startup-checks", tags=["Health Check"])
def get_startup_checks():
    """
    Re-run and return all startup dependency checks on demand.

    Checks:
    - PostgreSQL connection
    - Supabase Storage connection and required bucket presence
    """
    checks = _run_startup_checks()
    all_ok = all(c["ok"] for c in checks)
    return {
        "all_ok": all_ok,
        "checks": checks,
    }
