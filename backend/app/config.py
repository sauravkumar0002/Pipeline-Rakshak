# backend/app/config.py

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    """
    Application settings management using Pydantic.
    Reads configuration from environment variables.
    """
    # Database settings
    DATABASE_URL: str = Field(
        "sqlite:///./corrosion_detection.db",
        description="Database connection URL. Defaults to SQLite for local development."
    )

    # Directory settings
    MODEL_DIRECTORY: str = Field(
        "backend/models/onnx",
        description="Directory where ONNX models are stored, relative to the project root (CWD)."
    )
    UPLOAD_DIRECTORY: str = Field(
        "uploads",
        description="Directory for storing uploaded images for analysis."
    )
    REPORT_DIRECTORY: str = Field(
        "reports",
        description="Directory for storing generated inspection reports."
    )

    # CORS settings
    ALLOWED_ORIGINS: List[str] = Field(
    default=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",

        # Netlify
        "https://pipeline-rakshak-frontend.netlify.app",

        # Preview URL shown in screenshot
        "https://6a15d814fea796e2194e142--pipeline-rakshak-frontend.netlify.app",
    ]
)
    # API metadata
    PROJECT_NAME: str = "Pipeline Rakshak"
    API_VERSION: str = "v1.0.0"

    # Model settings
    DEFAULT_MODEL: str = Field(
        "mobilenetv2_standard.onnx",
        description="Default ONNX model to use for predictions if not specified."
    )

    # Logging settings
    LOG_LEVEL: str = Field(
        "INFO",
        description="Logging level (e.g., DEBUG, INFO, WARNING, ERROR)."
    )

    # ── Storage backend ───────────────────────────────────────────────────────
    # "local"    — write to local directories (default, dev-friendly).
    # "supabase" — upload to Supabase Storage; requires URL + key below.
    STORAGE_BACKEND: str = Field(
        "local",
        description="Storage backend: 'local' or 'supabase'."
    )

    # Supabase project URL (e.g. https://<ref>.supabase.co)
    # The /rest/v1 suffix is accepted and stripped automatically.
    SUPABASE_URL: str = Field(
        "",
        description="Supabase project URL."
    )

    # Supabase service-role key (keep secret — never commit to git).
    SUPABASE_SERVICE_KEY: str = Field(
        "",
        description="Supabase service-role secret key."
    )

    # JWT secret key used by auth.py for token signing/verification.
    # Also readable directly via os.environ in auth.py.
    JWT_SECRET_KEY: str = Field(
        "CHANGE_ME_in_production",
        description="Secret key for signing JWT tokens."
    )

    # Model configuration for pydantic-settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra="ignore",
    )

# Instantiate settings to be imported by other modules
settings = Settings()
