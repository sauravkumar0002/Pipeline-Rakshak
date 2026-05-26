Build Analytics Prompt

Goal: Improve analytics charts, robustness, and add export options.

Instructions for Copilot session:
- Use endpoints: `/api/v1/analytics/summary`, `/dashboard`, `/performance`, `/severity-distribution`.
- Normalize responses and guard against non-array shapes.
- Add interactive chart features: tooltips, legend, filter by date range.
- Add CSV export option using `report_gen` or by transforming fetched data client-side.

Deliverables:
- Updated `AnalyticsPage.jsx` and chart components.
- Brief test instructions.
