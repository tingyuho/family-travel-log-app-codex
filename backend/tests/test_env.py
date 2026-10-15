from __future__ import annotations

import pytest

from backend.app.env import configured_frontend_origins, validate_backend_environment


def test_development_environment_keeps_local_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    validate_backend_environment()


def test_production_requires_postgres_and_explicit_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    monkeypatch.delenv("FRONTEND_ORIGIN_REGEX", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL") as error:
        validate_backend_environment()
    assert "FRONTEND_ORIGINS" in str(error.value)


@pytest.mark.parametrize("origin", ["http://app.example.com", "https://localhost:5173", "https://192.168.1.5"])
def test_production_rejects_unsafe_frontend_origins(monkeypatch: pytest.MonkeyPatch, origin: str) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@db.example.com/app")
    monkeypatch.setenv("FRONTEND_ORIGINS", origin)
    monkeypatch.delenv("FRONTEND_ORIGIN_REGEX", raising=False)
    with pytest.raises(RuntimeError, match="FRONTEND_ORIGINS"):
        validate_backend_environment()


def test_valid_production_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@db.example.com/app")
    monkeypatch.setenv("FRONTEND_ORIGINS", "https://app.example.com/, https://www.example.com")
    monkeypatch.delenv("FRONTEND_ORIGIN_REGEX", raising=False)
    validate_backend_environment()
    assert configured_frontend_origins() == ["https://app.example.com", "https://www.example.com"]
