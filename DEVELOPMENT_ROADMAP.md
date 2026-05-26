DEVELOPMENT ROADMAP — AI Corrosion Detection Platform

Phase 1 — Stabilize Core Features (High Priority)
- Implement single-inspection PDF endpoint and frontend download button. (Backend: wrapper in `report_gen.py` + new endpoint in `inspections.py`.)
- Complete Verification UI to call `POST /api/v1/inspections/verify/{id}`.
- Add robust error handling in frontend service calls and UI notifications.

Phase 2 — UX and Instrumentation (Medium Priority)
- Improve dashboard visuals and add chart interactivity.
- Centralize theme variables and CSS to unify the dark theme.
- Add logging enhancements and request/response metrics in backend.

Phase 3 — Model Management & Retraining (Medium Priority)
- Improve model metadata handling (store expected input shape and labels in model metadata).
- Implement retraining dataset exporter automation and a scheduler or manual retrain trigger.

Phase 4 — CI, Tests, and Deployment (Medium/High Priority)
- Add tests for backend endpoints (pytest + test DB), and integration tests for inference flow.
- Add frontend unit tests (Jest/React Testing Library) for critical components (Inspect flow, History modal).
- Prepare Dockerfiles for backend and frontend and a Compose file for local development.

Phase 5 — Production Hardening (High Priority)
- Secure static file serving and storage (S3 or other object store for production), move SQLite -> Postgres.
- Add authentication/authorization around verification and model selection endpoints.
- Add monitoring and alerting (Prometheus/Grafana or other SaaS).

Phase 6 — Scale & Features (Lower Priority)
- Add multi-class corrosion severity segmentation and bounding boxes (if models provide localization).
- Build full retraining pipeline and model versioning with metadata tracking.

Estimated Completion Percentage (current): ~60% (core prediction path is now aligned and regression-tested; verification UI and reporting are still missing)

