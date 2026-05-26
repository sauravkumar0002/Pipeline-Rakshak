Export PDF Prompt

Goal: Implement single-inspection PDF export and frontend button to download inspection report.

Instructions for Copilot session:
- Add endpoint `GET /api/v1/inspections/{inspection_id}/report` that returns `application/pdf` using `report_gen.generate_pdf_report` for a single inspection.
- Ensure `settings.REPORT_DIRECTORY` is used and files are cleaned up or served securely.
- Frontend: add `Download PDF` button in `InspectionDetailModal` that calls the endpoint and triggers a file download.
- Provide graceful fallback (show message) if report generation fails.

Deliverables:
- Backend endpoint implementation and route addition.
- Frontend download handler and UI change.
- Manual test steps.
