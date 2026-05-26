"""
dataset.py

Purpose
-------
Dynamic dataset creation for Pipeline Rakshak.

Features
--------
1. Reads verified retraining images
2. Automatic train/val/test split
3. Stratified splitting
4. Class balancing support
5. Returns DataLoaders
6. Jetson compatible
7. Retraining compatible

Expected Structure
------------------

backend/datasets/retraining/

corrosion/
    image1.jpg
    image2.jpg

no_corrosion/
    image3.jpg
    image4.jpg
"""

import hashlib
import logging
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

import torch
from torch.utils.data import (
    Dataset,
    DataLoader,
    WeightedRandomSampler,
)

from sklearn.model_selection import (
    train_test_split
)

log = logging.getLogger(__name__)

from .augmentations import (
    build_train_transform,
    build_validation_transform,
    build_test_transform
)


CLASS_TO_IDX = {
    "corrosion": 0,
    "no_corrosion": 1
}


class RetrainingDataset(Dataset):
    """
    Dynamic image dataset.
    """

    def __init__(
        self,
        image_paths,
        labels,
        transform=None
    ):
        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform

    def __len__(self):

        return len(self.image_paths)

    def __getitem__(self, idx):

        image_path = self.image_paths[idx]

        image = Image.open(
            image_path
        ).convert("RGB")

        label = self.labels[idx]

        if self.transform:
            image = self.transform(image)

        return image, label


_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ─────────────────────────────────────────────────────────────────────────────
# Dataset integrity & class-balance utilities
# ─────────────────────────────────────────────────────────────────────────────

def _file_hash(path: Path) -> str:
    """MD5 of the first 16 KB — fast duplicate detection."""
    with open(path, "rb") as fh:
        return hashlib.md5(fh.read(16384)).hexdigest()


def validate_dataset_integrity(dataset_root: str) -> dict:
    """
    Scan the dataset directory and return a structured validation report.

    Returns
    -------
    dict with keys:
        total        — total image-file candidates found
        valid        — images that passed every check
        corrupted    — images PIL could not open / verify
        duplicates   — duplicate image files (hash-based)
        class_counts — {label_str: count} for valid images
        warnings     — non-fatal issues (logged, training continues)
        errors       — critical issues (training must NOT start)
    """
    root = Path(dataset_root)
    if not root.exists():
        return {
            "total": 0, "valid": 0, "corrupted": 0, "duplicates": 0,
            "class_counts": {},
            "warnings": [],
            "errors": [f"Dataset directory does not exist: {root}"],
        }

    total = 0
    valid = 0
    corrupted = 0
    dup_count = 0
    seen_hashes: dict = {}
    class_counts: Counter = Counter()
    warnings: List[str] = []
    errors: List[str] = []

    for img_path in sorted(root.iterdir()):
        if img_path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue
        total += 1

        # Label check
        label_file = img_path.with_suffix(".txt")
        if not label_file.exists():
            warnings.append(f"No label file for {img_path.name} — skipped")
            continue
        raw = label_file.read_text(encoding="utf-8").strip().lower()
        if raw not in CLASS_TO_IDX:
            warnings.append(f"Invalid label '{raw}' in {label_file.name} — skipped")
            continue

        # Readability check
        try:
            with Image.open(img_path) as img:
                img.verify()
        except Exception as exc:
            corrupted += 1
            warnings.append(f"Corrupted image {img_path.name}: {exc}")
            continue

        # Duplicate check
        h = _file_hash(img_path)
        if h in seen_hashes:
            dup_count += 1
            warnings.append(
                f"Duplicate: {img_path.name} matches {seen_hashes[h]} — counted once"
            )
        else:
            seen_hashes[h] = img_path.name

        valid += 1
        class_counts[raw] += 1

    # ── Critical errors ───────────────────────────────────────────────────────
    if valid < 10:
        errors.append(
            f"Only {valid} valid images — need ≥ 10 for retraining."
        )
    for cls in CLASS_TO_IDX:
        cnt = class_counts.get(cls, 0)
        if cnt == 0:
            errors.append(
                f"No valid samples for class '{cls}' — cannot do stratified split."
            )
        elif cnt < 3:
            errors.append(
                f"Only {cnt} sample(s) for class '{cls}' — too few for train/val/test split."
            )

    # ── Imbalance warnings ────────────────────────────────────────────────────
    if valid > 0:
        for cls, count in class_counts.items():
            ratio = count / valid
            if ratio < 0.15:
                warnings.append(
                    f"Severe class imbalance: '{cls}' = {count}/{valid} "
                    f"({ratio:.1%}). WeightedRandomSampler will be applied."
                )

    return {
        "total": total,
        "valid": valid,
        "corrupted": corrupted,
        "duplicates": dup_count,
        "class_counts": dict(class_counts),
        "warnings": warnings,
        "errors": errors,
    }


def compute_class_weights(labels: List[int]) -> List[float]:
    """
    Compute inverse-frequency class weights suitable for ``nn.CrossEntropyLoss``.

    Parameters
    ----------
    labels : list[int]

    Returns
    -------
    weights : list[float]  — one float per class index
    """
    counts = Counter(labels)
    total = len(labels)
    num_cls = len(CLASS_TO_IDX)
    return [total / (num_cls * counts.get(i, 1)) for i in range(num_cls)]


def download_queue_images(
    queue_items: List[Tuple[int, str, str]],
    dest_dir: Path,
) -> Tuple[int, List[int]]:
    """
    Stage retraining queue images into *dest_dir* so the training pipeline
    always reads from local files, regardless of whether the source images
    are local filesystem paths or remote Supabase Storage URLs.

    Parameters
    ----------
    queue_items : list of (item_id, image_path, label) tuples
        ``image_path`` may be:
        - An ``http://`` / ``https://`` URL  → downloaded via urllib
        - A local filesystem path            → copied with shutil
    dest_dir : pathlib.Path
        Target directory (must already exist). Each image is written as
        ``item_{item_id}.jpg`` with a sidecar ``item_{item_id}.txt`` label.

    Returns
    -------
    (success_count, failed_ids)
    """
    import shutil
    import urllib.request

    success = 0
    failed: List[int] = []

    for item_id, image_path, label in queue_items:
        clean_label = (label or "").strip().lower()
        if clean_label not in CLASS_TO_IDX:
            log.warning(
                "Queue item %d has unrecognised label '%s' — skipped",
                item_id, label,
            )
            failed.append(item_id)
            continue

        dest_img   = dest_dir / f"item_{item_id}.jpg"
        dest_label = dest_dir / f"item_{item_id}.txt"

        try:
            if image_path.startswith(("http://", "https://")):
                # Remote URL (e.g. Supabase Storage) — stream directly to
                # destination with a 30-second socket timeout.
                _req = urllib.request.Request(
                    image_path,
                    headers={"User-Agent": "PipelineRakshak/1.0"},
                )
                with urllib.request.urlopen(_req, timeout=30) as _resp:
                    dest_img.write_bytes(_resp.read())
            else:
                src = Path(image_path)
                if not src.exists():
                    log.warning(
                        "Queue item %d — local file not found: %s",
                        item_id, image_path,
                    )
                    failed.append(item_id)
                    continue
                shutil.copy2(str(src), str(dest_img))

            dest_label.write_text(clean_label, encoding="utf-8")
            success += 1

        except Exception as exc:
            log.warning(
                "Queue item %d — could not stage '%s': %s",
                item_id, image_path, exc,
            )
            # Remove partially written file to avoid a corrupted entry.
            if dest_img.exists():
                try:
                    dest_img.unlink()
                except Exception:
                    pass
            failed.append(item_id)

    return success, failed


def collect_dataset(dataset_root: str) -> Tuple[List[str], List[int]]:
    """
    Scan the flat retraining dataset directory.

    Corrupted images are silently skipped so they never reach the DataLoader.

    Returns
    -------
    image_paths : list[str]
    labels      : list[int]  (0 = corrosion, 1 = no_corrosion)
    """
    root = Path(dataset_root)
    image_paths: List[str] = []
    labels: List[int] = []

    for img_path in sorted(root.iterdir()):
        if img_path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue

        label_file = img_path.with_suffix(".txt")
        if not label_file.exists():
            continue

        raw = label_file.read_text(encoding="utf-8").strip().lower()
        class_id = CLASS_TO_IDX.get(raw)
        if class_id is None:
            continue

        # Skip corrupted images so they never reach the DataLoader
        try:
            with Image.open(img_path) as img:
                img.verify()
        except Exception:
            log.warning("Skipping corrupted image: %s", img_path.name)
            continue

        image_paths.append(str(img_path))
        labels.append(class_id)

    return image_paths, labels


# ─────────────────────────────────────────────────────────────────────────────
# Adaptive splitting helpers
# ─────────────────────────────────────────────────────────────────────────────

def _can_stratify(labels: List[int], min_per_class: int = 2) -> bool:
    """
    Return True only when every class has at least ``min_per_class`` samples.
    Used to decide whether to pass stratify= to train_test_split.
    """
    if not labels:
        return False
    counts = Counter(labels)
    return all(c >= min_per_class for c in counts.values())


def create_datasets(
    dataset_root: str,
    image_size: int = 224,
    train_ratio: float = 0.70,
    val_ratio: float = 0.20,
    test_ratio: float = 0.10,
):
    """
    Create train / val / test datasets with adaptive, crash-proof splitting.

    Splitting strategy
    ------------------
    total >= 100  →  train / val / test  (70 / 20 / 10)
    total >=  30  →  train / val only    (80 / 20),   test set = val set
    total  <  30  →  train / val only    (75 / 25),   test set = val set

    Stratification
    --------------
    Used only when ALL classes have ≥ 2 samples in the array being split.
    Falls back to random (non-stratified) splitting otherwise — never crashes.

    Minimum viable dataset
    ----------------------
    ≥ 4 valid images total and at least 1 image per class.
    (Enforced upstream by ``validate_dataset_integrity``.)
    """
    image_paths, labels = collect_dataset(dataset_root)
    n_total = len(image_paths)
    class_counts = Counter(labels)

    log.info(
        "Dataset collected — total=%d  classes=%s",
        n_total, dict(class_counts),
    )

    # ── Guard: minimum viable ─────────────────────────────────────────────────
    if n_total < 4:
        raise ValueError(
            f"Dataset too small: {n_total} valid image(s). "
            f"Need at least 4 (2 per class) to start retraining."
        )
    if len(class_counts) < 2:
        raise ValueError(
            "Only one class found in dataset. "
            "Both 'corrosion' and 'no_corrosion' must contain at least 1 image."
        )

    # ── Choose split mode based on total dataset size ─────────────────────────
    if n_total >= 100:
        mode = "train_val_test"
        first_test_size = 1.0 - train_ratio              # 0.30 → 70 % train
        relative_test   = test_ratio / (val_ratio + test_ratio)  # ~0.333
        log.info("Split mode: train/val/test (70/20/10) — n=%d", n_total)
    elif n_total >= 30:
        mode = "train_val"
        first_test_size = 0.20                           # 80 % train
        log.info("Split mode: train/val (80/20) — n=%d", n_total)
    else:
        mode = "train_val"
        # Larger val fraction ensures val gets ≥ 1 sample per class on small sets
        first_test_size = max(0.25, min(0.35, (len(class_counts) + 1) / n_total))
        log.info(
            "Split mode: train/val (%.0f/%.0f) — small dataset n=%d",
            (1.0 - first_test_size) * 100,
            first_test_size * 100,
            n_total,
        )

    # ── First split: train vs temp/val ────────────────────────────────────────
    use_stratify_1 = _can_stratify(labels)
    if not use_stratify_1:
        log.warning(
            "Stratification DISABLED for first split "
            "(min class count=%d < 2). Using random split.",
            min(class_counts.values()),
        )

    train_paths, temp_paths, train_labels, temp_labels = train_test_split(
        image_paths,
        labels,
        test_size=first_test_size,
        random_state=42,
        stratify=labels if use_stratify_1 else None,
    )

    # ── Second split: val vs test (large datasets only) ───────────────────────
    if mode == "train_val_test":
        use_stratify_2 = _can_stratify(temp_labels)
        if not use_stratify_2:
            log.warning(
                "Stratification DISABLED for second split "
                "(min class in temp=%d < 2). Using random split.",
                min(Counter(temp_labels).values()),
            )
        val_paths, test_paths, val_labels, test_labels = train_test_split(
            temp_paths,
            temp_labels,
            test_size=relative_test,
            random_state=42,
            stratify=temp_labels if use_stratify_2 else None,
        )
        test_transform = build_test_transform(image_size)
    else:
        # No separate test set — test mirrors val to keep DataLoader API stable
        val_paths,  val_labels  = temp_paths, temp_labels
        test_paths, test_labels = val_paths,  val_labels
        test_transform = build_validation_transform(image_size)
        log.info(
            "No separate test set — evaluation will reuse val set (%d images). "
            "This is expected for small datasets.",
            len(val_labels),
        )

    log.info(
        "Final split — train=%d  val=%d  test=%d  "
        "(test_is_val=%s  stratify_1=%s)",
        len(train_labels), len(val_labels), len(test_labels),
        mode == "train_val", use_stratify_1,
    )

    train_dataset = RetrainingDataset(
        train_paths, train_labels,
        transform=build_train_transform(image_size),
    )
    val_dataset = RetrainingDataset(
        val_paths, val_labels,
        transform=build_validation_transform(image_size),
    )
    test_dataset = RetrainingDataset(
        test_paths, test_labels,
        transform=test_transform,
    )
    return train_dataset, val_dataset, test_dataset


def create_dataloaders(
    dataset_root: str,
    image_size: int = 224,
    batch_size: int = 8,
    num_workers: int = 0
):
    """
    Build DataLoaders.
    """

    train_dataset, val_dataset, test_dataset = (
        create_datasets(
            dataset_root=dataset_root,
            image_size=image_size
        )
    )

    persistent_workers = (
        num_workers > 0
    )

    # ── WeightedRandomSampler for class-imbalance mitigation ─────────────────
    train_counts = Counter(train_dataset.labels)
    total_train = len(train_dataset)
    num_cls = len(CLASS_TO_IDX)
    cls_w = [total_train / (num_cls * train_counts.get(i, 1)) for i in range(num_cls)]
    sample_weights = [cls_w[lbl] for lbl in train_dataset.labels]
    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True,
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        sampler=sampler,          # replaces shuffle=True
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
        persistent_workers=persistent_workers
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
        persistent_workers=persistent_workers
    )

    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
        persistent_workers=persistent_workers
    )

    return {
        "train": train_loader,
        "val": val_loader,
        "test": test_loader
    }


if __name__ == "__main__":

    loaders = create_dataloaders(
        dataset_root="backend/datasets/retraining"
    )

    print(
        "\nDataset loaded successfully"
    )

    print(
        f"Train batches: "
        f"{len(loaders['train'])}"
    )

    print(
        f"Validation batches: "
        f"{len(loaders['val'])}"
    )

    print(
        f"Test batches: "
        f"{len(loaders['test'])}"
    )