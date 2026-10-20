from __future__ import annotations

import asyncio
import json
import logging.config
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.app import db, main, repository
from backend.app.operations import LOGGER, OperationsMiddleware
from backend.app.schemas import (
    PackingTemplateCreate,
    PackingTemplateUpdate,
    PasswordResetEmailRequest,
    PasswordResetRequest,
    PersonProfileCreate,
    PersonProfileReorder,
    TripCreate,
    TripUpdate,
    UserLogin,
    UserRegister,
)


def fake_request(ip: str = "127.0.0.1"):
    return SimpleNamespace(headers={}, client=SimpleNamespace(host=ip))


@pytest.fixture()
def sqlite_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test_travel_log.db")
    monkeypatch.setattr(db, "DATABASE_URL", "")
    main.startup()
    yield


def register_user(user_id: str = "tester", email: str = "tester@example.com", password: str = "Password123"):
    return main.register(UserRegister(user_id=user_id, email=email, password=password))


def auth_user(user_id: str = "tester", password: str = "Password123"):
    return main.login(UserLogin(user_id=user_id, password=password), fake_request())


def sample_trip(title: str = "Beach trip"):
    return TripCreate(
        title=title,
        trip_kind="past",
        start_date="2026-06-01",
        end_date="2026-06-03",
        notes="Bring sunscreen",
        route=[{"lat": 47.6062, "lng": -122.3321, "label": "Seattle"}],
        people=["TingYu"],
        accommodations=[{"name": "Hotel", "location": "Downtown"}],
        itinerary=[{"date": "2026-06-01", "activity": "Arrive", "location": "Airport"}],
    )


def test_operational_headers_request_id_and_release(monkeypatch):
    monkeypatch.setenv("RELEASE_SHA", "0123456789abcdef")
    response = run_operations_request("release-check-123")
    headers = dict(response[0]["headers"])

    assert main.health() == {"status": "ok", "release": "0123456789ab"}
    assert headers[b"x-request-id"] == b"release-check-123"
    assert headers[b"x-content-type-options"] == b"nosniff"
    assert headers[b"x-frame-options"] == b"DENY"
    assert headers[b"cache-control"] == b"no-store"


def test_invalid_request_id_is_replaced():
    response = run_operations_request("bad request id with spaces")
    request_id = dict(response[0]["headers"])[b"x-request-id"]
    assert request_id != b"bad request id with spaces"
    assert len(request_id) == 32


def test_production_request_logs_emit_json_without_query_data(capsys):
    previous = (LOGGER.handlers[:], LOGGER.level, LOGGER.propagate)
    config = json.loads((Path(__file__).parents[1] / "logging.json").read_text())
    try:
        logging.config.dictConfig(config)
        run_operations_request("logging-test", query_string=b"token=private-query-value")
        output = capsys.readouterr().out
        event = json.loads(output)
        assert event["request_id"] == "logging-test"
        assert event["status"] == 200
        assert event["path"] == "/health"
        assert "private-query-value" not in output
    finally:
        LOGGER.handlers, LOGGER.level, LOGGER.propagate = previous


def run_operations_request(request_id: str, query_string: bytes = b""):
    messages = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/health",
        "query_string": query_string,
        "headers": [(b"x-request-id", request_id.encode("ascii"))],
    }
    asyncio.run(OperationsMiddleware(app)(scope, receive, send))
    return messages


def test_auth_register_login_and_rate_limit(sqlite_db, monkeypatch):
    monkeypatch.setattr(main, "AUTH_LOGIN_RATE_LIMIT_PER_MINUTE", 2)
    register_user()

    token = auth_user()
    assert token.user_id == "tester"
    assert token.token

    with pytest.raises(HTTPException) as exc:
        main.login(UserLogin(user_id="tester", password="wrongpass"), fake_request("10.0.0.7"))
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as exc:
        main.login(UserLogin(user_id="tester", password="wrongpass"), fake_request("10.0.0.7"))
    assert exc.value.status_code == 429


def test_trip_crud_is_user_scoped(sqlite_db):
    register_user()
    trip = main.post_trip(sample_trip(), current_user_id="tester")
    assert trip.title == "Beach trip"

    updated = main.put_trip(
        trip.id,
        TripUpdate(**{**sample_trip("Beach trip updated").model_dump(), "notes": "Updated", "version": trip.version}),
        current_user_id="tester",
    )
    assert updated.title == "Beach trip updated"

    assert main.get_trip_by_id(trip.id, current_user_id="tester").notes == "Updated"
    assert len(main.get_trips(q=None, trip_kind=None, current_user_id="tester")) == 1

    with pytest.raises(HTTPException) as exc:
        main.get_trip_by_id(trip.id, current_user_id="someone_else")
    assert exc.value.status_code == 404

    response = main.remove_trip(trip.id, current_user_id="tester")
    assert response.status_code == 204
    assert main.get_trips(q=None, trip_kind=None, current_user_id="tester") == []


def test_people_reorder(sqlite_db):
    register_user()
    first = main.post_people_profile(PersonProfileCreate(name="Ava", relationship="Kid"), current_user_id="tester")
    second = main.post_people_profile(PersonProfileCreate(name="Ben", relationship="Kid"), current_user_id="tester")

    ordered = main.put_people_profile_order(
        PersonProfileReorder(ordered_ids=[second.id, first.id]),
        current_user_id="tester",
    )
    assert [person.id for person in ordered] == [second.id, first.id]
    assert [person.name for person in main.get_people_profiles(current_user_id="tester")] == ["Ben", "Ava"]


def test_packing_template_crud(sqlite_db):
    register_user()
    created = main.post_packing_template(
        PackingTemplateCreate(name="Beach", items=["Hat", "Hat", "Sunscreen"]),
        current_user_id="tester",
    )
    assert created.items == ["Hat", "Sunscreen"]

    updated = main.put_packing_template(
        created.id,
        PackingTemplateUpdate(name="Beach bag", items=["Water"]),
        current_user_id="tester",
    )
    assert updated.name == "Beach bag"
    assert updated.items == ["Water"]

    assert main.remove_packing_template(created.id, current_user_id="tester").status_code == 204
    assert main.get_packing_templates(current_user_id="tester") == []


def test_password_reset_uses_salted_hash_and_rate_limits(sqlite_db, monkeypatch):
    monkeypatch.setattr(main, "PASSWORD_RESET_RATE_LIMIT_PER_MINUTE", 4)
    monkeypatch.setattr(main, "is_mailer_configured", lambda: True)
    monkeypatch.setattr(main, "send_password_reset_email", lambda email, user_id, code: None)
    monkeypatch.setattr(main, "generate_reset_code", lambda: "123456")
    register_user()

    response = main.request_password_reset(PasswordResetEmailRequest(user_id="tester"), fake_request("10.0.0.9"))
    assert response.status_code == 204

    with db.get_connection() as conn:
        row = conn.execute("SELECT code_hash FROM password_reset_codes WHERE user_id = ?", ("tester",)).fetchone()
    assert row is not None
    assert row["code_hash"].startswith("reset_scrypt_sha256$")
    assert row["code_hash"] != "123456"

    reset_response = main.reset_password(
        PasswordResetRequest(user_id="tester", email_code="123456", new_password="NewPassword123", reset_key=""),
        fake_request("10.0.0.9"),
    )
    assert reset_response.status_code == 204
    assert repository.authenticate_user("tester", "NewPassword123")


def test_password_reset_admin_key_disabled_by_default(sqlite_db, monkeypatch):
    monkeypatch.setattr(main, "PASSWORD_RESET_KEY", "secret")
    monkeypatch.setattr(main, "PASSWORD_RESET_ADMIN_KEY_ENABLED", False)
    register_user()

    with pytest.raises(HTTPException) as exc:
        main.reset_password(
            PasswordResetRequest(user_id="tester", email_code="000000", new_password="NewPassword123", reset_key="secret"),
            fake_request("10.0.0.11"),
        )
    assert exc.value.status_code == 403


def test_location_search_uses_google_places_cache_and_handles_provider_errors(sqlite_db, monkeypatch):
    monkeypatch.setattr(main, "GEOCODER_PROVIDER", main.GOOGLE_PLACES_PROVIDER)
    register_user()
    calls = {"count": 0}

    def fake_fetch(query: str, limit: int):
        calls["count"] += 1
        return [
            {
                "place_id": "seattle",
                "display_name": "Seattle, King County, Washington, United States",
                "lat": "47.6062",
                "lon": "-122.3321",
            }
        ]

    monkeypatch.setattr(main, "_fetch_google_places", fake_fetch)
    first = main.search_locations(fake_request(), q="Seattle", limit=3, current_user_id="tester")
    second = main.search_locations(fake_request(), q="Seattle", limit=3, current_user_id="tester")

    assert calls["count"] == 1
    assert first[0].display_name.startswith("Seattle")
    assert second[0].lat == "47.6062"

    def failing_fetch(query: str, limit: int):
        raise HTTPException(status_code=502, detail="provider down")

    monkeypatch.setattr(main, "_fetch_google_places", failing_fetch)
    with pytest.raises(HTTPException) as exc:
        main.search_locations(fake_request(), q="Portland", limit=3, current_user_id="tester")
    assert exc.value.status_code == 502


def test_location_search_rate_limit(sqlite_db, monkeypatch):
    monkeypatch.setattr(main, "GEOCODER_PROVIDER", main.GOOGLE_PLACES_PROVIDER)
    monkeypatch.setattr(main, "GEOCODER_RATE_LIMIT_PER_MINUTE", 1)
    register_user()
    monkeypatch.setattr(
        main,
        "_fetch_google_places",
        lambda query, limit: [{"place_id": "1", "display_name": "One", "lat": "1", "lon": "2"}],
    )

    main.search_locations(fake_request("10.0.0.20"), q="One", limit=1, current_user_id="tester")
    with pytest.raises(HTTPException) as exc:
        main.search_locations(fake_request("10.0.0.20"), q="Two", limit=1, current_user_id="tester")
    assert exc.value.status_code == 429
