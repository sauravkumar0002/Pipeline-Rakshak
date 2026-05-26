"""
backend/app/services/storage.py

Unified storage service for inspection images, reports, and model artifacts.

Two backends are supported — selected by the STORAGE_BACKEND environment var:

  local   (default)   Write files to local directories (UPLOAD_DIRECTORY etc.).
                      Fully backward-compatible with all existing code paths.

  supabase            Upload to Supabase Storage and store public URLs in DB.
                      Requires SUPABASE_URL and SUPABASE_SERVICE_KEY.

Usage
-----
    # main.py lifespan — call once at startup
    storage_service.init_from_settings()

    # anywhere in the app
    from backend.app.services.storage import storage_service
    url = storage_service.upload("inspection-images", "insp_123.jpg", img_bytes, "image/jpeg")
    storage_service.delete("inspection-images", "insp_123.jpg")
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# Bucket → local directory mapping used when STORAGE_BACKEND=local
_BUCKET_TO_LOCAL_DIR: dict[str, str] = {
    "inspection-images":  "uploads",
    "verification-images": "uploads",
    "retraining-images":  "uploads",
    "model-artifacts":    "reports",
}


class StorageService:
    """
    Thin abstraction over local disk or Supabase Storage.

    All callers use the same API regardless of which backend is active.
    """

    def __init__(self) -> None:
        self._backend: str = "local"
        self._client = None          # supabase.Client — set when backend=="supabase"
        self._upload_dir: str = "uploads"
        self._report_dir: str = "reports"

    # ── initialisation ────────────────────────────────────────────────────────

    def init_from_settings(self) -> None:
        """Read configuration from app settings and initialise the backend."""
        from backend.app.config import settings

        self._upload_dir = settings.UPLOAD_DIRECTORY
        self._report_dir = settings.REPORT_DIRECTORY

        # Update local-dir map to respect settings
        _BUCKET_TO_LOCAL_DIR["inspection-images"]   = settings.UPLOAD_DIRECTORY
        _BUCKET_TO_LOCAL_DIR["verification-images"] = settings.UPLOAD_DIRECTORY
        _BUCKET_TO_LOCAL_DIR["retraining-images"]   = settings.UPLOAD_DIRECTORY
        _BUCKET_TO_LOCAL_DIR["model-artifacts"]     = settings.REPORT_DIRECTORY

        backend = getattr(settings, "STORAGE_BACKEND", "local").lower()
        supabase_url = getattr(settings, "SUPABASE_URL", "") or ""
        service_key  = getattr(settings, "SUPABASE_SERVICE_KEY", "") or ""

        if backend == "supabase":
            self._init_supabase(supabase_url, service_key)
        else:
            self._backend = "local"
            log.info("[storage] Backend: local filesystem")

    def _init_supabase(self, raw_url: str, service_key: str) -> None:
        """Initialise the Supabase Storage client."""
        if not raw_url or not service_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set when "
                "STORAGE_BACKEND=supabase"
            )
        # Accept either the bare project URL or the REST API URL ending in /rest/v1/
        project_url = raw_url.rstrip("/")
        for suffix in ("/rest/v1", "/storage/v1", "/auth/v1"):
            if project_url.endswith(suffix):
                project_url = project_url[: -len(suffix)]
        try:
            from supabase import create_client
            self._client = create_client(project_url, service_key)
            self._backend = "supabase"
            log.info("[storage] Backend: Supabase Storage — project: %s", project_url)
        except ImportError:
            raise RuntimeError(
                "The 'supabase' Python package is required for "
                "STORAGE_BACKEND=supabase. Run: pip install supabase"
            )

    # ── public API ────────────────────────────────────────────────────────────

    def upload(
        self,
        bucket: str,
        object_path: str,
        file_bytes: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Upload bytes and return a URL (Supabase) or local path (local).

        Parameters
        ----------
        bucket      : Supabase bucket name, e.g. "inspection-images".
        object_path : Path inside the bucket, e.g. "inspection_12345.jpg".
        file_bytes  : Raw bytes to write.
        content_type: MIME type.

        Returns
        -------
        Public URL (Supabase) or local filesystem path (local backend).
        """
        if self._backend == "supabase":
            return self._upload_supabase(bucket, object_path, file_bytes, content_type)
        return self._upload_local(bucket, object_path, file_bytes)

    def delete(self, bucket: str, object_path: str) -> None:
        """
        Delete a stored file.  Silent no-op if the file does not exist.

        ``object_path`` must be the value that was returned / stored during
        upload — a Supabase object path or a local filesystem path.
        """
        if self._backend == "supabase":
            self._delete_supabase(bucket, object_path)
        else:
            self._delete_local(object_path)

    def health_check(self) -> dict:
        """
        Verify the storage backend is reachable and required buckets exist.

        Returns a dict with keys 'ok' (bool) and 'detail' (str).
        """
        if self._backend == "supabase":
            return self._health_supabase()
        return {"ok": True, "detail": "local filesystem — no remote check needed"}

    def list_objects(self, bucket: str, path: str = "") -> list[str]:
        """
        List all object names inside *bucket* under the given *path* prefix.

        Returns a flat list of object-path strings (e.g. ["model.onnx", ...]).
        Returns an empty list when the bucket/path cannot be read.
        """
        if self._backend == "supabase":
            return self._list_supabase(bucket, path)
        return self._list_local(bucket, path)

    def download_bytes(self, bucket: str, object_path: str) -> bytes:
        """
        Download *object_path* from *bucket* and return raw bytes.

        Raises FileNotFoundError for the local backend when the file is absent.
        """
        if self._backend == "supabase":
            return self._download_supabase(bucket, object_path)
        return self._download_local(bucket, object_path)

    @property
    def is_supabase(self) -> bool:
        return self._backend == "supabase"

    # ── Supabase backend ──────────────────────────────────────────────────────

    REQUIRED_BUCKETS = [
        "inspection-images",
        "verification-images",
        "retraining-images",
        "model-artifacts",
    ]

    def _upload_supabase(
        self, bucket: str, object_path: str, file_bytes: bytes, content_type: str
    ) -> str:
        assert self._client is not None
        storage = self._client.storage.from_(bucket)
        # Upsert: silently remove any existing object first
        try:
            storage.remove([object_path])
        except Exception:
            pass
        storage.upload(
            object_path,
            file_bytes,
            {"content-type": content_type},
        )
        url: str = storage.get_public_url(object_path)
        # Some Supabase SDK versions append a trailing '?' — strip it.
        return url.rstrip("?")



    def _delete_supabase(self, bucket: str, object_path: str) -> None:
        """Delete by Supabase object path (not a full URL)."""
        try:
            assert self._client is not None
            self._client.storage.from_(bucket).remove([object_path])
        except Exception as exc:
            log.warning("[storage] Supabase delete failed [%s/%s]: %s", bucket, object_path, exc)

    def _health_supabase(self) -> dict:
        assert self._client is not None
        try:
            buckets = self._client.storage.list_buckets()
            existing = {b.name for b in buckets}
            missing = [b for b in self.REQUIRED_BUCKETS if b not in existing]
            if missing:
                return {
                    "ok": False,
                    "detail": f"Missing Supabase buckets: {missing}. "
                              f"Create them in your Supabase dashboard → Storage.",
                }
            return {"ok": True, "detail": f"Supabase Storage OK — {len(existing)} buckets found"}
        except Exception as exc:
            return {"ok": False, "detail": f"Supabase Storage unreachable: {exc}"}

    def _list_supabase(self, bucket: str, path: str) -> list[str]:
        """Return object names in a Supabase bucket under *path*."""
        assert self._client is not None
        try:
            items = self._client.storage.from_(bucket).list(path or "")
            names = []
            for item in items:
                name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
                if name:
                    names.append(f"{path}/{name}" if path else name)
            return names
        except Exception as exc:
            log.warning("[storage] Supabase list failed [%s/%s]: %s", bucket, path, exc)
            return []

    def _download_supabase(self, bucket: str, object_path: str) -> bytes:
        assert self._client is not None
        raw = self._client.storage.from_(bucket).download(object_path)
        # supabase-py v1 returned list[int], v2 returns bytes/bytearray.
        # Normalise to bytes regardless of SDK version.
        if isinstance(raw, (bytes, bytearray)):
            return bytes(raw)
        if isinstance(raw, (list, tuple)):
            return bytes(raw)
        # Fallback for unexpected types
        try:
            return bytes(raw)
        except Exception:
            raise TypeError(
                f"Unexpected type from Supabase download: {type(raw).__name__}"
            )

    # ── local backend ─────────────────────────────────────────────────────────

    def _upload_local(self, bucket: str, object_path: str, file_bytes: bytes) -> str:
        dest_dir = _BUCKET_TO_LOCAL_DIR.get(bucket, self._upload_dir)
        dest = Path(dest_dir) / object_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(file_bytes)
        return str(dest)

    def _delete_local(self, path: str) -> None:
        """Remove a local file; silently ignore if already gone."""
        try:
            p = Path(path)
            if p.exists():
                p.unlink()
        except Exception as exc:
            log.warning("[storage] Local delete failed [%s]: %s", path, exc)

    def _list_local(self, bucket: str, path: str) -> list[str]:
        local_dir = _BUCKET_TO_LOCAL_DIR.get(bucket, self._upload_dir)
        search_dir = Path(local_dir) / path if path else Path(local_dir)
        if not search_dir.exists():
            return []
        return [p.name for p in search_dir.iterdir() if p.is_file()]

    def _download_local(self, bucket: str, object_path: str) -> bytes:
        local_dir = _BUCKET_TO_LOCAL_DIR.get(bucket, self._upload_dir)
        local_path = Path(local_dir) / object_path
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")
        return local_path.read_bytes()


# ---------------------------------------------------------------------------
# Module-level singleton — imported and used by all endpoints.
# Must be initialised via storage_service.init_from_settings() at startup.
# ---------------------------------------------------------------------------
storage_service = StorageService()
