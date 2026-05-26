Project: AI Corrosion Detection Platform

Overview
- Purpose: Server + UI for inspecting images to detect corrosion using ONNX models, store results, provide verification and analytics, and export reports.

Technology Stack
- Backend: FastAPI, Pydantic, SQLAlchemy, SQLite (default), ONNX Runtime, Pillow, ReportLab, pandas
- Frontend: React (Vite), react-router-dom, axios, recharts, react-toastify
- Dev: Uvicorn (FastAPI), Vite (frontend)

Coding Standards (repository-observed)
- Python: Pydantic models for request/response schemas in `backend/app/schemas.py` and SQLAlchemy ORM in `backend/app/models.py`.
- Backend routes grouped under `backend/app/api/endpoints/*` with routers included in `backend/app/main.py`.
- Frontend: small functional React pages in `frontend/src/pages/*`, service layer in `frontend/src/services/api.js`, axios instance in `frontend/src/api/axios.js`.
- Keep changes minimal and focused; follow existing style (no large unrelated refactors).

UI Theme Rules (observed)
- The frontend currently uses a dark theme (examples: `#1b263b`, `#162033`) with blue/yellow/red accents for status coloring.
- Components use simple card layouts and consistent spacing — follow these patterns when adding UI.

Backend Rules
- Static uploads are served from `settings.UPLOAD_DIRECTORY` and mounted at `/uploads` by `backend/app/main.py`.
- Model management is provided by a singleton `inference_service` in `backend/app/services/inference.py`.
- Database sessions are provided by dependency `get_db_session` / `get_db` in `backend/app/database.py`.
- Default model directory: `backend/models/onnx` and default DB: `corrosion_detection.db` (local SQLite).

API Rules and Response Shapes
- Schemas are authoritative and located in `backend/app/schemas.py`. Use these when implementing frontend integrations or new endpoints.
- Example schemas used: `PredictionResponse`, `InspectionResponse`, `AnalyticsSummary`, `DashboardMetrics`, `ModelSelection`.

Debugging Workflow
1. Reproduce in local dev: run backend with `uvicorn backend.app.main:app --reload` and frontend with `npm run dev` in `frontend`.
2. Check CORS origins in `backend/app/config.py` if frontend cannot reach API.
3. Inspect `uploads/` for saved images; verify static mount at `/uploads`.
4. Use API docs at `/docs` (FastAPI) to inspect endpoints and example payloads.

Current Verified Endpoints (see `API_RESPONSE_EXAMPLES.md` for details)
- GET `/api/v1/analytics/summary`
- GET `/api/v1/analytics/dashboard`
- GET `/api/v1/analytics/performance`
- GET `/api/v1/analytics/severity-distribution`
- POST `/api/v1/inspections/predict` (multipart form, field `image_file`)
- POST `/api/v1/inspections/verify/{inspection_id}`
- GET `/api/v1/inspections/history`
- GET `/api/v1/inspections/history/{inspection_id}`
- DELETE `/api/v1/inspections/history/{inspection_id}`
- GET `/api/v1/models/models`, GET `/api/v1/models/list`, POST `/api/v1/models/models/select`, GET `/api/v1/models/models/current`

Known Bugs (short)
- `VerificationPage` is a placeholder UI — verification workflow exists server-side but UI is incomplete.
- Single-inspection PDF endpoint is not implemented yet (reporting has multi-inspection PDF helpers).
- Some model weights are available in `backend/models/onnx`; the verified default inference path now loads `mobilenetv2_standard` and uses the checked-in class mapping contract in `backend/models/onnx/class_mapping.json`.

Current Priorities
- Implement single-inspection PDF endpoint and frontend download button.
- Complete Verification UI and retraining workflow UX.
- Harden frontend API error handling and input validation.

Notes
- Do not add mock endpoints in the repo; document only actual behavior found in codebase.
- If a required detail is missing in the code, mark it as unknown rather than inventing values.
