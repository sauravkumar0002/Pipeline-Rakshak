# backend/app/api/endpoints/settings.py
"""
Settings API – seven logical sections:
  1. System settings  (GET/PUT /settings/system)
  2. Model settings   (GET/PUT /settings/model)
  3. Detection settings (GET/PUT /settings/detection)
  4. Security settings (GET/PUT /settings/security)
  5. User management  (moved to /auth — re-exported here for convenience)
  6. System info      (GET /settings/info)
  7. Backup / restore (GET /settings/backup/export, GET /settings/backup/settings,
                       POST /settings/backup/restore)
"""

import io
import json
import platform
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Inspection, SystemSetting, User
from backend.app.schemas import (
    DetectionSettingsResponse,
    DetectionSettingsUpdate,
    ModelSettingsResponse,
    ModelSettingsUpdate,
    SecuritySettingsResponse,
    SecuritySettingsUpdate,
    SystemInfoResponse,
    SystemSettingsResponse,
    SystemSettingsUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from backend.app.api.endpoints.auth import get_current_user, require_admin
from backend.app.models import User
from backend.app.services import settings_service as svc
from backend.app.services.auth import hash_password
from backend.app.services.inference import inference_service
from backend.app.config import settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Section 1 – System settings
# ---------------------------------------------------------------------------

@router.get("/system", response_model=SystemSettingsResponse, summary="Get system settings")
def get_system_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return svc.get_system_settings(db)


@router.put("/system", response_model=SystemSettingsResponse, summary="Update system settings")
def update_system_settings(
    body: SystemSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    field_key_map = {
        "app_name": "system.app_name",
        "company_name": "system.company_name",
        "default_theme": "system.default_theme",
        "timezone": "system.timezone",
    }
    updates = body.model_dump(exclude_none=True)
    for field, key in field_key_map.items():
        if field in updates:
            svc.set_value(db, key, updates[field], updated_by=current_user.username)
    return svc.get_system_settings(db)


# ---------------------------------------------------------------------------
# Section 2 – Model settings
# ---------------------------------------------------------------------------

@router.get("/model", response_model=ModelSettingsResponse, summary="Get model settings")
def get_model_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return svc.get_model_settings(db, active_model=inference_service.get_active_model() or "")


@router.put("/model", response_model=ModelSettingsResponse, summary="Update model settings")
def update_model_settings(
    body: ModelSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    svc.set_value(db, "model.confidence_threshold", body.confidence_threshold, updated_by=current_user.username)
    return svc.get_model_settings(db, active_model=inference_service.get_active_model() or "")


# ---------------------------------------------------------------------------
# Section 3 – Detection settings
# ---------------------------------------------------------------------------

@router.get("/detection", response_model=DetectionSettingsResponse, summary="Get detection settings")
def get_detection_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return svc.get_detection_settings(db)


@router.put("/detection", response_model=DetectionSettingsResponse, summary="Update detection settings")
def update_detection_settings(
    body: DetectionSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    field_key_map = {
        "enable_severity_analysis": "detection.enable_severity_analysis",
        "enable_recommendations": "detection.enable_recommendations",
        "enable_human_verification": "detection.enable_human_verification",
        "enable_retraining_queue": "detection.enable_retraining_queue",
        "enable_analytics_collection": "detection.enable_analytics_collection",
    }
    updates = body.model_dump(exclude_none=True)
    for field, key in field_key_map.items():
        if field in updates:
            svc.set_value(db, key, updates[field], updated_by=current_user.username)
    return svc.get_detection_settings(db)


# ---------------------------------------------------------------------------
# Section 4 – Security settings
# ---------------------------------------------------------------------------

@router.get("/security", response_model=SecuritySettingsResponse, summary="Get security settings")
def get_security_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return svc.get_security_settings(db)


@router.put("/security", response_model=SecuritySettingsResponse, summary="Update security settings")
def update_security_settings(
    body: SecuritySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    field_key_map = {
        "jwt_expiration_minutes": "security.jwt_expiration_minutes",
        "session_timeout_minutes": "security.session_timeout_minutes",
        "login_rate_limit": "security.login_rate_limit",
        "password_min_length": "security.password_min_length",
    }
    updates = body.model_dump(exclude_none=True)
    for field, key in field_key_map.items():
        if field in updates:
            svc.set_value(db, key, updates[field], updated_by=current_user.username)
    return svc.get_security_settings(db)


# ---------------------------------------------------------------------------
# Section 5 – User management (admin only)
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[UserResponse], summary="List all users (admin)")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Create user (admin)")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.username == body.username.strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists.")
    if body.email:
        existing_email = db.query(User).filter(User.email == body.email.strip()).first()
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already registered.")
    new_user = User(
        username=body.username.strip(),
        email=body.email.strip() if body.email else None,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.put("/users/{user_id}", response_model=UserResponse, summary="Update user (admin)")
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete user (admin)")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    db.delete(user)
    db.commit()


# ---------------------------------------------------------------------------
# Section 6 – System information (read-only)
# ---------------------------------------------------------------------------

@router.get("/info", response_model=SystemInfoResponse, summary="Get system information")
def get_system_info(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "error"

    total_inspections = db.query(Inspection).count()
    total_users = db.query(User).count()
    available_models = inference_service.list_available_models()

    return SystemInfoResponse(
        backend_version="1.0.0",
        frontend_version="1.0.0",
        python_version=platform.python_version(),
        database_status=db_status,
        api_status="online",
        current_active_model=inference_service.get_active_model() or "none",
        available_models_count=len(available_models),
        total_users=total_users,
        total_inspections=total_inspections,
    )


# ---------------------------------------------------------------------------
# Section 7 – Backup & Restore
# ---------------------------------------------------------------------------

@router.get("/backup/export", summary="Export database file (admin)")
def export_database(
    _: User = Depends(require_admin),
):
    """Stream the SQLite database file as a download."""
    db_path = Path("corrosion_detection.db")
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Database file not found.")

    def _iter_file():
        with open(db_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        _iter_file(),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="corrosion_db_{timestamp}.db"'
        },
    )


@router.get("/backup/settings", summary="Download settings as JSON backup (admin)")
def download_settings_backup(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Export all system_settings rows as a JSON file."""
    rows = db.query(SystemSetting).order_by(SystemSetting.key).all()
    backup: dict = {}
    for row in rows:
        try:
            backup[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, ValueError):
            backup[row.key] = row.value

    # Include defaults for keys not yet in DB
    for key, default in svc.DEFAULTS.items():
        if key not in backup:
            backup[key] = default

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    content = json.dumps(backup, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="settings_backup_{timestamp}.json"'
        },
    )


@router.post("/backup/restore", summary="Restore settings from JSON backup (admin)")
async def restore_settings(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Upload a previously exported settings JSON file to restore all settings.
    Only known keys (those present in DEFAULTS) are accepted.
    """
    if file.content_type not in ("application/json", "text/plain", "text/json"):
        raise HTTPException(status_code=400, detail="Only JSON files are accepted.")

    contents = await file.read()
    if len(contents) > 1_048_576:  # 1 MB limit
        raise HTTPException(status_code=413, detail="Settings backup file must be ≤ 1 MB.")

    try:
        data = json.loads(contents)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file.")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Settings backup must be a JSON object.")

    restored = 0
    for key, value in data.items():
        if key in svc.DEFAULTS:  # Only restore known keys
            svc.set_value(db, key, value, updated_by=current_user.username)
            restored += 1

    return {"restored_count": restored, "message": f"Restored {restored} settings successfully."}
