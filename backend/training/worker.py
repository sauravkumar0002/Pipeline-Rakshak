"""
worker.py

Retraining worker for Pipeline Rakshak.
Designed to run in a separate multiprocessing.Process spawned by the API.
All heavy imports (torch, torchvision) are deferred inside run_training_job()
so the API process is not affected by loading them.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class TrainingConfig:
    """Configuration passed from API to the worker process."""

    job_id: int
    model_name: str
    training_mode: str
    dataset_path: str
    epochs: int = 30
    batch_size: int = 8
    learning_rate: float = 1e-4
    weight_decay: float = 1e-4
    scheduler_name: str = "plateau"
    patience: int = 7
    image_size: int = 224
    num_workers: int = 0
    pretrained: bool = True


# ─────────────────────────────────────────────────────────────────────────────
# Top-level function required for multiprocessing.Process on Windows (spawn)
# ─────────────────────────────────────────────────────────────────────────────

def run_training_job(job_id: int, db_url: str, base_dir: str) -> None:
    """
    Entry-point executed inside the child process.

    Parameters
    ----------
    job_id  : int   — PK of the RetrainingJob row
    db_url  : str   — SQLAlchemy DB URL (e.g. sqlite:///./corrosion_detection.db)
    base_dir: str   — root of the project (parent of backend/)
    """
    # ── Phase 1: stdlib only — always safe ───────────────────────────────────
    import importlib.util
    import json
    import logging
    import os
    import shutil
    import time
    import traceback
    from datetime import datetime, timezone

    # ── Phase 2: file + stream logging ───────────────────────────────────────
    _log_dir = Path(base_dir) / "backend" / "logs"
    _log_dir.mkdir(parents=True, exist_ok=True)

    log = logging.getLogger(f"training.worker.job{job_id}")
    log.setLevel(logging.DEBUG)
    if not log.handlers:
        _fh = logging.FileHandler(
            str(_log_dir / "training.log"), encoding="utf-8"
        )
        _fh.setLevel(logging.DEBUG)
        _fh.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)-8s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        _sh = logging.StreamHandler()
        _sh.setLevel(logging.INFO)
        _sh.setFormatter(logging.Formatter(
            "[%(asctime)s %(levelname)s] %(message)s",
            datefmt="%H:%M:%S",
        ))
        log.addHandler(_fh)
        log.addHandler(_sh)

    log.info(
        "Worker started — job_id=%d  pid=%d  base_dir=%s",
        job_id, os.getpid(), base_dir,
    )

    # ── Phase 3: SQLAlchemy (main-app dep — always present) ──────────────────
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    _connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
    engine = create_engine(db_url, connect_args=_connect_args)
    Session = sessionmaker(bind=engine)
    db = Session()

    def _update_job(**kwargs):
        sets = ", ".join(f"{k} = :{k}" for k in kwargs)
        kwargs["_id"] = job_id
        db.execute(text(f"UPDATE retraining_jobs SET {sets} WHERE id = :_id"), kwargs)
        db.commit()

    def _log_epoch(epoch, train_loss, val_loss, val_acc, val_f1, lr, dur):
        db.execute(
            text(
                "INSERT INTO training_epoch_logs "
                "(job_id, epoch, train_loss, val_loss, val_accuracy, val_f1, "
                "learning_rate, duration_sec, timestamp) "
                "VALUES (:job_id, :epoch, :train_loss, :val_loss, :val_accuracy, "
                ":val_f1, :learning_rate, :duration_sec, :timestamp)"
            ),
            {
                "job_id": job_id, "epoch": epoch,
                "train_loss": round(float(train_loss), 6),
                "val_loss": round(float(val_loss), 6),
                "val_accuracy": round(float(val_acc), 6),
                "val_f1": round(float(val_f1), 6),
                "learning_rate": round(float(lr), 8),
                "duration_sec": round(float(dur), 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        log.info(
            "Epoch %d — train_loss=%.4f  val_loss=%.4f  val_acc=%.4f  "
            "val_f1=%.4f  lr=%.2e  dur=%.1fs",
            epoch, train_loss, val_loss, val_acc, val_f1, lr, dur,
        )

    def _is_cancelled() -> bool:
        """Check if this job was cancelled externally while running."""
        try:
            row = db.execute(
                text("SELECT status FROM retraining_jobs WHERE id = :id"),
                {"id": job_id},
            ).mappings().first()
            return row is not None and row["status"] == "cancelled"
        except Exception:
            return False

    _temp_dataset_dir = None  # Path | None; populated when queue has URL-based images

    try:
        # ── Phase 4: validate training dependencies ───────────────────────────
        _REQUIRED_PKGS = {
            "torch":        "torch",
            "torchvision":  "torchvision",
            "sklearn":      "scikit-learn",
            "numpy":        "numpy",
            "pandas":       "pandas",
            "matplotlib":   "matplotlib",
            "onnx":         "onnx",
            "onnxruntime":  "onnxruntime",
            "onnxscript":   "onnxscript",
            "PIL":          "pillow",
            "tqdm":         "tqdm",
        }
        _missing_pkgs = [
            pkg for mod, pkg in _REQUIRED_PKGS.items()
            if importlib.util.find_spec(mod) is None
        ]
        if _missing_pkgs:
            raise ImportError(
                f"Missing training dependencies: {', '.join(_missing_pkgs)}\n"
                f"Run inside your virtual environment:\n"
                f"  pip install -r requirements-training.txt"
            )
        log.info(
            "Dependency check passed — all %d packages present.",
            len(_REQUIRED_PKGS),
        )

        # ── Phase 5: heavy imports (after dep check confirms availability) ────
        import torch
        import torch.nn as nn
        import torch.optim as optim
        from backend.training.dataset import (
            create_dataloaders,
            collect_dataset,
            validate_dataset_integrity,
            compute_class_weights,
            download_queue_images,
        )
        from backend.training.model_factory import get_model
        from backend.training.trainer import train_one_epoch, validate_one_epoch
        from backend.training.checkpoint import CheckpointManager
        from backend.training.early_stopping import EarlyStopping
        from backend.training.schedulers import create_scheduler
        from backend.training.evaluator import Evaluator
        from backend.training.onnx_exporter import ONNXExporter

        log.info("All heavy imports loaded successfully.")

        # ── read job config from DB ───────────────────────────────────────────
        row = db.execute(
            text("SELECT * FROM retraining_jobs WHERE id = :id"), {"id": job_id}
        ).mappings().first()

        if row is None:
            return

        model_name    = row["model_name"]
        training_mode = row.get("training_mode") or "full_finetune"
        hp_raw        = row.get("hyperparameters") or "{}"
        hp            = json.loads(hp_raw)
        epochs        = int(hp.get("epochs", 30))
        batch_size    = int(hp.get("batch_size", 8))
        lr            = float(hp.get("learning_rate", 1e-4))
        weight_decay  = float(hp.get("weight_decay", 1e-4))
        patience      = int(hp.get("patience", 7))
        scheduler_name = hp.get("scheduler", "plateau")
        image_size    = int(hp.get("image_size", 224))
        num_workers   = 0  # Windows multiprocessing: always 0

        # Record worker PID and flip to "running"
        log.info(
            "Job %d — model=%s  mode=%s  epochs=%d  lr=%s  batch=%d",
            job_id, model_name, training_mode, epochs, lr, batch_size,
        )
        _update_job(
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
            worker_pid=os.getpid(),
            total_epochs=epochs,
            progress_epoch=0,
            progress_pct=0.0,
        )

        # ── dataset source resolution (URL-aware) ─────────────────────────────
        # If any retraining queue items reference remote URLs (e.g. Supabase
        # Storage), download all queue images to a temp directory so the
        # training pipeline always reads from local files. Local-only jobs are
        # completely unaffected (requirement 6 — existing workflow unchanged).
        base = Path(base_dir)
        _queue_rows = db.execute(
            text("SELECT id, image_path, verified_label FROM retraining_queue"),
        ).mappings().all()

        _url_count = sum(
            1 for r in _queue_rows
            if str(r["image_path"] or "").startswith(("http://", "https://"))
        )

        if _queue_rows and _url_count > 0:
            _temp_dataset_dir = base / "temp" / "retraining" / str(job_id)
            _temp_dataset_dir.mkdir(parents=True, exist_ok=True)
            log.info(
                "Queue has %d URL-based image(s) — staging all %d item(s) to: %s",
                _url_count, len(_queue_rows), _temp_dataset_dir,
            )
            _dl_ok, _dl_failed = download_queue_images(
                [
                    (int(r["id"]), str(r["image_path"] or ""), str(r["verified_label"] or ""))
                    for r in _queue_rows
                ],
                _temp_dataset_dir,
            )
            log.info(
                "Queue image staging complete — staged=%d  failed=%d",
                _dl_ok, len(_dl_failed),
            )
            if _dl_failed:
                _update_job(
                    error_message=(
                        f"Warning: {len(_dl_failed)} queue image(s) could not be "
                        f"staged (IDs: {_dl_failed[:10]}). Training continues with "
                        f"remaining {_dl_ok} image(s)."
                    )
                )
            dataset_root = _temp_dataset_dir
        else:
            dataset_root = base / "backend" / "datasets" / "retraining"

        # ── dataset validation ────────────────────────────────────────────────

        validation = validate_dataset_integrity(str(dataset_root))
        if validation["errors"]:
            raise ValueError(
                "Dataset validation failed:\n" + "\n".join(validation["errors"])
            )
        if validation["warnings"]:
            warn_summary = "; ".join(validation["warnings"][:5])
            if len(validation["warnings"]) > 5:
                warn_summary += f" (+{len(validation['warnings']) - 5} more)"
            _update_job(error_message=f"Dataset warnings: {warn_summary}")

        log.info(
            "Dataset OK — total=%d valid=%d classes=%s duplicates=%d corrupted=%d",
            validation["total"], validation["valid"],
            validation["class_counts"], validation["duplicates"], validation["corrupted"],
        )

        # ── dataloaders ───────────────────────────────────────────────────────
        loaders = create_dataloaders(
            dataset_root=str(dataset_root),
            image_size=image_size,
            batch_size=batch_size,
            num_workers=num_workers,
        )

        # ── compute class weights for imbalance-aware loss ────────────────────
        _, all_labels = collect_dataset(str(dataset_root))
        raw_class_weights = compute_class_weights(all_labels)

        # ── device selection ──────────────────────────────────────────────────
        _cuda_available = torch.cuda.is_available()
        if _cuda_available:
            device = torch.device("cuda")
            _gpu_name = torch.cuda.get_device_name(0)
            _cuda_ver = torch.version.cuda or "unknown"
            log.info(
                "CUDA GPU available — device=%s  name=%s  CUDA=%s  torch=%s",
                device, _gpu_name, _cuda_ver, torch.__version__,
            )
        else:
            device = torch.device("cpu")
            log.info(
                "No CUDA GPU — using CPU  torch=%s  CUDA_available=False",
                torch.__version__,
            )
        _update_job(error_message=None)  # clear any prior dataset warning

        model = get_model(
            model_name=model_name,
            num_classes=2,
            pretrained=True,
            training_mode=training_mode,
        ).to(device)

        # CUDA OOM preflight — catch early before the training loop starts
        if device.type == "cuda":
            try:
                with torch.no_grad():
                    _dummy = torch.randn(1, 3, image_size, image_size, device=device)
                    _ = model(_dummy)
                del _dummy
                torch.cuda.empty_cache()
            except torch.cuda.OutOfMemoryError:  # type: ignore[attr-defined]
                torch.cuda.empty_cache()
                _update_job(error_message="CUDA OOM on preflight — falling back to CPU training.")
                device = torch.device("cpu")
                model = model.cpu()

        weight_tensor = torch.tensor(raw_class_weights, dtype=torch.float32, device=device)
        criterion = nn.CrossEntropyLoss(weight=weight_tensor)
        optimizer = optim.AdamW(
            filter(lambda p: p.requires_grad, model.parameters()),
            lr=lr,
            weight_decay=weight_decay,
        )
        scheduler = create_scheduler(
            optimizer,
            scheduler_name=scheduler_name,
            total_epochs=epochs,
            patience=patience,
        )
        scaler = torch.cuda.amp.GradScaler(enabled=torch.cuda.is_available())
        early_stopping = EarlyStopping(patience=patience, mode="max")

        # ── checkpoint dir ────────────────────────────────────────────────────
        ckpt_dir = base / "backend" / "models" / "checkpoints" / str(job_id)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_mgr = CheckpointManager(str(ckpt_dir))

        best_val_acc = 0.0

        # ── training loop ─────────────────────────────────────────────────────
        for epoch in range(1, epochs + 1):
            t0 = time.time()

            train_metrics = train_one_epoch(
                model, loaders["train"], criterion, optimizer, scaler, device
            )
            val_metrics = validate_one_epoch(
                model, loaders["val"], criterion, device
            )

            epoch_dur = time.time() - t0
            val_acc = float(val_metrics["accuracy"])
            val_f1  = float(val_metrics.get("f1", 0.0))
            current_lr = optimizer.param_groups[0]["lr"]

            # Log epoch
            _log_epoch(
                epoch,
                train_metrics["loss"],
                val_metrics["loss"],
                val_acc,
                val_f1,
                current_lr,
                epoch_dur,
            )

            # Update progress
            pct = round(epoch / epochs * 100, 1)
            if val_acc > best_val_acc:
                best_val_acc = val_acc
            _update_job(
                progress_epoch=epoch,
                progress_pct=pct,
                best_val_accuracy=round(best_val_acc, 6),
            )

            # Scheduler step
            if scheduler is not None:
                from torch.optim.lr_scheduler import ReduceLROnPlateau
                if isinstance(scheduler, ReduceLROnPlateau):
                    scheduler.step(val_acc)
                else:
                    scheduler.step()

            # Save checkpoint
            checkpoint_mgr.save_checkpoint(
                epoch=epoch,
                model=model,
                optimizer=optimizer,
                scheduler=scheduler,
                scaler=scaler,
                early_stopping=early_stopping,
                metrics={"val_accuracy": val_acc, "val_f1": val_f1},
                checkpoint_type="best" if val_acc >= best_val_acc else "epoch",
            )

            # Early stopping
            if early_stopping.step(val_acc):
                log.info("Early stopping triggered at epoch %d.", epoch)
                break

        log.info(
            "Training loop complete — best_val_acc=%.4f  epochs_run=%d",
            best_val_acc, epoch,
        )

        # ── evaluation ────────────────────────────────────────────────────────
        if _is_cancelled():
            return  # job was cancelled while training; DB status already set

        _update_job(status="evaluating")
        log.info("Starting final evaluation — job_id=%d", job_id)

        eval_dir = base / "backend" / "models" / "evaluation" / str(job_id)
        eval_dir.mkdir(parents=True, exist_ok=True)

        # Load best checkpoint for final evaluation
        if checkpoint_mgr.best_exists():
            checkpoint_mgr.load_best(model, str(device))

        evaluator = Evaluator(str(eval_dir))
        all_labels, all_preds, all_probs = [], [], []
        model.eval()
        with torch.inference_mode():
            for images, labels_batch in loaders["test"]:
                images = images.to(device)
                outputs = model(images)
                probs = torch.softmax(outputs, dim=1)[:, 1]
                preds = outputs.argmax(dim=1)
                all_labels.extend(labels_batch.tolist())
                all_preds.extend(preds.cpu().tolist())
                all_probs.extend(probs.cpu().tolist())

        eval_results = evaluator.evaluate(all_labels, all_preds, all_probs)

        # Persist evaluation metrics immediately — preserved even if export fails
        _update_job(
            accuracy_after=round(float(eval_results.get("accuracy", 0)), 6),
            precision_after=round(float(eval_results.get("precision", 0)), 6),
            recall_after=round(float(eval_results.get("recall", 0)), 6),
            f1_after=round(float(eval_results.get("f1", 0)), 6),
            evaluation_dir=str(eval_dir),
            checkpoint_path=str(ckpt_dir),
        )
        log.info(
            "Evaluation complete — acc=%.4f  precision=%.4f  recall=%.4f  f1=%.4f",
            eval_results.get("accuracy", 0), eval_results.get("precision", 0),
            eval_results.get("recall", 0),   eval_results.get("f1", 0),
        )

        # ── ONNX export ───────────────────────────────────────────────────────
        if _is_cancelled():
            return  # job was cancelled while evaluating

        # Pre-export dependency check — fail fast with a clear install hint
        log.info("Checking ONNX export dependencies ...")
        _export_deps = {
            "onnx":        "onnx",
            "onnxruntime": "onnxruntime",
            "onnxscript":  "onnxscript",
        }
        _export_missing = [
            pkg for mod, pkg in _export_deps.items()
            if importlib.util.find_spec(mod) is None
        ]
        if _export_missing:
            missing_str = ", ".join(_export_missing)
            raise ImportError(
                f"ONNX export dependencies missing: {missing_str}\n"
                f"Install with:  pip install {' '.join(_export_missing)}\n"
                f"Or run:  pip install -r requirements-training.txt"
            )
        log.info("Export dependency check passed — onnx, onnxruntime, onnxscript present.")

        _update_job(status="exporting")

        export_dir = base / "backend" / "models" / "exports" / str(job_id)
        export_dir.mkdir(parents=True, exist_ok=True)

        log.info(
            "Starting ONNX export — job_id=%d  model=%s  torch=%s",
            job_id, model_name, torch.__version__,
        )
        try:
            exporter = ONNXExporter(
                model=model,
                checkpoint_path=str(checkpoint_mgr.best_checkpoint_path),
                output_dir=str(export_dir),
                image_size=image_size,
            )
            onnx_path = exporter.export(model_name)
        except Exception as _export_exc:
            _export_tb = traceback.format_exc()
            log.error(
                "ONNX export FAILED — job_id=%d  error=%s\n%s",
                job_id, _export_exc, _export_tb,
            )
            _update_job(
                status="failed",
                error_message=(
                    f"ONNX export failed — training and evaluation succeeded, "
                    f"metrics and checkpoints are preserved.\n"
                    f"Error: {str(_export_exc)[:800]}"
                ),
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            return  # training metrics already persisted; ModelVersion NOT created

        log.info("ONNX export complete — path=%s", onnx_path)

        # ── create ModelVersion record ────────────────────────────────────────
        now_iso = datetime.now(timezone.utc).isoformat()
        # Compact reproducibility metadata stored in notes
        version_notes = json.dumps({
            "job_id":        job_id,
            "model_name":    model_name,
            "training_mode": training_mode,
            "epochs_trained": int(early_stopping.counter if hasattr(early_stopping, "counter") else epochs),
            "epochs_max":    epochs,
            "lr":            lr,
            "weight_decay":  weight_decay,
            "batch_size":    batch_size,
            "scheduler":     scheduler_name,
            "patience":      patience,
            "image_size":    image_size,
            "device":        str(device),
            "dataset_total": validation["total"],
            "dataset_valid": validation["valid"],
            "class_counts":  validation["class_counts"],
            "class_weights": {str(i): round(w, 4) for i, w in enumerate(raw_class_weights)},
            "duplicates":    validation["duplicates"],
            "corrupted":     validation["corrupted"],
            "exported_at":   now_iso,
        }, indent=None)
        db.execute(
            text(
                "INSERT INTO model_versions "
                "(version, model_name, created_at, accuracy, precision, recall, f1, "
                "auc_roc, dataset_size, job_id, status, file_path, evaluation_dir, "
                "training_mode, notes) "
                "VALUES (:version, :model_name, :created_at, :accuracy, :precision, "
                ":recall, :f1, :auc_roc, :dataset_size, :job_id, :status, :file_path, "
                ":evaluation_dir, :training_mode, :notes)"
            ),
            {
                "version": f"v{job_id}",
                "model_name": model_name,
                "created_at": now_iso,
                "accuracy": round(float(eval_results.get("accuracy", 0)), 6),
                "precision": round(float(eval_results.get("precision", 0)), 6),
                "recall": round(float(eval_results.get("recall", 0)), 6),
                "f1": round(float(eval_results.get("f1", 0)), 6),
                "auc_roc": round(float(eval_results.get("roc_auc", 0)), 6),
                "dataset_size": len(all_labels),
                "job_id": job_id,
                "status": "candidate",
                "file_path": onnx_path,
                "evaluation_dir": str(eval_dir),
                "training_mode": training_mode,
                "notes": version_notes,
            },
        )
        db.commit()

        # ── mark job completed ────────────────────────────────────────────────
        _update_job(
            status="completed",
            completed_at=now_iso,
            export_path=onnx_path,
            progress_pct=100.0,
        )
        log.info(
            "Job %d completed — acc=%.4f  f1=%.4f  onnx=%s",
            job_id,
            eval_results.get("accuracy", 0),
            eval_results.get("f1", 0),
            onnx_path,
        )

    except Exception:
        err = traceback.format_exc()
        log.error("Job %d FAILED:\n%s", job_id, err)
        try:
            _update_job(
                status="failed",
                error_message=err[:4000],
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as _db_err:
            log.error("Could not persist FAILED status to DB: %s", _db_err)
    finally:
        # ── temp dataset cleanup ──────────────────────────────────────────────
        if _temp_dataset_dir is not None and _temp_dataset_dir.exists():
            try:
                shutil.rmtree(str(_temp_dataset_dir))
                log.info("Cleaned up temp dataset dir: %s", _temp_dataset_dir)
            except Exception as _cleanup_err:
                log.warning(
                    "Could not remove temp dataset dir %s: %s",
                    _temp_dataset_dir, _cleanup_err,
                )
        try:
            db.close()
        except Exception:
            pass
        try:
            engine.dispose()
        except Exception:
            pass
        log.info("Worker process exiting — job_id=%d", job_id)
