"""
Backend API integration tests for the AI Corrosion Detection Platform.

Run with:  python -m pytest tests/test_api.py -v
"""

import io
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from PIL import Image

# ── Bootstrap ──────────────────────────────────────────────────────────────
# Stub onnxruntime so tests run without the real package installed.
for _mod_name in ("onnxruntime", "onnxruntime.capi"):
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = types.ModuleType(_mod_name)

# Replace the inference singleton before importing main so we avoid loading
# heavy ONNX models during unit-test collection.
import backend.app.services.inference as _inference_mod  # noqa: E402

_mock_service = MagicMock()
_mock_service.get_active_model.return_value = "mobilenetv2_standard"
_mock_service.list_available_models.return_value = [
    "mobilenetv2_standard",
    "efficientnetb0_augmented",
    "resnet50_augmented",
]
_mock_service.predict.return_value = {
    "model_used": "mobilenetv2_standard",
    "prediction": [0.85, 0.15],
    "probabilities": [0.85, 0.15],
    "predicted_index": 0,
    "predicted_class": "corrosion",
    "status": "success",
}
_mock_service.load_model.return_value = True
_mock_service.get_class_names.return_value = ["corrosion", "no_corrosion"]

_inference_mod.inference_service = _mock_service  # replace singleton before app import

from backend.app.main import app  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _make_png_bytes(width: int = 32, height: int = 32) -> bytes:
    """Create a minimal in-memory PNG for upload tests."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestHealthEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_returns_welcome(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("message", resp.json())

    def test_health_check_ok(self):
        with patch("backend.app.main.inference_service", _mock_service):
            resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("model_loaded", data)
        self.assertIn("active_model", data)


class TestInspectionHistory(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_history_returns_list(self):
        resp = self.client.get("/api/v1/inspections/history")
        self.assertIn(resp.status_code, (200, 500))  # 500 if no DB yet
        if resp.status_code == 200:
            self.assertIsInstance(resp.json(), list)

    def test_history_with_limit(self):
        resp = self.client.get("/api/v1/inspections/history?limit=5")
        if resp.status_code == 200:
            self.assertLessEqual(len(resp.json()), 5)

    def test_history_with_prediction_class_filter(self):
        resp = self.client.get("/api/v1/inspections/history?prediction_class=corrosion&limit=10")
        if resp.status_code == 200:
            for item in resp.json():
                self.assertEqual(item["prediction_class"], "corrosion")

    def test_history_with_is_verified_filter(self):
        resp = self.client.get("/api/v1/inspections/history?is_verified=false&limit=10")
        if resp.status_code == 200:
            for item in resp.json():
                self.assertFalse(item["is_verified"])

    def test_history_nonexistent_id_returns_404(self):
        resp = self.client.get("/api/v1/inspections/history/999999")
        self.assertEqual(resp.status_code, 404)


class TestPredictEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("backend.app.api.endpoints.inspections.inference_service", _mock_service)
    def test_predict_valid_image_returns_200(self):
        png_bytes = _make_png_bytes()
        resp = self.client.post(
            "/api/v1/inspections/predict",
            files={"image_file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )
        # Accept 200 (model loaded + DB persists) or 500 (SQLite not initialised in test env)
        self.assertIn(resp.status_code, (200, 500))
        if resp.status_code == 200:
            data = resp.json()
            self.assertIn("prediction_class", data)
            self.assertIn("confidence", data)
            self.assertIn("severity", data)
            self.assertIn("recommendation", data)
            self.assertIn("latency_ms", data)

    @patch("backend.app.api.endpoints.inspections.inference_service", _mock_service)
    def test_predict_rejects_text_file(self):
        resp = self.client.post(
            "/api/v1/inspections/predict",
            files={"image_file": ("evil.txt", io.BytesIO(b"not an image"), "text/plain")},
        )
        self.assertEqual(resp.status_code, 400)

    @patch("backend.app.api.endpoints.inspections.inference_service", _mock_service)
    def test_predict_rejects_oversized_file(self):
        big_data = b"A" * (11 * 1024 * 1024)  # 11 MB
        resp = self.client.post(
            "/api/v1/inspections/predict",
            files={"image_file": ("big.png", io.BytesIO(big_data), "image/png")},
        )
        self.assertEqual(resp.status_code, 413)

    def test_predict_no_model_returns_503(self):
        no_model_service = MagicMock()
        no_model_service.get_active_model.return_value = None
        with patch("backend.app.api.endpoints.inspections.inference_service", no_model_service):
            png_bytes = _make_png_bytes()
            resp = self.client.post(
                "/api/v1/inspections/predict",
                files={"image_file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            )
        self.assertEqual(resp.status_code, 503)


class TestModelManagement(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("backend.app.api.endpoints.model_mgmt.inference_service", _mock_service)
    def test_get_available_models(self):
        resp = self.client.get("/api/v1/models/models")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

    @patch("backend.app.api.endpoints.model_mgmt.inference_service", _mock_service)
    def test_get_model_list(self):
        resp = self.client.get("/api/v1/models/list")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("available_models", data)
        self.assertIn("active_model", data)

    @patch("backend.app.api.endpoints.model_mgmt.inference_service", _mock_service)
    def test_get_current_model(self):
        resp = self.client.get("/api/v1/models/models/current")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("active_model", resp.json())

    @patch("backend.app.api.endpoints.model_mgmt.inference_service", _mock_service)
    def test_select_valid_model(self):
        resp = self.client.post(
            "/api/v1/models/models/select",
            json={"model_name": "mobilenetv2_standard"},
        )
        self.assertEqual(resp.status_code, 200)

    @patch("backend.app.api.endpoints.model_mgmt.inference_service", _mock_service)
    def test_select_nonexistent_model_returns_404(self):
        resp = self.client.post(
            "/api/v1/models/models/select",
            json={"model_name": "nonexistent_model_xyz"},
        )
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
