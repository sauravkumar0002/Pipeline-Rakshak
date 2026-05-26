"""
reset_training_cycle.py
=======================
Safe training reset for the AI Corrosion Detection Platform.

Usage
-----
  Dry-run (shows what WOULD be deleted, no changes):
      python scripts/reset_training_cycle.py

  Execute the reset:
      python scripts/reset_training_cycle.py --execute

What this script does
---------------------
  DATABASE  — clears runtime data rows but keeps schema and static config.
  FILESYSTEM — removes training artifacts, uploads, datasets, checkpoints.
  MODELS    — removes candidate/archived DB records; keeps one baseline active record.
  FOLDERS   — re-creates all required working directories.

What is NEVER touched
---------------------
  - application code
  - database schema / migrations
  - API routes / frontend components
  - system_settings table
  - users table
  - backend/models/onnx/*.onnx  (production weights)
  - class_mapping.json
"""
import argparse
import shutil
import sqlite3
import sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "corrosion_detection.db"

# ── Folders that are fully wiped (all contents removed) ──────────────────────
WIPE_DIRS = [
    ROOT / "uploads",
    ROOT / "backend" / "datasets" / "retraining",
    ROOT / "backend" / "models" / "checkpoints",
    ROOT / "backend" / "models" / "exports",
    ROOT / "backend" / "models" / "evaluation",
    ROOT / "reports",
    ROOT / "plots",
    ROOT / "logs",
]

# ── Folders that must exist after reset (created if absent) ──────────────────
REQUIRED_DIRS = WIPE_DIRS + [
    ROOT / "backend" / "models" / "onnx",
]

# ── DB tables to CLEAR (DELETE FROM, keeps schema) ───────────────────────────
CLEAR_TABLES = [
    "training_epoch_logs",   # fk child → clear first
    "retraining_queue",
    "retraining_jobs",
    "model_versions",
    "inspections",
    "notifications",
]

# ── The one baseline active model to re-seed after reset ─────────────────────
BASELINE_MODEL_NAME    = "mobilenetv2_standard"
BASELINE_MODEL_VERSION = "v1"
BASELINE_ONNX_PATH     = ROOT / "backend" / "models" / "onnx" / "mobilenetv2_standard.onnx"


# ═══════════════════════════════════════════════════════════════════════════════

def _count_dir(d: Path) -> tuple[int, int]:
    """Return (file_count, total_bytes) for a directory."""
    if not d.exists():
        return 0, 0
    files = [f for f in d.rglob("*") if f.is_file()]
    return len(files), sum(f.stat().st_size for f in files)


def _list_files(d: Path, max_show: int = 20) -> list[str]:
    if not d.exists():
        return []
    files = sorted(f.relative_to(ROOT) for f in d.rglob("*") if f.is_file())
    shown = [str(f) for f in files[:max_show]]
    if len(files) > max_show:
        shown.append(f"  … and {len(files) - max_show} more files")
    return shown


def _db_row_counts() -> dict[str, int]:
    if not DB_PATH.exists():
        return {}
    con = sqlite3.connect(str(DB_PATH))
    q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    tables = [r[0] for r in con.execute(q).fetchall()]
    counts = {}
    for t in tables:
        counts[t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    con.close()
    return counts


# ─── DRY-RUN REPORT ──────────────────────────────────────────────────────────

def dry_run_report():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║         AI CORROSION DETECTION — TRAINING RESET PLAN            ║")
    print(f"║  Generated: {now:<52}║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    # ── Database
    print()
    print("┌─ DATABASE CHANGES ──────────────────────────────────────────────┐")
    counts = _db_row_counts()
    total_removed = 0
    for t in CLEAR_TABLES:
        n = counts.get(t, 0)
        total_removed += n
        mark = "CLEAR" if n > 0 else "empty"
        print(f"│  DELETE FROM {t:<35}  {n:>4} rows  [{mark}]")
    print(f"│  ─────────────────────────────────────────────────────────────")
    print(f"│  Total rows removed:  {total_removed}")
    print(f"│")
    print(f"│  KEPT (untouched):    system_settings ({counts.get('system_settings',0)} rows)")
    print(f"│                       users           ({counts.get('users',0)} rows)")
    print(f"│")
    print(f"│  SEEDED after reset:  model_versions  — 1 row")
    print(f"│    model_name={BASELINE_MODEL_NAME}  version={BASELINE_MODEL_VERSION}  status=active")
    print("└──────────────────────────────────────────────────────────────────┘")

    # ── Filesystem
    print()
    print("┌─ FILESYSTEM CHANGES ────────────────────────────────────────────┐")
    grand_files = 0
    grand_bytes = 0
    for d in WIPE_DIRS:
        fc, fb = _count_dir(d)
        grand_files += fc
        grand_bytes += fb
        rel = str(d.relative_to(ROOT))
        status = f"{fc} files  {fb/1024:>8.1f} KB" if fc > 0 else "[does not exist — will be created]"
        print(f"│  WIPE  {rel:<42}  {status}")
    print(f"│  ─────────────────────────────────────────────────────────────")
    print(f"│  Total removed:  {grand_files} files  ({grand_bytes/1024:.1f} KB / {grand_bytes/1024/1024:.1f} MB)")
    print("└──────────────────────────────────────────────────────────────────┘")

    # ── ONNX models (KEPT)
    print()
    print("┌─ ONNX MODELS — KEPT (production weights, never removed) ────────┐")
    onnx_dir = ROOT / "backend" / "models" / "onnx"
    if onnx_dir.exists():
        for f in sorted(onnx_dir.iterdir()):
            if f.is_file():
                print(f"│  KEEP  backend/models/onnx/{f.name:<35}  {f.stat().st_size/1024:>9.1f} KB")
    else:
        print("│  [directory does not exist]")
    print("└──────────────────────────────────────────────────────────────────┘")

    # ── File listing sample
    print()
    print("┌─ SAMPLE: uploads/ FILES TO BE REMOVED ──────────────────────────┐")
    for line in _list_files(ROOT / "uploads"):
        print(f"│  {line}")
    if not (ROOT / "uploads").exists() or _count_dir(ROOT / "uploads")[0] == 0:
        print("│  [empty]")
    print("└──────────────────────────────────────────────────────────────────┘")

    print()
    print("┌─ SAMPLE: datasets/retraining/ FILES TO BE REMOVED ──────────────┐")
    for line in _list_files(ROOT / "backend" / "datasets" / "retraining"):
        print(f"│  {line}")
    if _count_dir(ROOT / "backend" / "datasets" / "retraining")[0] == 0:
        print("│  [empty]")
    print("└──────────────────────────────────────────────────────────────────┘")

    print()
    print("  ⚠  This is a DRY RUN. Nothing has been changed.")
    print("  ▶  To execute:  python scripts/reset_training_cycle.py --execute")
    print()


# ─── EXECUTE RESET ────────────────────────────────────────────────────────────

def execute_reset():
    log = []

    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║            EXECUTING TRAINING RESET — LIVE RUN                  ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()

    # ── 1. Database ───────────────────────────────────────────────────────────
    print("── STEP 1: Database reset ────────────────────────────────────────")
    if not DB_PATH.exists():
        print("  [SKIP] Database file not found.")
    else:
        con = sqlite3.connect(str(DB_PATH))
        con.execute("PRAGMA foreign_keys = OFF")
        for t in CLEAR_TABLES:
            n_before = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            con.execute(f'DELETE FROM "{t}"')
            log.append(f"  DB: cleared {t} ({n_before} rows removed)")
            print(f"  ✓ Cleared {t:<40}  {n_before} rows removed")
        con.execute("PRAGMA foreign_keys = ON")

        # Seed baseline model version
        onnx_path_str = str(BASELINE_ONNX_PATH) if BASELINE_ONNX_PATH.exists() else None
        con.execute("""
            INSERT INTO model_versions
                (model_name, version, status, accuracy, file_path, created_at)
            VALUES (?, ?, 'active', NULL, ?, ?)
        """, (
            BASELINE_MODEL_NAME,
            BASELINE_MODEL_VERSION,
            onnx_path_str,
            datetime.now(timezone.utc).isoformat(),
        ))
        con.commit()

        # Reclaim space
        con.execute("VACUUM")
        con.close()

        log.append(f"  DB: seeded model_versions with baseline {BASELINE_MODEL_NAME} {BASELINE_MODEL_VERSION}")
        print(f"  ✓ Seeded baseline model version: {BASELINE_MODEL_NAME} {BASELINE_MODEL_VERSION} [active]")

    # ── 2. Filesystem wipe ────────────────────────────────────────────────────
    print()
    print("── STEP 2: Filesystem wipe ───────────────────────────────────────")
    for d in WIPE_DIRS:
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            rel = str(d.relative_to(ROOT))
            log.append(f"  FS: created {rel}")
            print(f"  + Created {rel}")
            continue
        fc, fb = _count_dir(d)
        # Remove contents but keep the directory itself
        for child in d.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        rel = str(d.relative_to(ROOT))
        log.append(f"  FS: wiped {rel} ({fc} files, {fb/1024:.1f} KB)")
        print(f"  \u2713 Wiped  {rel:<42}  {fc} files  {fb/1024:.1f} KB")

    # ── 3. Create required directories ───────────────────────────────────────
    print()
    print("── STEP 3: Ensure required directories exist ─────────────────────")
    for d in REQUIRED_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        # Add .gitkeep so empty dirs are tracked
        gitkeep = d / ".gitkeep"
        if not gitkeep.exists():
            gitkeep.touch()
        print(f"  \u2713 Ready  {str(d.relative_to(ROOT))}")

    # ── 4. Post-reset state report ────────────────────────────────────────────
    print()
    print("── STEP 4: Post-reset state ──────────────────────────────────────")
    if DB_PATH.exists():
        counts = _db_row_counts()
        for t in sorted(counts):
            n = counts[t]
            print(f"  DB  {t:<40} {n:>4} rows")

    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  RESET COMPLETE                                                  ║")
    print("╠══════════════════════════════════════════════════════════════════╣")
    print(f"║  Tables cleared:   {len(CLEAR_TABLES):<46}║")
    print(f"║  Dirs wiped:       {len(WIPE_DIRS):<46}║")
    print(f"║  Baseline seeded:  {BASELINE_MODEL_NAME} {BASELINE_MODEL_VERSION:<32}║")
    print("╠══════════════════════════════════════════════════════════════════╣")
    print("║  NEXT STEPS                                                      ║")
    print("║  1. Add 20-30 images via the Inspection page                    ║")
    print("║  2. Verify predictions on the Verification page                 ║")
    print("║  3. Build Retraining Queue on the Retraining page               ║")
    print("║  4. Start a Retraining Job                                       ║")
    print("║  5. Evaluate candidate, then Promote                            ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()


# ─── MAIN ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Safe training reset for AI Corrosion Detection Platform.")
    parser.add_argument("--execute", action="store_true", help="Actually perform the reset (default: dry-run only)")
    args = parser.parse_args()

    if args.execute:
        execute_reset()
    else:
        dry_run_report()
        sys.exit(0)
