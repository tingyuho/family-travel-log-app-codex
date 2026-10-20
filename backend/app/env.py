from __future__ import annotations

import ipaddress
import os
from pathlib import Path
from urllib.parse import urlparse


def load_backend_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def app_environment() -> str:
    return os.getenv("APP_ENV", "development").strip().lower()


def is_production_environment() -> bool:
    return app_environment() == "production"


def configured_frontend_origins() -> list[str]:
    return [origin.strip().rstrip("/") for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()]


def validate_backend_environment() -> None:
    if not is_production_environment():
        return

    errors: list[str] = []
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url.startswith(("postgresql://", "postgres://")):
        errors.append("DATABASE_URL must be a PostgreSQL connection URL")

    origins = configured_frontend_origins()
    if not origins:
        errors.append("FRONTEND_ORIGINS must list at least one deployed HTTPS browser origin")
    else:
        for origin in origins:
            error = _production_origin_error(origin)
            if error:
                errors.append(f"FRONTEND_ORIGINS entry {origin!r} {error}")

    if os.getenv("FRONTEND_ORIGIN_REGEX", "").strip():
        errors.append("FRONTEND_ORIGIN_REGEX is not allowed in production; use explicit FRONTEND_ORIGINS")

    if errors:
        details = "\n".join(f"- {error}" for error in errors)
        raise RuntimeError(f"Invalid production backend configuration:\n{details}")


def _production_origin_error(origin: str) -> str:
    parsed = urlparse(origin)
    if parsed.scheme != "https":
        return "must use HTTPS"
    if not parsed.hostname or parsed.username or parsed.password:
        return "must be a valid origin without credentials"
    if parsed.path not in ("", "/") or parsed.params or parsed.query or parsed.fragment:
        return "must contain only scheme, host, and optional port"

    hostname = parsed.hostname.lower()
    if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
        return "must not use a local hostname"
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return ""
    if not address.is_global:
        return "must not use a private or loopback address"
    return ""
