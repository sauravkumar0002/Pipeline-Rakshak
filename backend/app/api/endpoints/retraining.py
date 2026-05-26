# backend/app/api/endpoints/retraining.py
"""
Retraining pipeline endpoints.

Handles:
  - Dataset inspection  (GET  /dataset)
  - Queue management    (POST /queue, GET /queue, DELETE /queue)
  - Retraining jobs     (POST /start, GET /jobs, GET /jobs/{id}, DELETE /jobs/{id})
  - Epoch logs          (GET  /jobs/{id}/epochs)
  - Model versioning    (GET  /model-versions)
  - Promotion workflow  (POST /model-versions/{version_id}/promote)
"""

from __future__ import annotations

import json
import os
import re
import signal
import multiprocessing
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app import models, schemas
from backend.app.api import deps
from backend.app.config import settings

router = APIRouter()

# Only allow alphanumeric, hyphens, underscores in model names
_SAFE_MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


# ── helpers ────────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _base_dir() -> str:
    """Absolute path to the project root (parent of backend/)."""
    return str(Path(__file__).resolve().parents[4])


def _get_current_accuracy(db: Session, model_name: str) -> float:
    """
    Return the accuracy of the currently active version for model_name.
    Falls back to verified-inspection accuracy, then 0.70.
    """
    active = (
        db.query(models.ModelVersion)
          .filter(
              models.ModelVersion.model_name == model_name,
              models.ModelVersion.status == "active",
          )
          .order_by(models.ModelVersion.created_at.desc())
          .first()
    )
    if active and active.accuracy is not None:
        return float(active.accuracy)

    verified = (
        db.query(models.Inspection)
          .filter(
              models.Inspection.model_used == model_name,
              models.Inspection.is_verified == True,
          )
          .all()
    )
    if len(verified) >= 2:
        correct = sum(
            1 for i in verified
            if i.prediction_class == (i.corrected_class or i.prediction_class)
        )
        return round(correct / len(verified), 4)

    return 0.70


def _spawn_worker(job_id: int, db_url: str, base_dir: str) -> None:
    """Create and start the training subprocess.  Updates worker_pid in DB."""
    from backend.training.worker import run_training_job
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    p = multiprocessing.Process(
        target=run_training_job,
        args=(job_id, db_url, base_dir),
        daemon=False,
    )
    p.start()

    # Record PID (best-effort — subprocess may already be running)
    try:
        _connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
        eng = create_engine(db_url, connect_args=_connect_args)
        Sess = sessionmaker(bind=eng)
        with Sess() as s:
            s.execute(
                text("UPDATE retraining_jobs SET worker_pid = :pid WHERE id = :id"),
                {"pid": p.pid, "id": job_id},
            )
            s.commit()
        eng.dispose()
    except Exception:
        pass


# ── Dataset ────────────────────────────────────────────────────────────────────

@router.get("/dataset", response_model=schemas.DatasetSummary)
def get_dataset_summary(db: Session = Depends(deps.get_db_session)):
    """Returns a summary of the verified dataset available for retraining."""
    total = (
        db.query(func.count(models.Inspection.id))
          .filter(models.Inspection.is_verified == True)
          .scalar() or 0
    )
    corrosion = (
        db.query(func.count(models.Inspection.id))
          .filter(
              models.Inspection.is_verified == True,
              models.Inspection.corrected_class == "corrosion",
          )
          .scalar() or 0
    )
    corrosion_fallback = (
        db.query(func.count(models.Inspection.id))
          .filter(
              models.Inspection.is_verified == True,
              models.Inspection.corrected_class == None,
              models.Inspection.prediction_class == "corrosion",
          )
          .scalar() or 0
    )
    total_corrosion = corrosion + corrosion_fallback
    non_corrosion   = total - total_corrosion
    balance = round(total_corrosion / total, 4) if total > 0 else 0.0

    return schemas.DatasetSummary(
        total_verified_images=total,
        corrosion_count=total_corrosion,
        non_corrosion_count=non_corrosion,
        dataset_balance=balance,
    )


# ── Queue ──────────────────────────────────────────────────────────────────────

@router.get("/queue", response_model=List[schemas.QueueItemResponse])
def get_queue(db: Session = Depends(deps.get_db_session)):
    """Returns all items currently in the retraining queue."""
    return db.query(models.RetrainingQueueItem).order_by(
        models.RetrainingQueueItem.added_at.desc()
    ).all()


@router.post("/queue", response_model=Dict[str, Any])
def build_queue(
    body: schemas.QueueBuildRequest,
    db: Session = Depends(deps.get_db_session),
):
    """Populates the retraining queue with verified inspections."""
    query = db.query(models.Inspection).filter(models.Inspection.is_verified == True)
    if body.model_name:
        query = query.filter(models.Inspection.model_used == body.model_name)

    verified = query.all()
    if not verified:
        raise HTTPException(status_code=400, detail="No verified inspections available to queue.")

    existing_ids = {
        row[0]
        for row in db.query(models.RetrainingQueueItem.inspection_id).all()
    }

    added = 0
    for insp in verified:
        if insp.id in existing_ids:
            continue
        label = insp.corrected_class or insp.prediction_class
        item = models.RetrainingQueueItem(
            inspection_id=insp.id,
            image_path=insp.image_path,
            verified_label=label,
            model_name=insp.model_used or "unknown",
        )
        db.add(item)
        added += 1

    db.commit()
    total_in_queue = db.query(func.count(models.RetrainingQueueItem.id)).scalar() or 0
    return {
        "added": added,
        "skipped": len(verified) - added,
        "total_in_queue": total_in_queue,
        "message": f"Added {added} new items to the retraining queue.",
    }


@router.delete("/queue", response_model=Dict[str, Any])
def clear_queue(db: Session = Depends(deps.get_db_session)):
    """Clears the entire retraining queue."""
    deleted = db.query(models.RetrainingQueueItem).delete()
    db.commit()
    return {"deleted": deleted, "message": "Retraining queue cleared."}


# ── Retraining Jobs ────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=List[schemas.RetrainingJobResponse])
def list_jobs(db: Session = Depends(deps.get_db_session)):
    """Returns all retraining jobs, newest first."""
    return db.query(models.RetrainingJob).order_by(
        models.RetrainingJob.created_at.desc()
    ).all()


@router.get("/jobs/{job_id}", response_model=schemas.RetrainingJobResponse)
def get_job(job_id: int, db: Session = Depends(deps.get_db_session)):
    """Returns a single retraining job by ID."""
    job = db.query(models.RetrainingJob).filter(models.RetrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Retraining job {job_id} not found.")
    return job


@router.get("/jobs/{job_id}/epochs", response_model=List[schemas.EpochLogResponse])
def get_job_epochs(job_id: int, db: Session = Depends(deps.get_db_session)):
    """Returns per-epoch training metrics for a specific job."""
    job = db.query(models.RetrainingJob).filter(models.RetrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Retraining job {job_id} not found.")
    return (
        db.query(models.TrainingEpochLog)
          .filter(models.TrainingEpochLog.job_id == job_id)
          .order_by(models.TrainingEpochLog.epoch)
          .all()
    )


@router.delete("/jobs/{job_id}", response_model=Dict[str, Any])
def cancel_job(job_id: int, db: Session = Depends(deps.get_db_session)):
    """
    Cancel a queued or running job.
    Sends SIGTERM to the worker process if it is running.
    """
    job = db.query(models.RetrainingJob).filter(models.RetrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Retraining job {job_id} not found.")

    if job.status not in ("queued", "running", "evaluating", "exporting"):
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} has status '{job.status}' and cannot be cancelled.",
        )

    # Try to terminate the worker process
    if job.worker_pid:
        try:
            if os.name == "nt":
                os.kill(job.worker_pid, signal.SIGTERM)
            else:
                os.kill(job.worker_pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass  # already finished

    job.status = "cancelled"
    job.cancelled_at = _now_utc()
    job.completed_at = _now_utc()
    db.commit()
    return {"job_id": job_id, "status": "cancelled"}


@router.post("/start", response_model=schemas.RetrainingJobResponse)
def start_retraining(
    body: schemas.StartRetrainingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db_session),
):
    """
    Queue a real retraining job and start it in a background subprocess.

    1. Validate there is enough training data.
    2. Create a RetrainingJob with status='queued'.
    3. Return the job immediately (HTTP 200).
    4. Spawn a child process via BackgroundTasks to run the full pipeline.
    """
    # How many items are in the queue for this model?
    queue_count = (
        db.query(func.count(models.RetrainingQueueItem.id))
          .filter(models.RetrainingQueueItem.model_name == body.model_name)
          .scalar() or 0
    )
    if queue_count == 0:
        # Fallback: count verified inspections used by this model
        queue_count = (
            db.query(func.count(models.Inspection.id))
              .filter(
                  models.Inspection.is_verified == True,
                  models.Inspection.model_used == body.model_name,
              )
              .scalar() or 0
        )

    if queue_count < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "Not enough training data. "
                "Build the retraining queue first (need ≥ 2 verified samples)."
            ),
        )

    # Security: sanitize model_name
    if not _SAFE_MODEL_NAME_RE.match(body.model_name):
        raise HTTPException(
            status_code=422,
            detail="model_name contains invalid characters. Use alphanumeric, hyphens, underscores only.",
        )

    accuracy_before = _get_current_accuracy(db, body.model_name)

    hp = {
        "epochs":         body.epochs,
        "batch_size":     body.batch_size,
        "learning_rate":  body.learning_rate,
        "weight_decay":   body.weight_decay,
        "patience":       body.patience,
        "scheduler":      body.scheduler,
    }

    job = models.RetrainingJob(
        model_name=body.model_name,
        dataset_size=queue_count,
        status="queued",
        accuracy_before=accuracy_before,
        notes=body.notes,
        training_mode=body.training_mode,
        hyperparameters=json.dumps(hp),
        total_epochs=body.epochs,
        progress_epoch=0,
        progress_pct=0.0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Spawn the training subprocess via BackgroundTasks so it outlives this request
    background_tasks.add_task(
        _spawn_worker,
        job.id,
        settings.DATABASE_URL,
        _base_dir(),
    )

    return job


# ── Model Versions ─────────────────────────────────────────────────────────────

@router.get("/model-versions", response_model=List[schemas.ModelVersionResponse])
def list_model_versions(db: Session = Depends(deps.get_db_session)):
    """Returns all model versions, newest first."""
    return db.query(models.ModelVersion).order_by(
        models.ModelVersion.created_at.desc()
    ).all()


@router.post("/model-versions/{version_id}/promote", response_model=schemas.ModelVersionResponse)
def promote_model_version(
    version_id: int,
    body: schemas.PromoteModelRequest,
    db: Session = Depends(deps.get_db_session),
):
    """
    Promotes a candidate model version to 'active'.
    Copies the ONNX file to the production model directory and hot-reloads inference.
    """
    candidate = db.query(models.ModelVersion).filter(
        models.ModelVersion.id == version_id
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Model version {version_id} not found.")
    if candidate.status == "active":
        raise HTTPException(status_code=400, detail="This version is already active.")
    if candidate.status == "archived":
        raise HTTPException(status_code=400, detail="Archived versions cannot be promoted.")

    # Archive any currently active versions of the same model
    db.query(models.ModelVersion).filter(
        models.ModelVersion.model_name == candidate.model_name,
        models.ModelVersion.status == "active",
    ).update({"status": "archived"})

    candidate.status = "active"
    if body.notes:
        candidate.notes = body.notes

    db.commit()
    db.refresh(candidate)

    # Physical ONNX promotion + inference hot-reload
    try:
        from backend.app.services.model_promotion import promote_model
        promote_model(candidate, db)
    except Exception as exc:
        # Promotion of the file is best-effort; DB is already updated
        import logging
        logging.getLogger(__name__).warning("Model file promotion failed: %s", exc)

    # Upload ONNX to model-artifacts bucket (best-effort; non-blocking)
    try:
        from backend.app.services.storage import storage_service
        if candidate.file_path:
            from pathlib import Path as _Path
            _onnx_path = _Path(candidate.file_path)
            if _onnx_path.exists():
                _onnx_bytes = _onnx_path.read_bytes()
                _artifact_name = f"onnx/{candidate.model_name}_v{candidate.id}.onnx"
                _artifact_url = storage_service.upload(
                    "model-artifacts", _artifact_name, _onnx_bytes, "application/octet-stream"
                )
                # Persist the artifact URL back to the model version record
                candidate.file_path = _artifact_url
                db.commit()
                db.refresh(candidate)
    except Exception as _art_exc:
        import logging as _log
        _log.getLogger(__name__).warning("ONNX artifact upload failed (non-fatal): %s", _art_exc)

    return candidate


# ── Training Artifacts ────────────────────────────────────────────────────────

_ARTIFACT_KINDS: Dict[str, str] = {
    ".png":  "image",
    ".json": "json",
    ".csv":  "csv",
}

_ALLOWED_ARTIFACTS = {
    "confusion_matrix.png",
    "roc_curve.png",
    "pr_curve.png",
    "metrics_summary.json",
    "classification_report.json",
    "predictions.csv",
}


@router.get("/jobs/{job_id}/artifacts", response_model=schemas.TrainingArtifactsResponse)
def get_job_artifacts(job_id: int, db: Session = Depends(deps.get_db_session)):
    """
    List available evaluation artifact files for a completed training job.
    Returns metadata (name, size, URL) only — no file content.
    """
    job = db.query(models.RetrainingJob).filter(models.RetrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    if not job.evaluation_dir:
        return schemas.TrainingArtifactsResponse(
            job_id=job_id,
            evaluation_dir=None,
            artifacts=[],
        )

    eval_path = Path(job.evaluation_dir)
    artifacts: List[schemas.ArtifactInfo] = []

    for fname in sorted(_ALLOWED_ARTIFACTS):
        fpath = eval_path / fname
        if fpath.exists():
            ext = Path(fname).suffix.lower()
            artifacts.append(schemas.ArtifactInfo(
                name=fname,
                size_bytes=fpath.stat().st_size,
                url=f"/api/v1/retraining/jobs/{job_id}/artifacts/{fname}",
                kind=_ARTIFACT_KINDS.get(ext, "other"),
            ))

    return schemas.TrainingArtifactsResponse(
        job_id=job_id,
        evaluation_dir=str(job.evaluation_dir),
        artifacts=artifacts,
    )


@router.get("/jobs/{job_id}/artifacts/{filename}")
def get_artifact_file(
    job_id: int,
    filename: str,
    db: Session = Depends(deps.get_db_session),
):
    """
    Serve a single evaluation artifact file (PNG, JSON, or CSV).
    Only explicitly whitelisted filenames are allowed.
    """
    job = db.query(models.RetrainingJob).filter(models.RetrainingJob.id == job_id).first()
    if not job or not job.evaluation_dir:
        raise HTTPException(status_code=404, detail="Job or evaluation directory not found.")

    # Security: whitelist check — no path traversal, only known artifact names
    if filename not in _ALLOWED_ARTIFACTS:
        raise HTTPException(
            status_code=400,
            detail=f"'{filename}' is not an allowed artifact. "
                   f"Allowed: {sorted(_ALLOWED_ARTIFACTS)}",
        )

    fpath = Path(job.evaluation_dir) / filename
    if not fpath.exists():
        raise HTTPException(status_code=404, detail=f"Artifact '{filename}' not found for job {job_id}.")

    return FileResponse(str(fpath))


# ── Dataset integrity pre-check ───────────────────────────────────────────────

@router.get("/dataset/validate", response_model=schemas.DatasetValidationResponse)
def validate_dataset(db: Session = Depends(deps.get_db_session)):  # noqa: ARG001
    """
    Run a pre-training dataset integrity check (no DB mutation).
    Returns totals, class counts, corrupted/duplicate counts, warnings, and errors.
    """
    from backend.training.dataset import validate_dataset_integrity

    dataset_root = Path(_base_dir()) / "backend" / "datasets" / "retraining"
    report = validate_dataset_integrity(str(dataset_root))

    return schemas.DatasetValidationResponse(
        total=report["total"],
        valid=report["valid"],
        corrupted=report["corrupted"],
        duplicates=report["duplicates"],
        class_counts=report["class_counts"],
        warnings=report["warnings"],
        errors=report["errors"],
        ready=len(report["errors"]) == 0,
    )

