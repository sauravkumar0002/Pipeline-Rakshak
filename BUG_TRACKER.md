BUG TRACKER — AI Corrosion Detection Platform

BUG-001
- Title: InspectPage crash on models.map
- Description: `InspectPage` originally called `.map()` on a non-array returned by model list endpoints; crashed when response shape was an object.
- Status: Fixed in frontend with defensive checks (see `frontend/src/pages/InspectPage.jsx`).
- Priority: High
- Affected Files: `frontend/src/pages/InspectPage.jsx`, `frontend/src/services/api.js`

BUG-002
- Title: Verification page UI missing
- Description: Backend supports verification endpoint but frontend `VerificationPage` is a placeholder and lacks the queue and verification controls.
- Status: Open
- Priority: Medium
- Affected Files: `frontend/src/pages/VerificationPage.jsx`

BUG-003
- Title: ModelHub response parsing mismatch
- Description: Frontend had inconsistent parsing expectations for model list endpoints (`/models/models` vs `/models/list`). Normalization required.
- Status: Fixed (defensive normalization added) but monitor for inconsistent responses.
- Priority: Medium
- Affected Files: `frontend/src/pages/ModelHubPage.jsx`, `frontend/src/services/api.js`

BUG-004
- Title: Prediction label mapping inversion
- Description: Backend prediction decoding hardcoded the label order in the wrong direction and auto-loaded the first model alphabetically instead of the verified default model.
- Status: Fixed by loading `mobilenetv2_standard` on startup and resolving labels from `backend/models/onnx/class_mapping.json`.
- Priority: High
- Affected Files: `backend/app/services/inference.py`, `backend/app/api/endpoints/inspections.py`, `backend/models/onnx/class_mapping.json`

BUG-005
- Title: Single-inspection PDF endpoint missing
- Description: `report_gen.py` contains multi-inspection PDF generation; there is no endpoint to request a PDF for a single inspection or download it from the frontend.
- Status: Open
- Priority: High
- Affected Files: `backend/app/services/report_gen.py`, (new endpoint needed in `backend/app/api/endpoints/inspections.py`)

BUG-006
- Title: Frontend fragile `.map()` usage in charts
- Description: Several chart components assumed arrays — fixed by adding `Array.isArray` guards.
- Status: Fixed in chart components and analytics page.
- Priority: Low
- Affected Files: `frontend/src/components/analytics/*`, `frontend/src/pages/AnalyticsPage.jsx`

BUG-007
- Title: Navbar hardcoded active model label
- Description: The navbar displayed a static model name instead of the live backend active model.
- Status: Fixed by loading the value from `GET /api/v1/models/models/current`.
- Priority: Low
- Affected Files: `frontend/src/components/Navbar.jsx`

How to add new bugs
- Create a new entry in this file with BUG-###, provide reproduction steps, expected vs actual, and assign priority.

