from __future__ import annotations

import hashlib
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname or not parsed.path.strip("/"):
        raise SystemExit("DATABASE_URL must be a valid PostgreSQL URL.")

    backup_directory = Path(os.getenv("BACKUP_DIRECTORY", ROOT / "backups")).expanduser().resolve()
    backup_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    destination = backup_directory / f"family-travel-log-{timestamp}.dump"

    pg_env = os.environ.copy()
    pg_env.update(
        {
            "PGHOST": parsed.hostname,
            "PGPORT": str(parsed.port or 5432),
            "PGDATABASE": unquote(parsed.path.lstrip("/")),
            "PGUSER": unquote(parsed.username or ""),
            "PGPASSWORD": unquote(parsed.password or ""),
        }
    )
    sslmode = parse_qs(parsed.query).get("sslmode", [""])[0]
    if sslmode:
        pg_env["PGSSLMODE"] = sslmode

    subprocess.run(
        ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(destination)],
        check=True,
        env=pg_env,
        timeout=1800,
    )
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    checksum = destination.with_suffix(".dump.sha256")
    checksum.write_text(f"{digest}  {destination.name}\n", encoding="utf-8")
    print(f"Created {destination} ({destination.stat().st_size} bytes).")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
