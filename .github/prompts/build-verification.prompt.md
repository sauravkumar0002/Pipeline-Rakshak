Build Verification Page Prompt

Goal: Implement a verification queue UI for `VerificationPage` that allows human reviewers to confirm/correct predictions and flag images for retraining.

Instructions for Copilot session:
- Use `GET /api/v1/inspections/history` to populate a review list (filter unverified entries).
- For each item, show image preview (served from `/uploads/...`) and prediction metadata.
- Provide controls to mark `is_verified`, enter `corrected_class`, and toggle `is_flagged_for_retraining`.
- Submit updates to `POST /api/v1/inspections/verify/{inspection_id}` using `VerificationUpdate` schema.
- After verification, refresh the list and optionally export flagged items to retraining dataset (backend handles export on verify).

Deliverables:
- `VerificationQueue` component and update to `VerificationPage.jsx`.
- Tests or manual test steps.
