Build Model Management Prompt

Goal: Harden model management UI and backend interactions.

Instructions for Copilot session:
- Use `/api/v1/models/list` and `/api/v1/models/models/current` to populate available and active model.
- Ensure `selectModel` correctly posts to `/api/v1/models/models/select` with `{ model_name }` payload.
- Add confirmation / toast notifications when model switch succeeds or fails.
- Show model metadata (if available) such as input shape and labels — only if the backend exposes them.

Deliverables:
- Improved `ModelHubPage.jsx` with robust error handling and notifications.
