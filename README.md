# AI Corrosion Detection Platform

An end-to-end platform for detecting surface corrosion in images using ONNX deep-learning models, with a FastAPI backend and React frontend.

---

## Table of Contents
1. [Architecture](#architecture)
2. [Quick Start — Local Dev](#quick-start--local-dev)
3. [Docker Deployment](#docker-deployment)
4. [Environment Variables](#environment-variables)
5. [API Reference](#api-reference)
6. [Model Management](#model-management)
7. [Running Tests](#running-tests)

---

## Architecture

```
┌─────────────┐    HTTP/REST    ┌──────────────────────────────┐
│  React/Vite │ ◄────────────► │ FastAPI (Uvicorn)             │
│  Frontend   │                │  /api/v1/inspections          │
│  :5173      │                │  /api/v1/analytics            │
└─────────────┘                │  /api/v1/models               │
                               │  /uploads (static)            │
                               └──────────────┬───────────────┘
                                              │
                              ┌───────────────▼───────────────┐
                              │  ONNXInferenceService         │
                              │  (MobileNetV2 / EfficientNet  │
                              │   / ResNet-50 ONNX models)    │
                              └──────────────┬───────────────┘
                                              │
                              ┌───────────────▼───────────────┐
                              │  SQLite (SQLAlchemy ORM)      │
                              │  corrosion_detection.db       │
                              └───────────────────────────────┘
```

**Label contract:** Class index `0 = corrosion`, class index `1 = no_corrosion` (verified in `backend/models/onnx/class_mapping.json`).

---

## Quick Start — Local Dev

### Prerequisites
- Python 3.11+
- Node.js 18+

### Backend

```bash
# From the project root
pip install -r requirements.txt

# Create upload / report directories
mkdir -p uploads reports

# Start FastAPI
uvicorn backend.app.main:app --reload
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# UI available at http://localhost:5173
```

---

## Docker Deployment

```bash
cp .env.example .env
# Edit .env as needed

docker-compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:5173
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./corrosion_detection.db` | SQLAlchemy database URL |
| `UPLOAD_DIRECTORY` | `uploads` | Directory for storing uploaded images |
| `MODEL_DIRECTORY` | `backend/models/onnx` | Directory containing `.onnx` models |
| `DEFAULT_MODEL` | `mobilenetv2_standard.onnx` | Model loaded at startup |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend → Backend URL |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/inspections/predict` | Upload image and run corrosion detection |
| `GET` | `/api/v1/inspections/history` | List past inspections (paginated + filtered) |
| `GET` | `/api/v1/inspections/history/{id}` | Get single inspection detail |
| `DELETE` | `/api/v1/inspections/history/{id}` | Delete an inspection |
| `POST` | `/api/v1/inspections/verify/{id}` | Verify / correct a prediction |
| `GET` | `/api/v1/analytics/summary` | High-level analytics summary |
| `GET` | `/api/v1/analytics/dashboard` | Dashboard KPI metrics |
| `GET` | `/api/v1/analytics/performance` | Per-model performance metrics |
| `GET` | `/api/v1/analytics/severity-distribution` | Severity counts |
| `GET` | `/api/v1/analytics/trends` | Daily inspection counts (last N days) |
| `GET` | `/api/v1/models/list` | List available models + active model |
| `POST` | `/api/v1/models/models/select` | Switch active model |
| `GET` | `/api/v1/models/models/current` | Get currently active model |
| `GET` | `/health` | Health check (includes model status) |

Full interactive docs: `http://localhost:8000/docs`

---

## Model Management

ONNX models are stored in `backend/models/onnx/`.  
Class labels are defined in `backend/models/onnx/class_mapping.json`:

```json
{
  "default": { "labels": ["corrosion", "no_corrosion"] }
}
```

To add a new model:
1. Place the `.onnx` file in `backend/models/onnx/`
2. Add an entry to `class_mapping.json`
3. Restart the backend or call `POST /api/v1/models/models/select`

---

## Running Tests

```bash
# From project root
python -m pytest tests/ -v
```

Test files:
- `tests/test_prediction_pipeline.py` — end-to-end prediction pipeline
- `tests/test_api.py` — API endpoint integration tests
- `tests/test_analytics.py` — analytics endpoint tests
