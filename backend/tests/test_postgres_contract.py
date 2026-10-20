from __future__ import annotations

import os

import pytest
from fastapi import HTTPException

from backend.app import db, main, repository
from backend.app.schemas import PackingTemplateCreate, PersonProfileCreate, TripCreate, TripUpdate, TripStopCreate, UserRegister


pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_TEST_DATABASE_URL"),
    reason="Set POSTGRES_TEST_DATABASE_URL to run opt-in Postgres contract tests.",
)


@pytest.fixture()
def postgres_db(monkeypatch):
    monkeypatch.setattr(db, "DATABASE_URL", os.environ["POSTGRES_TEST_DATABASE_URL"])
    assert db.is_postgres(), "POSTGRES_TEST_DATABASE_URL must be a postgres:// or postgresql:// URL"
    main.startup()
    user_id = "contract_user"
    with db.get_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM password_reset_codes WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM trips WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM people_profiles WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM packing_templates WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    yield user_id
    with db.get_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM password_reset_codes WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM trips WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM people_profiles WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM packing_templates WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))


def test_postgres_core_contract_matches_sqlite_flow(postgres_db):
    user_id = postgres_db
    main.register(UserRegister(user_id=user_id, email="contract@example.com", password="Password123"))

    person = main.post_people_profile(
        PersonProfileCreate(name="TingYu", relationship="Parent"),
        current_user_id=user_id,
    )
    assert person.name == "TingYu"

    trip = main.post_trip(
        TripCreate(
            title="Contract trip",
            trip_kind="past",
            start_date="2026-01-01",
            end_date="2026-01-02",
            notes="",
            route=[{"lat": 47.6062, "lng": -122.3321, "label": "Seattle"}],
            people=["TingYu"],
            accommodations=[],
            itinerary=[],
        ),
        current_user_id=user_id,
    )
    assert trip.id
    assert repository.list_trips(user_id)[0].title == "Contract trip"

    template = main.post_packing_template(
        PackingTemplateCreate(name="Contract packing", items=["Hat", "Hat", "Water"]),
        current_user_id=user_id,
    )
    assert template.items == ["Hat", "Water"]

    assert trip.version == 1
    edited = main.put_trip(trip.id, TripUpdate(**{**trip.model_dump(), "title": "Edited title"}), user_id)
    assert edited.version == 2
    with pytest.raises(HTTPException) as conflict:
        main.put_trip(trip.id, TripUpdate(**{**trip.model_dump(), "title": "Stale edit"}), user_id)
    assert conflict.value.status_code == 409
    stopped = main.post_trip_stop(trip.id, TripStopCreate(point={"lat": 45.5, "lng": -122.6, "label": "Portland"}), user_id)
    assert stopped.version == 3
    assert stopped.title == "Edited title"
    assert len(stopped.route) == 2
