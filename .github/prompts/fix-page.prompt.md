Fix Page Prompt

Goal: Provide a reusable prompt template to fix or improve a specific frontend page (React + Vite).

Instructions for Copilot session:
- Read the target page file under `frontend/src/pages/` and any referenced components in `frontend/src/components/`.
- Run the dev server locally (`npm run dev`) and reproduce the issue in browser.
- Identify runtime errors from console and the terminal.
- Make minimal, well-scoped changes to fix the issue; add unit tests if appropriate.
- Preserve existing UI patterns and CSS variables.
- After changes: run the frontend dev server and verify the page loads without console errors.

Include in response:
- Files changed list.
- Short rationale for each change.
- A single command to test locally (e.g., `npm run dev`).
