from __future__ import annotations

import argparse
import hashlib
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a custom-format PostgreSQL backup without restoring it.")
    parser.add_argument("backup", type=Path)
    args = parser.parse_args()
    backup = args.backup.expanduser().resolve()
    if not backup.is_file():
        raise SystemExit(f"Backup does not exist: {backup}")

    result = subprocess.run(
        ["pg_restore", "--list", str(backup)],
        check=True,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if "TABLE DATA" not in result.stdout or "SCHEMA" not in result.stdout:
        raise SystemExit("Backup archive is readable but does not contain expected schema and table data entries.")
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    print(f"Backup archive is readable ({backup.stat().st_size} bytes, SHA-256 {digest}).")


if __name__ == "__main__":
    main()
