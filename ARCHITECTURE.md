ARCHITECTURE — AI Corrosion Detection Platform

High-level overview
- Purpose: Image-based corrosion detection using ONNX models with a FastAPI backend and a React frontend. Data persisted to SQLite. Reports generated via ReportLab.

Frontend Structure
- `frontend/src/`
  - `pages/` — top-level views: `DashboardPage`, `InspectPage`, `HistoryPage`, `ModelHubPage`, `AnalyticsPage`, `VerificationPage`, `SettingsPage`.
  - `components/` — reusable UI components (Sidebar, Navbar, PageHeader, dashboard widgets, charts, history components).
  - `services/api.js` — service-layer wrappers around axios for API calls.
  - `api/axios.js` — axios instance with baseURL `http://localhost:8000/api`.

Backend Structure
- `backend/app/`
  - `main.py` — FastAPI app, CORS, static `uploads` mounting, router includes.
  - `api/endpoints/` — REST endpoints: `inspections.py`, `analytics.py`, `model_mgmt.py`.
  - `models.py` — SQLAlchemy ORM for `Inspection` table.
  - `schemas.py` — Pydantic schemas used for request/response validation.
  - `services/` — `inference.py` (ONNX service singleton), `report_gen.py` (CSV/PDF generation helpers).
  - `database.py` — SQLAlchemy engine and `SessionLocal`.
  - `config.py` — settings (UPLOAD_DIRECTORY, MODEL_DIRECTORY, ALLOWED_ORIGINS, DEFAULT_MODEL).

Database Structure
- SQLite database file: `corrosion_detection.db` (default)
- Table `inspections` (model fields in `backend/app/models.py`):
  - `id`, `timestamp`, `image_path`, `prediction_class`, `confidence`, `severity`, `recommendation`, `model_used`, `latency_ms`, `fps`, `is_verified`, `corrected_class`, `is_flagged_for_retraining`, `created_at`, `updated_at`.

Flows

1) Image Upload & Prediction Flow
- Frontend `InspectPage` collects an image file and optional model selection.
- POST `/api/v1/inspections/predict` receives multipart `image_file`.
- `inference_service.predict()` runs ONNX inference, returns raw outputs.
- Backend converts raw model outputs to `prediction_class`, `confidence`, `severity`, `recommendation`, stores a record in `inspections` table and saves the image under `uploads/`.
- Frontend displays `PredictionResponse` (prediction_class, confidence, severity, recommendation, latency_ms, fps, model_used).

2) Verification Flow
- User (future UI) calls `POST /api/v1/inspections/verify/{id}` with `VerificationUpdate` payload to mark corrections and flag for retraining.
- Backend updates the DB record and optionally copies image and metadata to `backend/datasets/retraining`.

3) Analytics Flow
- Frontend fetches `/api/v1/analytics/summary`, `/dashboard`, `/performance`, `/severity-distribution` to populate dashboard and charts.
- Backend aggregates values from `inspections` using SQLAlchemy/SQL functions.

4) Model Management Flow
- `inference_service` scans `backend/models/onnx` for `.onnx` files on startup.
- API endpoints under `/api/v1/models/*` list available models and allow selecting/loading models at runtime.
- The startup model now prefers `settings.DEFAULT_MODEL` when it matches an available ONNX file; the verified class-order contract lives in `backend/models/onnx/class_mapping.json`.

5) Reporting Flow
- `backend/app/services/report_gen.py` can generate CSV and multi-inspection PDFs from arrays of inspection records.
- Single-inspection PDF endpoint is not implemented (TODO).

Mermaid: Simplified flow diagram
```mermaid
flowchart LR
  A[Frontend (React)] -->|POST image_file| B[FastAPI /predict]
  B --> C[ONNXInferenceService]
  C --> B
  B --> D[Save image -> uploads/]
  B --> E[Database: inspections]
  A -->|GET| F[/api/v1/analytics/*]
  F --> E
  A -->|GET/POST| G[/api/v1/models/*]
  G --> C
```

Notes & Constraints
- ONNX models are executed via CPU by default (onnxruntime InferenceSession created without explicit providers). GPU providers can be added in `inference.py` if available.
- The system assumes binary classification output compatible with the post-processing in `inspections.decode_prediction_result()` (logits -> stable softmax -> two-class mapping `[corrosion, no_corrosion]`). If models differ, post-processing must be adapted.

