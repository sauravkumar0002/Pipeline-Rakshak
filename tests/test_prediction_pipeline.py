import unittest
from pathlib import Path

from PIL import Image

from backend.app.api.endpoints.inspections import decode_prediction_result
from backend.app.services.inference import inference_service


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CORRODED_IMAGE = PROJECT_ROOT / "uploads" / "inspection_1779612485381.png"
CLEAN_IMAGE = PROJECT_ROOT / "uploads" / "inspection_1779613146593.jpg"


class PredictionPipelineTests(unittest.TestCase):
    def _assert_prediction(
        self,
        image_path: Path,
        expected_label: str,
        expected_severity_value: str,
        expected_recommendation: str,
    ):
        self.assertTrue(image_path.exists(), f"Missing validation image: {image_path}")

        raw_result = inference_service.predict(Image.open(image_path))
        result = decode_prediction_result(raw_result)

        self.assertEqual(raw_result["status"], "success")
        self.assertEqual(raw_result["model_used"], "mobilenetv2_standard")
        self.assertEqual(result["prediction_class"], expected_label)
        self.assertEqual(len(raw_result["prediction"]), 2)
        self.assertEqual(len(raw_result["probabilities"]), 2)
        self.assertAlmostEqual(sum(raw_result["probabilities"]), 1.0, places=5)

        predicted_index = result["predicted_index"]
        confidence = float(result["probabilities"][predicted_index])
        self.assertGreaterEqual(confidence, 0.0)
        self.assertLessEqual(confidence, 1.0)

        self.assertEqual(result["severity"], expected_severity_value)
        self.assertEqual(result["recommendation"], expected_recommendation)

    def test_corroded_pipeline_image(self):
        self._assert_prediction(
            CORRODED_IMAGE,
            "corrosion",
            "Medium",
            "Schedule detailed inspection and potential maintenance within 7-14 days.",
        )

    def test_clean_pipeline_image(self):
        self._assert_prediction(
            CLEAN_IMAGE,
            "no_corrosion",
            "None",
            "No immediate action required. Continue with standard monitoring.",
        )


if __name__ == "__main__":
    unittest.main()
