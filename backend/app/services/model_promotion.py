# backend/app/services/model_promotion.py
"""
Promotes a trained ModelVersion to the production ONNX slot.

Responsibilities
----------------
1. Validate that the ONNX export file exists and passes onnx.checker.
2. Sanitize model_name to prevent path traversal attacks.
3. Back up the existing production file before overwriting.
4. Copy atomically to backend/models/onnx/{model_name}.onnx.
5. Hot-reload the inference service.
"""

from __future__ import annotations

import re
import shutil
import logging
from pathlib import Path

import onnx

logger = logging.getLogger(__name__)

# Only allow alphanumeric, hyphen, underscore — no path separators or dots
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _sanitize_model_name(name: str) -> str:
    """
    Validate that name is a safe bare filename with no path separators or dots.
    Raises ValueError if the name is not safe.
    """
    # Reject any name that contains path separators or dots outright
    if "/" in name or "\\" in name or "." in name:
        raise ValueError(
            f"Unsafe model name '{name}'. "
            "Only alphanumeric characters, hyphens, and underscores are allowed."
        )
    if not _SAFE_NAME_RE.match(name):
        raise ValueError(
            f"Unsafe model name '{name}'. "
            "Only alphanumeric characters, hyphens, and underscores are allowed."
        )
    return name


def promote_model(version, db) -> None:
    """
    Copy the ONNX export from the training job directory to the production
    model directory, validate it, back up the existing file, then hot-reload
    the inference service.

    Parameters
    ----------
    version : ModelVersion ORM object (must have .file_path and .model_name)
    db      : SQLAlchemy session (unused here but kept for future audit hooks)
    """
    if not version.file_path:
        raise ValueError(
            f"ModelVersion {version.id} has no file_path — "
            "the training job may not have exported an ONNX file yet."
        )

    src = Path(version.file_path)
    if not src.exists():
        raise FileNotFoundError(
            f"ONNX export not found at '{src}'. "
            "The file may have been deleted or the job failed before export."
        )

    # ── Security: sanitize model_name before using it in a file path ─────────
    safe_name = _sanitize_model_name(str(version.model_name))

    # ── ONNX validation before touching the production slot ──────────────────
    try:
        model_proto = onnx.load(str(src))
        onnx.checker.check_model(model_proto)
        logger.info("ONNX validation passed for '%s'", src.name)
    except Exception as exc:
        raise RuntimeError(
            f"ONNX validation failed for '{src}'. "
            f"Refusing to promote a broken model. Error: {exc}"
        ) from exc

    # Resolve production slot
    backend_dir = Path(__file__).resolve().parents[2]
    dst_dir = backend_dir / "models" / "onnx"
    dst_dir.mkdir(parents=True, exist_ok=True)

    dst = dst_dir / f"{safe_name}.onnx"

    # ── Backup existing production file ───────────────────────────────────────
    backup = None
    if dst.exists():
        backup = dst.with_suffix(".onnx.bak")
        shutil.copy2(str(dst), str(backup))
        logger.info("Backed up existing production model to '%s'", backup)

    # ── Atomic copy: write tmp then rename ────────────────────────────────────
    tmp = dst.with_suffix(".onnx.tmp")
    try:
        shutil.copy2(str(src), str(tmp))
        tmp.replace(dst)
    except Exception as exc:
        # Restore backup if copy failed
        tmp.unlink(missing_ok=True)
        if backup and backup.exists():
            backup.replace(dst)
            logger.warning("Promotion copy failed; restored backup from '%s'", backup)
        raise RuntimeError(f"Promotion copy failed: {exc}") from exc

    logger.info(
        "Promoted ModelVersion %s (%s) → %s",
        version.id,
        version.model_name,
        dst,
    )

    # ── Hot-reload inference service ──────────────────────────────────────────
    try:
        from backend.app.services.inference import inference_service
        inference_service.scan_for_models()
        inference_service.load_model(safe_name)
        logger.info("Inference service reloaded model '%s'", safe_name)
    except Exception as exc:
        logger.warning("Inference hot-reload failed: %s", exc)
