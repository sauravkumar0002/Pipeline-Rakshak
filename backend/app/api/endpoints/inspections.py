# backend/app/api/endpoints/inspections.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import time
import io
import json
import shutil
import logging
from PIL import Image
import numpy as np

from backend.app import schemas, models
from backend.app.api import deps
from backend.app.services.inference import inference_service
from backend.app.services.storage import storage_service
from backend.app.config import settings

router = APIRouter()
log = logging.getLogger(__name__)

RETRAINING_DATASET_DIR = os.path.join("backend", "datasets", "retraining")

# Helper functions for severity and recommendation, as they are business logic
# that can be decoupled from the core inference service.
def calculate_severity(confidence: float) -> str:
    """Calculates the severity level based on prediction confidence."""
    if confidence >= 0.90:
        return "High"
    elif confidence >= 0.75:
        return "Medium"
    elif confidence >= 0.50:
        return "Low"
    else:
        return "Minimal"

def generate_recommendation(prediction_class: str, severity: str) -> str:
    """Generates a maintenance recommendation based on the prediction and severity."""
    if prediction_class == "corrosion":
        if severity == "High":
            return "Immediate maintenance required. Asset integrity is at high risk."
        elif severity == "Medium":
            return "Schedule detailed inspection and potential maintenance within 7-14 days."
        else:  # Low or Minimal
            return "Monitor condition during the next routine maintenance cycle."
    else:  # No Corrosion
        return "No immediate action required. Continue with standard monitoring."


def decode_prediction_result(prediction_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Decodes the raw inference output into the persisted API response contract.
    """
    raw_prediction = np.asarray(prediction_result.get("prediction", []), dtype=np.float32)
    if raw_prediction.size == 0:
        raise HTTPException(status_code=500, detail="Prediction failed: Model output was empty or invalid.")

    if raw_prediction.ndim > 1:
        raw_prediction = raw_prediction[0]

    probabilities = prediction_result.get("probabilities")
    if probabilities is None:
        logits = raw_prediction - np.max(raw_prediction)
        exp_logits = np.exp(logits)
        probabilities = (exp_logits / np.sum(exp_logits)).tolist()

    probabilities_array = np.asarray(probabilities, dtype=np.float32)
    predicted_index = int(prediction_result.get("predicted_index", int(np.argmax(probabilities_array))))
    class_names = inference_service.get_class_names() or ["corrosion", "no_corrosion"]
    predicted_class = prediction_result.get("predicted_class") or (
        class_names[predicted_index] if predicted_index < len(class_names) else f"class_{predicted_index}"
    )
    confidence = float(probabilities_array[predicted_index])
    severity = calculate_severity(confidence) if predicted_class == "corrosion" else "None"
    recommendation = generate_recommendation(predicted_class, severity)

    return {
        "raw_prediction": raw_prediction,
        "probabilities": probabilities_array,
        "predicted_index": predicted_index,
        "prediction_class": predicted_class,
        "confidence": confidence,
        "severity": severity,
        "recommendation": recommendation,
    }

@router.post("/predict", response_model=schemas.PredictionResponse, tags=["Corrosion Detection"])
async def predict_corrosion(
    *,
    db: Session = Depends(deps.get_db_session),
    image_file: UploadFile = File(...)
):
    """
    Perform corrosion detection on an uploaded image.

    This endpoint accepts an image file, runs it through the active ONNX model,
    and returns a detailed analysis including the prediction, confidence, severity,
    and a maintenance recommendation.
    """
    if not inference_service.get_active_model():
        raise HTTPException(
            status_code=503, 
            detail="No model is loaded. Please select a model via the /api/v1/models/select endpoint first."
        )

    try:
        # Read image content from the uploaded file
        contents = await image_file.read()
        pil_image = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file. Could not open image.")

    # Start timer for latency calculation
    start_time = time.perf_counter()

    # Perform inference using the service
    prediction_result = inference_service.predict(pil_image)

    # End timer
    end_time = time.perf_counter()
    latency_ms = (end_time - start_time) * 1000

    if "error" in prediction_result:
        raise HTTPException(status_code=500, detail=prediction_result["error"])

    decoded_result = decode_prediction_result(prediction_result)
    prediction_class = decoded_result["prediction_class"]
    confidence = decoded_result["confidence"]
    severity = decoded_result["severity"]
    recommendation = decoded_result["recommendation"]
    fps = 1000 / latency_ms if latency_ms > 0 else float('inf')

    # Construct the response
    response_data = {
        "prediction_class": prediction_class,
        "confidence": confidence,
        "severity": severity,
        "recommendation": recommendation,
        "latency_ms": latency_ms,
        "fps": fps,
        "model_used": inference_service.get_active_model()
    }

    # --- Database Interaction ---
    try:
        original_name = image_file.filename or ""
        file_ext = os.path.splitext(original_name)[1] or ".jpg"
        safe_name = f"inspection_{int(time.time() * 1000)}{file_ext}"
        content_type = image_file.content_type or "image/jpeg"

        # Upload via storage service (local disk or Supabase Storage)
        image_path = storage_service.upload(
            "inspection-images", safe_name, contents, content_type
        )

        db_inspection = models.Inspection(
            image_path=image_path,
            prediction_class=prediction_class,
            confidence=confidence,
            severity=severity,
            recommendation=recommendation,
            latency_ms=latency_ms,
            fps=fps,
            model_used=inference_service.get_active_model() or "Unknown"
        )
        db.add(db_inspection)
        db.commit()
        db.refresh(db_inspection)
        log.info("Saved inspection %s to database.", db_inspection.id)
    except Exception as db_error:
        log.error("Failed to save inspection to database.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save inspection: {db_error}")

    return response_data


@router.post("/verify/{inspection_id}", response_model=schemas.InspectionResponse, tags=["Inspection History"])
def verify_inspection(
    *,
    db: Session = Depends(deps.get_db_session),
    inspection_id: int,
    verification_data: schemas.VerificationUpdate
):
    """
    Manually verify or correct an inspection result.
    - Confirm prediction by setting corrected_class equal to prediction_class.
    - Correct prediction with a new corrected_class.
    - Flag the image for retraining to add it to the retraining dataset.
    """
    try:
        db_inspection = db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()
        if not db_inspection:
            raise HTTPException(status_code=404, detail="Inspection not found.")

        inspection_record: Any = db_inspection

        inspection_record.is_verified = verification_data.is_verified
        inspection_record.corrected_class = verification_data.corrected_class
        inspection_record.is_flagged_for_retraining = verification_data.is_flagged_for_retraining

        db.commit()
        db.refresh(inspection_record)

        # If flagged, copy the image and save metadata for retraining.
        if inspection_record.is_flagged_for_retraining:
            _src = inspection_record.image_path or ""
            if not _src:
                raise HTTPException(status_code=404, detail="Source image not found for retraining dataset export.")

            os.makedirs(RETRAINING_DATASET_DIR, exist_ok=True)
            # For Supabase URLs, strip query params before extracting the extension.
            from urllib.parse import urlparse as _urlparse
            _url_path = _urlparse(_src).path if _src.startswith(("http://", "https://")) else _src
            base_name, ext = os.path.splitext(os.path.basename(_url_path))
            retrain_image_name = f"inspection_{inspection_id}{ext or '.jpg'}"
            retrain_image_path = os.path.join(RETRAINING_DATASET_DIR, retrain_image_name)
            retrain_label_path = os.path.join(RETRAINING_DATASET_DIR, f"inspection_{inspection_id}.txt")
            retrain_meta_path = os.path.join(RETRAINING_DATASET_DIR, f"inspection_{inspection_id}.json")

            if _src.startswith(("http://", "https://")):
                import urllib.request
                try:
                    with urllib.request.urlopen(_src, timeout=30) as _resp:
                        _image_data = _resp.read()
                    with open(retrain_image_path, "wb") as _out:
                        _out.write(_image_data)
                except Exception as dl_err:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to download source image for retraining: {dl_err}"
                    )
            elif os.path.exists(_src):
                shutil.copy2(_src, retrain_image_path)
            else:
                raise HTTPException(status_code=404, detail="Source image not found for retraining dataset export.")
            with open(retrain_label_path, "w", encoding="utf-8") as label_file:
                label_file.write(inspection_record.corrected_class or "")

            metadata = {
                "inspection_id": inspection_record.id,
                "source_image_path": _src,
                "retraining_image": retrain_image_name,
                "corrected_class": inspection_record.corrected_class,
                "is_verified": inspection_record.is_verified,
                "is_flagged_for_retraining": inspection_record.is_flagged_for_retraining,
                "prediction_class": inspection_record.prediction_class,
                "confidence": inspection_record.confidence,
                "severity": inspection_record.severity,
                "recommendation": inspection_record.recommendation,
                "model_used": inspection_record.model_used,
                "latency_ms": inspection_record.latency_ms,
                "fps": inspection_record.fps
            }
            with open(retrain_meta_path, "w", encoding="utf-8") as meta_file:
                json.dump(metadata, meta_file, indent=2)

            log.info(
                "Inspection %s exported to retraining dataset: %s",
                inspection_id,
                RETRAINING_DATASET_DIR
            )

        return db_inspection
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Verification failed for inspection %s.", inspection_id, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}")


@router.get("/history", response_model=List[schemas.InspectionResponse], tags=["Inspection History"])
def get_inspection_history(
    db: Session = Depends(deps.get_db_session),
    skip: int = 0,
    limit: int = 100,
    is_verified: Optional[bool] = None,
):
    """
    Retrieve a list of all past inspections.
    Supports pagination via `skip` and `limit` query parameters.
    Pass `is_verified=false` to return only the unverified review queue.
    Pass `is_verified=true` to return only verified inspections.
    Omit to return all inspections.
    """
    q = db.query(models.Inspection)
    if is_verified is not None:
        q = q.filter(models.Inspection.is_verified == is_verified)
    return q.order_by(models.Inspection.timestamp.desc()).offset(skip).limit(limit).all()


@router.get("/history/{inspection_id}", response_model=schemas.InspectionResponse, tags=["Inspection History"])
def get_inspection_detail(
    *,
    db: Session = Depends(deps.get_db_session),
    inspection_id: int
):
    """
    Retrieve detailed information for a single inspection by its ID.
    """
    db_inspection = db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()
    if not db_inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")
    return db_inspection


@router.delete("/history/{inspection_id}", status_code=204, tags=["Inspection History"])
def delete_inspection(
    *,
    db: Session = Depends(deps.get_db_session),
    inspection_id: int
):
    """
    Delete an inspection record from the database.
    """
    db_inspection = db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()
    if not db_inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")

    # Delete stored image — handles both Supabase URLs and local paths
    inspection_record: Any = db_inspection
    _img = inspection_record.image_path or ""
    if _img:
        if _img.startswith(("http://", "https://")):
            # Extract object_path from public URL: .../inspection-images/<object_path>
            import re as _re
            _m = _re.search(r"/inspection-images/(.+)$", _img)
            if _m:
                storage_service.delete("inspection-images", _m.group(1))
        elif os.path.exists(_img):
            try:
                os.remove(_img)
            except OSError as e:
                print(f"Error deleting image file {_img}: {e}")

    db.delete(db_inspection)
    db.commit()
    # A 204 response should not have a body.
    return None

