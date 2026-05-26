# backend/app/api/endpoints/live_detection.py
"""
Live Detection endpoint.

Accepts a base64-encoded webcam frame, runs ONNX inference via the shared
inference_service, and optionally persists the result as a standard Inspection
record — identical to those created by POST /api/v1/inspections/predict.

Because saved records use the same models.Inspection table they automatically
appear in: Inspection History, Verification Queue, Analytics, Dataset Summary,
Retraining Queue, and future Model Retraining — with no extra work.
"""

import base64
import io
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from sqlalchemy.orm import Session

from backend.app import models, schemas
from backend.app.api import deps
from backend.app.api.endpoints.inspections import (
    calculate_severity,
    decode_prediction_result,
    generate_recommendation,
)
from backend.app.config import settings
from backend.app.services.inference import inference_service
from backend.app.services.storage import storage_service

router = APIRouter()
log = logging.getLogger(__name__)

# Minimum frame dimensions to reject empty / corrupt captures
_MIN_DIM = 16


@router.get("/status", response_model=schemas.LiveDetectionStatus)
def get_live_status():
    """Return active-model info and system readiness (no side effects)."""
    active = inference_service.get_active_model()
    return schemas.LiveDetectionStatus(
        active_model=active,
        model_loaded=active is not None,
    )


@router.post("/start")
def start_session():
    """
    Acknowledge session start.
    Stateless — the camera is managed entirely by the browser client.
    Returns 503 if no model is currently loaded.
    """
    active = inference_service.get_active_model()
    if not active:
        raise HTTPException(
            status_code=503,
            detail="No model loaded. Select an active model before starting live monitoring.",
        )
    return {"status": "ready", "active_model": active}


@router.post("/stop")
def stop_session():
    """
    Acknowledge session stop.
    Stateless — the camera is managed entirely by the browser client.
    """
    return {"status": "stopped"}


@router.post("/frame", response_model=schemas.LiveDetectionResult)
def process_frame(
    payload: schemas.LiveDetectionFrameRequest,
    db: Session = Depends(deps.get_db_session),
):
    """
    Process a single webcam frame.

    - Accepts a base64-encoded JPEG/PNG (plain base64 or data-URL).
    - Runs inference using the currently active ONNX model.
    - When ``save=true`` persists the frame + result as a standard
      ``Inspection`` record, making it available everywhere in the
      platform (History, Verification, Analytics, Retraining).

    Returns the inference result regardless of the save flag.
    """
    active_model = inference_service.get_active_model()
    if not active_model:
        raise HTTPException(
            status_code=503,
            detail="No model loaded.",
        )

    # ── Decode base64 image ────────────────────────────────────────
    try:
        img_data = payload.image_data
        # Strip data-URL prefix when present: "data:image/jpeg;base64,<data>"
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]
        raw_bytes = base64.b64decode(img_data)
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    except Exception as exc:
        log.warning("Frame decode failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid image data: could not decode frame.")

    # Guard against empty / tiny captures
    w, h = pil_image.size
    if w < _MIN_DIM or h < _MIN_DIM:
        raise HTTPException(status_code=400, detail=f"Frame too small ({w}×{h}).")

    # ── Inference ──────────────────────────────────────────────────
    t0 = time.perf_counter()
    prediction_result = inference_service.predict(pil_image)
    latency_ms = (time.perf_counter() - t0) * 1000.0

    if "error" in prediction_result:
        raise HTTPException(status_code=500, detail=prediction_result["error"])

    decoded = decode_prediction_result(prediction_result)
    prediction_class = decoded["prediction_class"]
    confidence = decoded["confidence"]
    severity = decoded["severity"]
    recommendation = decoded["recommendation"]
    fps = 1000.0 / latency_ms if latency_ms > 0 else 0.0

    # ── Determine whether to persist this result ──────────────────
    # Corrosion detection: class contains "corrosion" but NOT "no_corrosion".
    # This matches both "corrosion" and class names like "heavy_corrosion".
    is_corrosion = (
        'corrosion' in prediction_class.lower()
        and 'no_corrosion' not in prediction_class.lower()
    )
    should_save = payload.save or (payload.save_corrosion_only and is_corrosion)

    inspection_id: Optional[int] = None
    saved = False

    if should_save:
        try:
            safe_name = f"live_{int(time.time() * 1000)}.jpg"

            # Encode the PIL frame to JPEG bytes for upload
            import io as _io
            _buf = _io.BytesIO()
            pil_image.save(_buf, format="JPEG", quality=85)
            _frame_bytes = _buf.getvalue()

            # Upload via storage service (local disk or Supabase Storage)
            image_path = storage_service.upload(
                "inspection-images", safe_name, _frame_bytes, "image/jpeg"
            )

            db_inspection = models.Inspection(
                image_path=image_path,
                prediction_class=prediction_class,
                confidence=confidence,
                severity=severity,
                recommendation=recommendation,
                latency_ms=round(latency_ms, 2),
                fps=round(fps, 2),
                model_used=active_model,
            )
            db.add(db_inspection)
            db.commit()
            db.refresh(db_inspection)
            inspection_id = db_inspection.id
            saved = True
            log.info(
                "Live detection saved — inspection_id=%d  class=%s  conf=%.3f  model=%s",
                inspection_id, prediction_class, confidence, active_model,
            )
        except Exception:
            log.error("Failed to save live detection as Inspection record.", exc_info=True)
            db.rollback()
            # Do NOT raise — still return the inference result to the client.

    return schemas.LiveDetectionResult(
        prediction_class=prediction_class,
        confidence=confidence,
        severity=severity,
        recommendation=recommendation,
        latency_ms=round(latency_ms, 2),
        model_used=active_model,
        inspection_id=inspection_id,
        saved=saved,
    )
