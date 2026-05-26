# backend/app/services/settings_service.py
"""
Provides a typed get/set interface over the `system_settings` key-value table.
All callers use module-level helpers; no singleton state is required.
"""

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.app.models import SystemSetting

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default values – used when a key is absent from the database
# ---------------------------------------------------------------------------
DEFAULTS: dict[str, Any] = {
    # Section 1 – System
    "system.app_name": "Pipeline Rakshak",
    "system.company_name": "",
    "system.system_version": "1.0.0",
    "system.default_theme": "dark",
    "system.timezone": "Asia/Kolkata",
    # Section 2 – Model
    "model.confidence_threshold": 0.50,
    # Section 3 – Detection
    "detection.enable_severity_analysis": True,
    "detection.enable_recommendations": True,
    "detection.enable_human_verification": True,
    "detection.enable_retraining_queue": True,
    "detection.enable_analytics_collection": True,
    # Section 4 – Security
    "security.jwt_expiration_minutes": 480,
    "security.session_timeout_minutes": 60,
    "security.login_rate_limit": 10,
    "security.password_min_length": 6,
}

CATEGORY_MAP: dict[str, str] = {
    "system": "system",
    "model": "model",
    "detection": "detection",
    "security": "security",
}


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def _category_for_key(key: str) -> str:
    prefix = key.split(".")[0]
    return CATEGORY_MAP.get(prefix, "system")


def get_raw(db: Session, key: str) -> Optional[str]:
    """Return raw JSON-string value or None if missing."""
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else None


def get_value(db: Session, key: str) -> Any:
    """Return the deserialized value, falling back to DEFAULTS."""
    raw = get_raw(db, key)
    if raw is None:
        return DEFAULTS.get(key)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw  # return as-is for plain strings


def set_value(db: Session, key: str, value: Any, updated_by: str = "system") -> SystemSetting:
    """Upsert a setting key with a JSON-serialized value."""
    serialized = json.dumps(value)
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = serialized
        row.updated_by = updated_by
    else:
        row = SystemSetting(
            key=key,
            value=serialized,
            category=_category_for_key(key),
            updated_by=updated_by,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Typed convenience getters
# ---------------------------------------------------------------------------

def get_bool(db: Session, key: str) -> bool:
    val = get_value(db, key)
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return bool(val)


def get_float(db: Session, key: str) -> float:
    val = get_value(db, key)
    try:
        return float(val)
    except (TypeError, ValueError):
        default = DEFAULTS.get(key, 0.0)
        return float(default)


def get_int(db: Session, key: str) -> int:
    val = get_value(db, key)
    try:
        return int(val)
    except (TypeError, ValueError):
        default = DEFAULTS.get(key, 0)
        return int(default)


def get_str(db: Session, key: str) -> str:
    val = get_value(db, key)
    if val is None:
        return str(DEFAULTS.get(key, ""))
    return str(val)


# ---------------------------------------------------------------------------
# Bulk getters (used by API endpoints)
# ---------------------------------------------------------------------------

def get_system_settings(db: Session) -> dict:
    return {
        "app_name": get_str(db, "system.app_name"),
        "company_name": get_str(db, "system.company_name"),
        "system_version": get_str(db, "system.system_version"),
        "default_theme": get_str(db, "system.default_theme"),
        "timezone": get_str(db, "system.timezone"),
    }


def get_model_settings(db: Session, active_model: str = "") -> dict:
    return {
        "current_model": active_model,
        "confidence_threshold": get_float(db, "model.confidence_threshold"),
    }


def get_detection_settings(db: Session) -> dict:
    return {
        "enable_severity_analysis": get_bool(db, "detection.enable_severity_analysis"),
        "enable_recommendations": get_bool(db, "detection.enable_recommendations"),
        "enable_human_verification": get_bool(db, "detection.enable_human_verification"),
        "enable_retraining_queue": get_bool(db, "detection.enable_retraining_queue"),
        "enable_analytics_collection": get_bool(db, "detection.enable_analytics_collection"),
    }


def get_security_settings(db: Session) -> dict:
    return {
        "jwt_expiration_minutes": get_int(db, "security.jwt_expiration_minutes"),
        "session_timeout_minutes": get_int(db, "security.session_timeout_minutes"),
        "login_rate_limit": get_int(db, "security.login_rate_limit"),
        "password_min_length": get_int(db, "security.password_min_length"),
    }
