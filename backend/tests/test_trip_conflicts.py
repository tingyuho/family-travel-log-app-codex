import pytest
from fastapi import HTTPException
from backend.app import db, main, repository
from backend.app.schemas import TripCreate, TripUpdate

@pytest.fixture()
def saved_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "conflicts.db")
    monkeypatch.setattr(db, "DATABASE_URL", "")
    main.startup()
    return repository.create_trip("review", TripCreate(title="Original title"))

def test_stale_edit_cannot_overwrite_a_newer_trip(saved_trip):
    draft = saved_trip.model_dump()
    first = main.put_trip(saved_trip.id, TripUpdate(**{**draft, "title": "Updated title"}), "review")
    with pytest.raises(HTTPException) as error:
        main.put_trip(saved_trip.id, TripUpdate(**{**draft, "notes": "Stale edit"}), "review")
    assert error.value.status_code == 409
    current = repository.get_trip("review", saved_trip.id)
    assert current.title == "Updated title"
    assert current.notes == ""
    assert first.version == saved_trip.version + 1

def test_legacy_edit_requires_reload_instead_of_silently_overwriting(saved_trip):
    with pytest.raises(HTTPException) as error:
        main.put_trip(saved_trip.id, TripUpdate(title="Unversioned edit"), "review")
    assert error.value.status_code == 428
    assert repository.get_trip("review", saved_trip.id).title == "Original title"


def test_stop_preserves_newer_fields_and_retries_a_rejected_write(saved_trip, monkeypatch):
    from backend.app.schemas import TripStopCreate
    original_update = repository.update_trip
    calls = 0

    def racing_update(user, trip_id, payload):
        nonlocal calls
        calls += 1
        if calls == 1:
            original_update(user, trip_id, TripUpdate(**{**saved_trip.model_dump(), "title": "Edited elsewhere", "notes": "Keep me"}))
        return original_update(user, trip_id, payload)

    monkeypatch.setattr(repository, "update_trip", racing_update)
    payload = TripStopCreate(point={"lat": 45.5, "lng": -122.6, "label": "Museum"}, itinerary_event={"date": "2026-10-19", "activity": "Museum", "notes": "Tickets"})
    saved = main.post_trip_stop(saved_trip.id, payload, "review")
    assert calls == 2
    assert saved.title == "Edited elsewhere"
    assert saved.notes == "Keep me"
    assert len(saved.route) == 1 and saved.route[0].order == 0
    assert len(saved.itinerary) == 1
    assert saved.version == saved_trip.version + 2
    with pytest.raises(HTTPException) as error:
        main.post_trip_stop(saved_trip.id, payload, "another-user")
    assert error.value.status_code == 404


def test_existing_database_gets_versions_without_losing_trips(saved_trip):
    with db.get_connection() as conn:
        conn.execute("ALTER TABLE trips DROP COLUMN version")
    db.init_db()
    restored = repository.get_trip("review", saved_trip.id)
    assert restored.title == saved_trip.title
    assert restored.version == 1
    db.init_db()
    assert repository.get_trip("review", saved_trip.id).version == 1
