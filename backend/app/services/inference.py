
import json
import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import onnxruntime as ort
import numpy as np
from PIL import Image, ImageOps

from backend.app.config import settings

# Assuming the logger utility is in backend.app.utils.logger
# This will be adjusted if the structure is different.
# For now, using standard logging.
log = logging.getLogger(__name__)

class ONNXInferenceService:
    """
    A service class for handling ONNX model inference.
    This class is responsible for scanning, loading, and managing ONNX models,
    as well as running inference on them.
    """

    def __init__(self, model_dir: str = "backend/models/onnx"):
        """
        Initializes the ONNXInferenceService.

        Args:
            model_dir (str): The directory where ONNX models are stored.
        """
        self.model_dir = model_dir
        self.available_models: Dict[str, str] = {}
        self.active_model_name: Optional[str] = None
        self.inference_session: Optional[ort.InferenceSession] = None
        self.class_names: List[str] = []
        
        log.info(f"Initializing ONNXInferenceService. Model directory: {self.model_dir}")
        self.scan_for_models()

    def _normalize_model_name(self, model_name: str) -> str:
        """
        Normalizes a model name to a lowercase stem so model selection is case-insensitive.
        """
        return os.path.splitext(os.path.basename(model_name))[0].strip().lower()

    def _softmax(self, values: np.ndarray) -> np.ndarray:
        """
        Computes a numerically stable softmax over a 1D tensor.
        """
        shifted = values - np.max(values)
        exponentials = np.exp(shifted)
        denominator = np.sum(exponentials)
        if denominator == 0:
            return np.zeros_like(values)
        return exponentials / denominator

    def _is_probability_vector(self, values: np.ndarray) -> bool:
        """
        Returns True when the model output already looks like probabilities.
        """
        if values.ndim != 1:
            return False
        if not np.all(np.isfinite(values)):
            return False
        if np.any(values < -1e-6) or np.any(values > 1.0 + 1e-6):
            return False
        return np.isclose(np.sum(values), 1.0, atol=1e-3)

    def _load_class_mapping_file(self) -> Dict[str, Any]:
        """
        Loads the optional class mapping file from the model directory.
        """
        mapping_path = Path(self.model_dir) / "class_mapping.json"
        if not mapping_path.exists():
            return {}

        try:
            with mapping_path.open("r", encoding="utf-8") as mapping_file:
                mapping_data = json.load(mapping_file)
                if isinstance(mapping_data, dict):
                    return mapping_data
        except Exception as exc:
            log.warning("Failed to load class mapping file %s: %s", mapping_path, exc)

        return {}

    def _extract_labels(self, mapping_entry: Any) -> List[str]:
        """
        Normalizes a mapping entry into a list of class labels.
        """
        if isinstance(mapping_entry, dict):
            candidate_labels = mapping_entry.get("labels") or mapping_entry.get("class_names")
            if isinstance(candidate_labels, list):
                labels = [str(label) for label in candidate_labels if str(label).strip()]
                if labels:
                    return labels
        elif isinstance(mapping_entry, list):
            labels = [str(label) for label in mapping_entry if str(label).strip()]
            if labels:
                return labels

        return []

    def _resolve_class_names(self, model_name: str) -> List[str]:
        """
        Resolves class labels from model metadata or the checked-in mapping file.
        """
        normalized_name = self._normalize_model_name(model_name)
        mapping_data = self._load_class_mapping_file()

        # Prefer model metadata embedded in the ONNX file when available.
        model_path = self.available_models.get(model_name)
        if model_path and os.path.exists(model_path):
            try:
                session = ort.InferenceSession(model_path)
                metadata = dict(session.get_modelmeta().custom_metadata_map)
                for key in ("class_names", "labels", "class_mapping"):
                    if key in metadata:
                        metadata_labels = self._extract_labels(metadata[key])
                        if metadata_labels:
                            return metadata_labels
            except Exception as exc:
                log.warning("Could not inspect model metadata for %s: %s", model_name, exc)

        # Then fall back to the repository mapping contract.
        for candidate_key in (model_name, normalized_name):
            if candidate_key in mapping_data:
                labels = self._extract_labels(mapping_data[candidate_key])
                if labels:
                    return labels

        models_section: Dict[str, Any] = {}
        raw_models_section = mapping_data.get("models")
        if isinstance(raw_models_section, dict):
            models_section = raw_models_section
        for candidate_key in (model_name, normalized_name):
            if candidate_key in models_section:
                labels = self._extract_labels(models_section[candidate_key])
                if labels:
                    return labels

        default_labels = self._extract_labels(mapping_data.get("default"))
        if default_labels:
            return default_labels

        # Verified fallback based on the trained label order documented in the project issue.
        return ["corrosion", "no_corrosion"]

    def _preprocess_image(self, image: Image.Image, input_shape: List[Any]) -> np.ndarray:
        """
        Preprocesses an image to match the model input tensor layout.
        """
        image = ImageOps.exif_transpose(image).convert("RGB")

        if len(input_shape) != 4:
            raise ValueError(f"Unsupported model input shape: {input_shape}")

        if input_shape[1] in (1, 3):
            height = int(input_shape[2]) if isinstance(input_shape[2], int) else 224
            width = int(input_shape[3]) if isinstance(input_shape[3], int) else 224
            tensor_layout = "NCHW"
        elif input_shape[-1] in (1, 3):
            height = int(input_shape[1]) if isinstance(input_shape[1], int) else 224
            width = int(input_shape[2]) if isinstance(input_shape[2], int) else 224
            tensor_layout = "NHWC"
        else:
            raise ValueError(f"Unable to determine tensor layout from input shape: {input_shape}")

        resized_image = image.resize((width, height), Image.Resampling.BILINEAR)
        image_array = np.asarray(resized_image, dtype=np.float32) / 255.0

        # ImageNet normalization — must match backend/training/augmentations.py.
        # All supported models (MobileNetV2, EfficientNetB0, ResNet50, ConvNeXt)
        # use ImageNet-pretrained weights and were retrained with these statistics.
        _MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        _STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        image_array = (image_array - _MEAN) / _STD  # shape: HWC

        if tensor_layout == "NCHW":
            image_array = np.transpose(image_array, (2, 0, 1))

        input_tensor = np.expand_dims(image_array, axis=0)
        return np.ascontiguousarray(input_tensor, dtype=np.float32)

    def get_class_names(self) -> List[str]:
        """
        Returns the resolved class label order for the currently loaded model.
        """
        return list(self.class_names)

    # All directories to probe for .onnx files, in priority order.
    # The primary (settings-based) directory is prepended at scan time.
    _EXTRA_SCAN_DIRS: List[str] = [
        "backend/models/onnx",
        "backend/models/exports",
        "backend/models/checkpoints",
        "backend/models",
        "models/onnx",
        "models",
    ]

    def scan_for_models(self):
        """
        Scans multiple candidate directories for .onnx files.

        Search order:
          1. self.model_dir  (primary — from settings / constructor arg)
          2. backend/models/onnx
          3. backend/models/exports
          4. backend/models/checkpoints
          5. backend/models
          6. models/onnx, models

        The first directory that yields at least one .onnx file wins for
        the primary model_dir update; models from ALL directories that
        contain .onnx files are merged into available_models.
        """
        cwd = os.getcwd()
        primary = os.path.abspath(self.model_dir)

        # Build deduplicated search list (primary first, then extras)
        seen: set[str] = set()
        search_dirs: List[str] = []
        for d in [self.model_dir] + self._EXTRA_SCAN_DIRS:
            abs_d = os.path.abspath(d)
            if abs_d not in seen:
                seen.add(abs_d)
                search_dirs.append(d)

        print(f"[inference] CWD              : {cwd}")
        print(f"[inference] Primary model dir: {self.model_dir}  (→ {primary})")
        print(f"[inference] Search paths     : {[os.path.abspath(d) for d in search_dirs]}")
        log.info("[inference] CWD=%s  primary=%s", cwd, primary)

        self.available_models = {}

        for search_dir in search_dirs:
            abs_dir = os.path.abspath(search_dir)
            if not os.path.isdir(search_dir):
                print(f"[inference]   {abs_dir}: not found")
                continue

            onnx_files = sorted(f for f in os.listdir(search_dir) if f.endswith(".onnx"))
            if not onnx_files:
                print(f"[inference]   {abs_dir}: exists but no .onnx files")
                continue

            print(f"[inference]   {abs_dir}: found {len(onnx_files)} model(s)")
            for filename in onnx_files:
                model_name = os.path.splitext(filename)[0]
                model_path = os.path.join(search_dir, filename)
                data_file = model_path + ".data"
                has_data = os.path.exists(data_file)
                print(
                    f"[inference]     {model_name}  "
                    f"({'with' if has_data else 'NO'} .data)  →  {model_path}"
                )
                log.info(
                    "[inference] Found: %s  path=%s  external_data=%s",
                    model_name, model_path, has_data,
                )
                # Don't overwrite a model already found in a higher-priority dir
                if model_name not in self.available_models:
                    self.available_models[model_name] = model_path

        if not self.available_models:
            print(
                f"[inference] No .onnx files found in any search path.\n"
                f"[inference] Auto-download from Supabase 'model-artifacts' will be "
                f"attempted during lifespan startup."
            )
            log.warning("[inference] No .onnx files found in any of: %s", search_dirs)
            return

        print(f"[inference] Available models: {list(self.available_models.keys())}")
        log.info("[inference] Available models: %s", list(self.available_models.keys()))

    def list_available_models(self) -> List[str]:
        """
        Returns a list of names of the available ONNX models.

        Returns:
            List[str]: A list of model names.
        """
        log.debug("Listing available models.")
        return list(self.available_models.keys())

    def load_model(self, model_name: str) -> bool:
        """
        Loads a selected ONNX model into an ONNX Runtime inference session.

        Args:
            model_name (str): The name of the model to load.

        Returns:
            bool: True if the model was loaded successfully, False otherwise.
        """
        resolved_name = None
        normalized_request = self._normalize_model_name(model_name)
        for available_name in self.available_models:
            if self._normalize_model_name(available_name) == normalized_request:
                resolved_name = available_name
                break

        if not resolved_name:
            log.error(f"Model '{model_name}' is not available. Cannot load.")
            return False

        model_path = self.available_models[resolved_name]
        log.info(f"Loading model '{model_name}' from {model_path}...")

        try:
            # Prefer GPU providers when available (Jetson / CUDA), fall back to CPU.
            available_providers = ort.get_available_providers()
            if "TensorrtExecutionProvider" in available_providers:
                providers = ["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]
            elif "CUDAExecutionProvider" in available_providers:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            else:
                providers = ["CPUExecutionProvider"]
            log.info("ONNX Runtime providers selected for '%s': %s", model_name, providers)
            self.inference_session = ort.InferenceSession(model_path, providers=providers)
            self.active_model_name = resolved_name
            self.class_names = self._resolve_class_names(resolved_name)
            log.info(f"Successfully loaded model '{resolved_name}'.")
            log.info("Resolved class labels for '%s': %s", resolved_name, self.class_names)
            
            # Log model input and output details
            input_meta = self.inference_session.get_inputs()[0]
            output_meta = self.inference_session.get_outputs()[0]
            log.info(f"Model Input: name='{input_meta.name}', shape={input_meta.shape}, type={input_meta.type}")
            log.info(f"Model Output: name='{output_meta.name}', shape={output_meta.shape}, type={output_meta.type}")

            return True
        except Exception as e:
            log.error(f"Failed to load model '{resolved_name or model_name}'. Error: {e}", exc_info=True)
            self.inference_session = None
            self.active_model_name = None
            self.class_names = []
            return False

    def get_active_model(self) -> Optional[str]:
        """
        Returns the name of the currently loaded model.

        Returns:
            Optional[str]: The name of the active model, or None if no model is loaded.
        """
        return self.active_model_name

    def predict(self, image: Image.Image) -> Dict[str, Any]:
        """
        Performs inference on a given image using the currently loaded ONNX model.
        This is a placeholder and will need to be adapted to the specific model's requirements.

        Args:
            image (Image.Image): The input image in PIL format.

        Returns:
            Dict[str, Any]: A dictionary containing the prediction results.
                           Returns an error message if no model is loaded or if prediction fails.
        """
        if not self.inference_session or not self.active_model_name:
            log.error("Prediction failed: No model is currently loaded.")
            return {"error": "No model loaded. Please load a model before running prediction."}

        log.info(f"Running prediction with model '{self.active_model_name}'...")

        try:
            input_meta = self.inference_session.get_inputs()[0]
            input_name = input_meta.name
            input_shape = input_meta.shape

            input_tensor = self._preprocess_image(image, input_shape)

            # Run inference
            log.debug(f"Input tensor shape: {input_tensor.shape}")
            result = self.inference_session.run(None, {input_name: input_tensor})
            
            output_meta = self.inference_session.get_outputs()[0]
            raw_output = np.asarray(result[0], dtype=np.float32)
            if raw_output.ndim > 1 and raw_output.shape[0] == 1:
                raw_output = raw_output[0]

            if self._is_probability_vector(raw_output):
                probabilities = raw_output
                output_kind = "probabilities"
            else:
                probabilities = self._softmax(raw_output)
                output_kind = "logits"

            predicted_index = int(np.argmax(probabilities))
            class_names = self.class_names or ["corrosion", "no_corrosion"]
            predicted_class = (
                class_names[predicted_index]
                if predicted_index < len(class_names)
                else f"class_{predicted_index}"
            )

            log.info("Prediction successful.")
            log.debug("Model name: %s", self.active_model_name)
            log.debug("Input metadata: name=%s shape=%s type=%s", input_meta.name, input_shape, input_meta.type)
            log.debug("Output metadata: name=%s shape=%s type=%s", output_meta.name, output_meta.shape, output_meta.type)
            log.debug("Raw output kind: %s", output_kind)
            log.debug("Raw output values: %s", raw_output.tolist())
            log.debug("Probabilities: %s", probabilities.tolist())
            log.debug("Predicted index: %s", predicted_index)
            log.debug("Predicted class: %s", predicted_class)

            # Format the response
            return {
                "model_used": self.active_model_name,
                "prediction": raw_output.tolist(),
                "probabilities": probabilities.tolist(),
                "predicted_index": predicted_index,
                "predicted_class": predicted_class,
                "input_name": input_meta.name,
                "input_shape": input_shape,
                "output_name": output_meta.name,
                "output_shape": output_meta.shape,
                "status": "success"
            }

        except Exception as e:
            log.error(f"An error occurred during prediction: {e}", exc_info=True)
            return {"error": f"Prediction failed with an internal error: {e}"}

    def rescan_and_load_default(self) -> bool:
        """
        Re-scan the model directory and attempt to load the default model from settings.

        Intended to be called after new model files have been written to disk
        (e.g. after Supabase model download at startup).

        Returns True if a model was loaded successfully, False otherwise.
        """
        self.scan_for_models()
        if not self.available_models:
            log.warning("[inference] rescan found no models — inference still unavailable.")
            return False

        preferred_stem = os.path.splitext(os.path.basename(settings.DEFAULT_MODEL))[0].lower()
        preferred_match = next(
            (m for m in self.available_models if self._normalize_model_name(m) == preferred_stem),
            None,
        )
        target = preferred_match or list(self.available_models.keys())[0]
        ok = self.load_model(target)
        if ok:
            log.info("[inference] Default model loaded after rescan: %s", target)
        else:
            log.error("[inference] Failed to load model '%s' after rescan.", target)
        return ok


# Create a module-level singleton for application-wide use.
# model_dir reads from settings so render.yaml / .env overrides are respected.
inference_service = ONNXInferenceService(model_dir=settings.MODEL_DIRECTORY)

# Automatically load the first available model if any exist.
_available_models = inference_service.list_available_models()
if _available_models:
    preferred_model_name = os.path.splitext(os.path.basename(settings.DEFAULT_MODEL))[0].lower()
    preferred_match = next(
        (
            available_model
            for available_model in _available_models
            if inference_service._normalize_model_name(available_model) == preferred_model_name
        ),
        None,
    )
    inference_service.load_model(preferred_match or _available_models[0])
else:
    print(
        "[inference] No models found at import time — "
        "_ensure_models_available() will attempt Supabase download during lifespan startup."
    )

# Example of how to use the service (for testing purposes)
if __name__ == '__main__':
    # Configure basic logging for standalone testing
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    # Create an instance of the service.
    # Assumes you are running this from the root of the project,
    # and the models are in 'backend/models/onnx'.
    # Adjust the path if your structure is different or you run from another directory.
    inference_service = ONNXInferenceService(model_dir="../../models/onnx")

    # List models
    models = inference_service.list_available_models()
    print(f"Available models: {models}")

    if models:
        # Load the first available model
        model_to_load = models[0]
        loaded = inference_service.load_model(model_to_load)

        if loaded:
            print(f"Model '{model_to_load}' loaded successfully.")
            # Create a dummy image for prediction testing
            if inference_service.inference_session is not None:
                try:
                    # Get expected input shape from the loaded model
                    input_shape = inference_service.inference_session.get_inputs()[0].shape
                    _, _, h, w = input_shape
                    dummy_image = Image.new('RGB', (w, h), color = 'red')
                    print(f"Created a dummy image of size {w}x{h} for prediction.")
                    
                    # Run prediction
                    prediction = inference_service.predict(dummy_image)
                    print(f"Prediction result: {prediction}")

                except Exception as e:
                    print(f"Could not run prediction test. Error: {e}")
            else:
                print("Could not run prediction test because no inference session is loaded.")
        else:
            print(f"Failed to load model '{model_to_load}'.")
    else:
        print("No models available to test.")

