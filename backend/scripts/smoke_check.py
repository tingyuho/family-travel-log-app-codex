from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app, health, health_db, startup


def main() -> None:
    startup()

    payload = health()
    assert payload.get("status") == "ok", f"Unexpected /health payload: {payload}"

    db_payload = health_db()
    assert db_payload.get("status") == "ok", f"Unexpected /health/db payload: {db_payload}"

    openapi = app.openapi()
    assert "paths" in openapi, "OpenAPI payload missing paths"
    for path in ("/health", "/health/db", "/api/auth/login", "/api/trips"):
        assert path in openapi["paths"], f"OpenAPI payload missing {path}"

    print("Backend API smoke check passed.")


if __name__ == "__main__":
    main()
