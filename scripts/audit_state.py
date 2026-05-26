"""
audit_state.py — Pre-reset audit of database and filesystem state.
Run with:  python scripts/audit_state.py
"""
import sqlite3
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# ── Database audit ────────────────────────────────────────────────────────────
print("=" * 60)
print("DATABASE AUDIT")
print("=" * 60)

db_path = ROOT / "corrosion_detection.db"
if not db_path.exists():
    print(f"  DB not found at {db_path}")
else:
    print(f"  DB size: {db_path.stat().st_size / 1024:.1f} KB")
    con = sqlite3.connect(str(db_path))
    q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    tables = [r[0] for r in con.execute(q).fetchall()]
    total_rows = 0
    for t in tables:
        n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        print(f"  {t:<40} {n:>6} rows")
        total_rows += n
    print(f"  {'TOTAL':<40} {total_rows:>6} rows")
    con.close()

# ── Filesystem audit ──────────────────────────────────────────────────────────
print()
print("=" * 60)
print("FILESYSTEM AUDIT")
print("=" * 60)

scan_dirs = [
    ROOT / "backend" / "datasets" / "retraining",
    ROOT / "backend" / "models" / "checkpoints",
    ROOT / "backend" / "models" / "exports",
    ROOT / "backend" / "models" / "evaluation",
    ROOT / "backend" / "models" / "onnx",
    ROOT / "uploads",
    ROOT / "reports",
    ROOT / "plots",
    ROOT / "logs",
]

total_files = 0
total_bytes = 0

for d in scan_dirs:
    if not d.exists():
        print(f"  {d.relative_to(ROOT)}  [does not exist]")
        continue
    files = list(d.rglob("*"))
    files = [f for f in files if f.is_file()]
    size_bytes = sum(f.stat().st_size for f in files)
    total_files += len(files)
    total_bytes += size_bytes
    rel = str(d.relative_to(ROOT))
    print(f"  {rel:<45} {len(files):>4} files  {size_bytes/1024:>9.1f} KB")

print(f"  {'TOTAL':<45} {total_files:>4} files  {total_bytes/1024:>9.1f} KB")
