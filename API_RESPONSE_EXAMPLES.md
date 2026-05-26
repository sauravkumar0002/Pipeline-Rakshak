API Response Examples — AI Corrosion Detection Platform

Notes:
- The authoritative schemas are in `backend/app/schemas.py`. The examples below were constructed from those schemas and from the endpoint implementations in `backend/app/api/endpoints`.

GET / (root)
- Purpose: Welcome message / health
- Response: { "message": "Welcome to the AI Corrosion Detection Platform" }

GET /health
- Purpose: Simple health check
- Response: { "status": "ok" }

POST /api/v1/inspections/predict
- Purpose: Upload an image and receive a prediction.
- Request: Multipart form with field `image_file` (file)
- Response (PredictionResponse):
{
  "prediction_class": "corrosion",
  "confidence": 0.9345,
  "severity": "High",
  "recommendation": "Immediate maintenance required. Asset integrity is at high risk.",
  "latency_ms": 123.45,
  "fps": 8.10,
  "model_used": "MobileNetV2_Standard"
}

POST /api/v1/inspections/verify/{inspection_id}
- Purpose: Mark an inspection as verified or corrected, optionally flag for retraining.
- Request JSON (VerificationUpdate):
{
  "is_verified": true,
  "corrected_class": "corrosion",
  "is_flagged_for_retraining": false
}
- Response: `InspectionResponse` (full inspection record saved in DB). Fields include `id`, `timestamp`, `image_path`, `prediction_class`, `confidence`, `severity`, `recommendation`, `latency_ms`, `fps`, `model_used`, `is_verified`, `corrected_class`, `is_flagged_for_retraining`, `created_at`, `updated_at`.

GET /api/v1/inspections/history
- Purpose: List inspections (supports `skip` and `limit` query params).
- Request: Query params (optional): `skip`, `limit`
- Response: Array of `InspectionResponse` objects.

GET /api/v1/inspections/history/{inspection_id}
- Purpose: Retrieve a single inspection detail by ID.
- Response: `InspectionResponse` object.

DELETE /api/v1/inspections/history/{inspection_id}
- Purpose: Delete an inspection record. Also attempts to remove stored image file if present.
- Response: 204 No Content

GET /api/v1/analytics/summary
- Purpose: High-level analytics summary.
- Response (AnalyticsSummary):
{
  "total_inspections": 123,
  "corrosion_count": 45,
  "no_corrosion_count": 78,
  "average_confidence": 0.8423,
  "unverified_count": 20,
  "verified_count": 103,
  "flagged_count": 5,
  "retraining_queue_count": 3
}

GET /api/v1/analytics/dashboard
- Purpose: Dashboard KPI metrics.
- Response (DashboardMetrics):
{
  "total_inspections": 123,
  "corrosion_detected": 45,
  "healthy_images": 78,
  "average_confidence": 0.8423,
  "average_inference_time": 0.12,
  "system_uptime": 98.76
}

GET /api/v1/analytics/performance
- Purpose: Per-model performance metrics.
- Response: Dict keyed by model name, each value:
{
  "MobileNetV2_Standard": {
    "average_latency_ms": 120.5,
    "images_processed": 50,
    "verified_inspections_count": 20,
    "accuracy_percent": 95.0
  },
  "ResNet50_Augmented": {
    "average_latency_ms": 240.1,
    "images_processed": 73,
    "verified_inspections_count": 10,
    "accuracy_percent": "N/A"
  }
}

GET /api/v1/analytics/severity-distribution
- Purpose: Distribution of severity levels for corrosion detections.
- Response:
{
  "Low": 12,
  "Medium": 20,
  "High": 13
}

GET /api/v1/models/models
- Purpose: List available model names (simple array response)
- Response: ["MobileNetV2_Standard", "ResNet50_Augmented"]

GET /api/v1/models/list
- Purpose: Return both available models and currently active model
- Response:
{
  "available_models": ["MobileNetV2_Standard", "ResNet50_Augmented"],
  "active_model": "MobileNetV2_Standard"
}

POST /api/v1/models/models/select
- Purpose: Select and load a model to be used for subsequent predictions.
- Request JSON (ModelSelection): { "model_name": "ResNet50_Augmented" }
- Response: { "message": "Successfully loaded and selected model: 'ResNet50_Augmented'" }

GET /api/v1/models/models/current
- Purpose: Return currently active model.
- Response: { "active_model": "MobileNetV2_Standard" }


Important: The frontend `apiClient` baseURL is set to `http://localhost:8000/api` and frontend service code appends `/v1/...` paths (resulting in `http://localhost:8000/api/v1/...`). Use the schemas in `backend/app/schemas.py` for precise field types and validation.
