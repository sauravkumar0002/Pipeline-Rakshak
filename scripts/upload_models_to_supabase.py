"""
scripts/upload_models_to_supabase.py
=====================================
One-time utility: upload all local ONNX model files from backend/models/onnx/
to the Supabase Storage 'model-artifacts' bucket.

Run this ONCE from the project root before deploying to Render:

    python scripts/upload_models_to_supabase.py

Requirements:
  - SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in your .env file.
  - Run from the project root (d:\\AI Corrosion Detection Platform).
  - Virtual environment must be active.

What it uploads:
  *.onnx and *.onnx.data files from backend/models/onnx/

On Render, the app's startup code (_ensure_models_available in main.py) will
automatically download these files when the model directory is empty.
"""

import os
import sys
from pathlib import Path

# Allow running from project root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Load .env so SUPABASE_URL and SUPABASE_SERVICE_KEY are available
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
MODEL_DIR = Path("backend/models/onnx")
BUCKET = "model-artifacts"

def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in your .env file.")
        sys.exit(1)

    from supabase import create_client
    client = create_client(SUPABASE_URL.rstrip("/"), SUPABASE_SERVICE_KEY)

    # Collect files to upload: .onnx and .onnx.data only (skip .bak, .tmp)
    candidates = sorted(
        f for f in MODEL_DIR.iterdir()
        if f.is_file() and (f.name.endswith(".onnx") or f.name.endswith(".onnx.data"))
        and not f.name.endswith(".onnx.bak") and not f.name.endswith(".onnx.tmp")
    )

    if not candidates:
        print(f"No .onnx or .onnx.data files found in {MODEL_DIR.resolve()}")
        sys.exit(0)

    print(f"Found {len(candidates)} file(s) to upload to bucket '{BUCKET}':")
    for f in candidates:
        print(f"  {f.name}  ({f.stat().st_size / (1024*1024):.1f} MB)")

    storage = client.storage.from_(BUCKET)
    skipped: list[str] = []
    failed: list[str] = []

    for file_path in candidates:
        object_name = file_path.name
        size_mb = file_path.stat().st_size / (1024 * 1024)
        print(f"\nUploading {object_name} ({size_mb:.1f} MB) ...", end=" ", flush=True)

        # Remove existing object silently (upsert behaviour)
        try:
            storage.remove([object_name])
        except Exception:
            pass

        try:
            file_bytes = file_path.read_bytes()
            storage.upload(object_name, file_bytes, {"content-type": "application/octet-stream"})
            print("OK")
        except Exception as exc:
            err_msg = str(exc)
            if "too large" in err_msg.lower() or "payload" in err_msg.lower() or "maximum" in err_msg.lower():
                print(f"SKIPPED — file too large for Supabase free-tier limit (50 MB).")
                print(f"  To upload large models: Supabase Dashboard → Storage → Settings → increase file size limit.")
                skipped.append(object_name)
            else:
                print(f"FAILED — {exc}")
                failed.append(object_name)
            continue

    print(f"\n{'='*60}")
    uploaded_count = len(candidates) - len(skipped) - len(failed)
    print(f"Uploaded:  {uploaded_count}/{len(candidates)} file(s)")
    if skipped:
        print(f"Skipped (too large): {skipped}")
        print("  Fix: Supabase Dashboard → Storage → Settings → Max File Upload Size → increase to 200 MB")
    if failed:
        print(f"Failed: {failed}")

    # Check if default model is available
    default_stem = "mobilenetv2_standard"
    default_onnx = f"{default_stem}.onnx"
    default_data = f"{default_stem}.onnx.data"
    default_ok = default_onnx not in skipped + failed and default_data not in skipped + failed
    if default_ok:
        print(f"\n[OK] Default model '{default_stem}' is fully uploaded — deployment will work.")
    else:
        print(f"\n[WARNING] Default model '{default_stem}' is incomplete — inference will not load on Render.")

    if uploaded_count > 0:
        print("You can now push to GitHub and redeploy on Render.")
        print("Models will be auto-downloaded at startup.")


if __name__ == "__main__":
    main()
