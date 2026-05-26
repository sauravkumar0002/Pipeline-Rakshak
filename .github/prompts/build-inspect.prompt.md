Build Inspect Page Prompt

Goal: Create or improve the `InspectPage` flow for uploading images and calling `/api/v1/inspections/predict`.

Instructions for Copilot session:
- Ensure the frontend uses the `predictCorrosion` service in `frontend/src/services/api.js`.
- Validate the multipart field is `image_file` and the axios client sends `multipart/form-data`.
- Ensure model selection uses the normalized model list from `/api/v1/models/list` or `/api/v1/models/models`.
- Provide clear user feedback during upload, prediction, and errors.
- Add a download button to export PDF once the backend single-inspection PDF endpoint exists (or stub the UI waiting for that endpoint).

Deliverables:
- Updated `InspectPage.jsx` (if needed) and any helper components.
- Manual test steps.
