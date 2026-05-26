"""
Query model versions and current inference settings from the database.
"""
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
db_path = ROOT / "corrosion_detection.db"
con = sqlite3.connect(str(db_path))

print("=== MODEL VERSIONS ===")
rows = con.execute(
    "SELECT id, model_name, version, status, accuracy, file_path, created_at FROM model_versions ORDER BY created_at"
).fetchall()
for r in rows:
    print(f"  id={r[0]}  model={r[1]}  ver={r[2]}  status={r[3]}  acc={r[4]}  path={r[5]}")

print()
print("=== SYSTEM SETTINGS (model-related) ===")
rows = con.execute(
    "SELECT key, value FROM system_settings WHERE key LIKE '%model%' OR key LIKE '%current%' OR key LIKE '%active%'"
).fetchall()
for r in rows:
    print(f"  {r[0]} = {r[1]}")

con.close()
