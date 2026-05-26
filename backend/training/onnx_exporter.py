"""
onnx_exporter.py

Purpose
-------
Export retrained PyTorch models to ONNX and validate them.

Features
--------
1. Export best.pt -> ONNX
2. Dynamic batch size
3. ONNX validation
4. ONNX Runtime inference validation
5. PyTorch vs ONNX comparison
6. Export metadata JSON
7. Jetson compatible
8. Production deployment ready

Author
------
Pipeline Rakshak
"""

import json
import logging
from pathlib import Path

import numpy as np
import torch
import onnx
import onnxruntime as ort

log = logging.getLogger(__name__)


def _torch_version_tuple() -> tuple:
    """Return (major, minor) from torch.__version__ (e.g. '2.12.0+cpu' -> (2, 12))."""
    clean = torch.__version__.split("+")[0]
    parts = clean.split(".")
    try:
        return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except ValueError:
        return (0, 0)


class ONNXExporter:

    def __init__(
        self,
        model,
        checkpoint_path: str,
        output_dir: str,
        image_size: int = 224,
    ):
        self.model = model.eval()
        self.checkpoint_path = Path(checkpoint_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.image_size = image_size

        self._torch_ver = _torch_version_tuple()
        # PyTorch >= 2.5 uses the TorchDynamo ONNX exporter (requires onnxscript)
        # and returns an ONNXProgram rather than writing the file directly.
        # PyTorch < 2.5 uses the legacy TorchScript exporter (writes file directly).
        self._use_dynamo = self._torch_ver >= (2, 5)

        log.info(
            "ONNXExporter ready — torch=%s  dynamo_api=%s  image_size=%d",
            torch.__version__, self._use_dynamo, self.image_size,
        )

    # =====================================================
    # EXPORT
    # =====================================================

    def export(self, model_name: str) -> str:
        """
        Export the model to ONNX, validate graph structure, run an ONNX
        Runtime inference test, and write export_metadata.json.

        Returns
        -------
        str  Absolute path to the exported .onnx file.
        """
        onnx_path = self.output_dir / f"{model_name}.onnx"
        dummy_input = torch.randn(
            1, 3, self.image_size, self.image_size, dtype=torch.float32
        )

        log.info(
            "ONNX export starting — model=%s  api=%s  output=%s",
            model_name, "dynamo" if self._use_dynamo else "legacy", onnx_path,
        )

        if self._use_dynamo:
            self._export_dynamo(dummy_input, onnx_path)
        else:
            self._export_legacy(dummy_input, onnx_path)

        log.info(
            "ONNX file written — size=%.2f MB",
            onnx_path.stat().st_size / 1_048_576,
        )

        log.info("Validating ONNX model graph ...")
        self._validate_onnx(onnx_path)
        log.info("ONNX graph validation passed.")

        log.info("Running ONNX Runtime inference test ...")
        self._verify_runtime(dummy_input, onnx_path)
        log.info("ONNX Runtime inference test passed.")

        self._save_metadata(onnx_path, model_name)
        log.info(
            "Export metadata saved — %s",
            self.output_dir / "export_metadata.json",
        )

        return str(onnx_path)

    # =====================================================
    # EXPORT PATHS (private)
    # =====================================================

    def _export_dynamo(
        self, dummy_input: torch.Tensor, onnx_path: Path
    ) -> None:
        """New TorchDynamo exporter (PyTorch >= 2.5, requires onnxscript).
        Returns an ONNXProgram that must be saved via .save()."""
        log.debug("dynamo exporter — torch=%s", torch.__version__)
        onnx_program = torch.onnx.export(
            self.model,
            (dummy_input,),
            dynamo=True,
            input_names=["input"],
            output_names=["output"],
        )
        onnx_program.save(str(onnx_path))

    def _export_legacy(
        self, dummy_input: torch.Tensor, onnx_path: Path
    ) -> None:
        """Legacy TorchScript exporter (PyTorch < 2.5). Saves file directly."""
        log.debug("legacy exporter — torch=%s", torch.__version__)
        torch.onnx.export(
            self.model,
            dummy_input,
            str(onnx_path),
            export_params=True,
            opset_version=12,
            do_constant_folding=True,
            input_names=["input"],
            output_names=["output"],
            dynamic_axes={
                "input":  {0: "batch_size"},
                "output": {0: "batch_size"},
            },
        )

    # =====================================================
    # VALIDATION (private)
    # =====================================================

    def _validate_onnx(self, onnx_path: Path) -> None:
        """Run onnx.checker on the exported model proto."""
        model_proto = onnx.load(str(onnx_path))
        onnx.checker.check_model(model_proto)

    # =====================================================
    # ORT VALIDATION (private)
    # =====================================================

    def _verify_runtime(
        self, dummy_input: torch.Tensor, onnx_path: Path
    ) -> None:
        """Run a forward pass through ONNX Runtime and compare with PyTorch
        output to catch numerical regressions after export."""
        dummy_np = dummy_input.numpy()

        with torch.inference_mode():
            pytorch_output = self.model(dummy_input).cpu().numpy()

        session = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )
        ort_output = session.run(
            None,
            {session.get_inputs()[0].name: dummy_np},
        )[0]

        max_diff = float(np.max(np.abs(pytorch_output - ort_output)))
        log.info(
            "PyTorch vs ONNX Runtime — max_abs_diff=%.6f  threshold=1e-3  pass=%s",
            max_diff, max_diff <= 1e-3,
        )
        if max_diff > 1e-3:
            raise RuntimeError(
                f"ONNX Runtime output deviates from PyTorch by {max_diff:.6f} "
                f"(threshold 1e-3). The exported model may be incorrect."
            )

    # =====================================================
    # METADATA (private)
    # =====================================================

    def _save_metadata(self, onnx_path: Path, model_name: str) -> None:
        metadata = {
            "onnx_file":     str(onnx_path),
            "onnx_size_mb":  round(onnx_path.stat().st_size / 1_048_576, 2),
            "image_size":    self.image_size,
            "torch_version": torch.__version__,
            "export_api":    "dynamo" if self._use_dynamo else "legacy",
            "opset":         "dynamo/auto" if self._use_dynamo else 12,
            "model_name":    model_name,
        }
        metadata_path = self.output_dir / "export_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)