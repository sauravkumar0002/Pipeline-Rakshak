"""
Analytics endpoint tests for the AI Corrosion Detection Platform.

Run with:  python -m pytest tests/test_analytics.py -v
"""

import sys
import types
import unittest
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

# ── Stub heavy optional dependencies before importing backend ────────────────
for _mod_name in ("onnxruntime", "onnxruntime.capi"):
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = types.ModuleType(_mod_name)

# Must import the module explicitly so the singleton can be replaced.
import backend.app.services.inference as _inference_mod  # noqa: E402

_mock_service = MagicMock()
_mock_service.get_active_model.return_value = "mobilenetv2_standard"
_mock_service.list_available_models.return_value = ["mobilenetv2_standard"]

_inference_mod.inference_service = _mock_service  # replace singleton before app import

from backend.app.main import app  # noqa: E402


class TestAnalyticsEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    # ── /summary ──────────────────────────────────────────────

    def test_summary_returns_200(self):
        resp = self.client.get("/api/v1/analytics/summary")
        self.assertEqual(resp.status_code, 200)

    def test_summary_has_required_fields(self):
        resp = self.client.get("/api/v1/analytics/summary")
        if resp.status_code != 200:
            self.skipTest("DB not available in this test environment.")
        data = resp.json()
        expected_keys = [
            "total_inspections", "corrosion_count", "no_corrosion_count",
            "average_confidence", "unverified_count", "verified_count",
            "flagged_count", "retraining_queue_count",
        ]
        for key in expected_keys:
            self.assertIn(key, data, f"Missing key: {key}")

    def test_summary_counts_are_non_negative(self):
        resp = self.client.get("/api/v1/analytics/summary")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        data = resp.json()
        for key in ["total_inspections", "corrosion_count", "no_corrosion_count"]:
            self.assertGreaterEqual(data[key], 0)

    def test_summary_confidence_in_range(self):
        resp = self.client.get("/api/v1/analytics/summary")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        conf = resp.json()["average_confidence"]
        self.assertGreaterEqual(conf, 0.0)
        self.assertLessEqual(conf, 1.0)

    # ── /dashboard ────────────────────────────────────────────

    def test_dashboard_returns_200(self):
        resp = self.client.get("/api/v1/analytics/dashboard")
        self.assertEqual(resp.status_code, 200)

    def test_dashboard_has_required_fields(self):
        resp = self.client.get("/api/v1/analytics/dashboard")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        data = resp.json()
        for key in ["total_inspections", "corrosion_detected", "healthy_images",
                    "average_confidence", "average_inference_time", "system_uptime"]:
            self.assertIn(key, data)

    # ── /performance ──────────────────────────────────────────

    def test_performance_returns_200(self):
        resp = self.client.get("/api/v1/analytics/performance")
        self.assertEqual(resp.status_code, 200)

    def test_performance_is_dict(self):
        resp = self.client.get("/api/v1/analytics/performance")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        self.assertIsInstance(resp.json(), dict)

    def test_performance_model_stats_structure(self):
        resp = self.client.get("/api/v1/analytics/performance")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        data = resp.json()
        for model_name, stats in data.items():
            self.assertIn("average_latency_ms", stats)
            self.assertIn("images_processed", stats)
            self.assertIn("verified_inspections_count", stats)
            self.assertIn("accuracy_percent", stats)

    # ── /severity-distribution ────────────────────────────────

    def test_severity_distribution_returns_200(self):
        resp = self.client.get("/api/v1/analytics/severity-distribution")
        self.assertEqual(resp.status_code, 200)

    def test_severity_distribution_has_all_levels(self):
        resp = self.client.get("/api/v1/analytics/severity-distribution")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        data = resp.json()
        for level in ["Minimal", "Low", "Medium", "High"]:
            self.assertIn(level, data, f"Missing severity level: {level}")
            self.assertGreaterEqual(data[level], 0)

    # ── /trends ───────────────────────────────────────────────

    def test_trends_returns_200(self):
        resp = self.client.get("/api/v1/analytics/trends")
        self.assertEqual(resp.status_code, 200)

    def test_trends_is_list(self):
        resp = self.client.get("/api/v1/analytics/trends")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        self.assertIsInstance(resp.json(), list)

    def test_trends_row_structure(self):
        resp = self.client.get("/api/v1/analytics/trends?days=7")
        if resp.status_code != 200:
            self.skipTest("DB not available.")
        for row in resp.json():
            self.assertIn("date", row)
            self.assertIn("total", row)
            self.assertIn("corrosion", row)
            self.assertIn("no_corrosion", row)
            self.assertGreaterEqual(row["total"], 0)

    def test_trends_days_clamped(self):
        # Should not blow up with extreme values
        resp = self.client.get("/api/v1/analytics/trends?days=9999")
        self.assertIn(resp.status_code, (200,))

    def test_trends_days_minimum(self):
        resp = self.client.get("/api/v1/analytics/trends?days=0")
        self.assertIn(resp.status_code, (200,))


if __name__ == "__main__":
    unittest.main()
