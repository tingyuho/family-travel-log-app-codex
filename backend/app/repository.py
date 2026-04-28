from __future__ import annotations

import json
from typing import Any

from .db import get_connection
from .schemas import PersonProfile, PersonProfileCreate, Trip, TripCreate, TripUpdate


def _serialize_trip_payload(payload: TripCreate | TripUpdate) -> dict[str, Any]:
    data = payload.model_dump(mode="json")
    return {
        "title": data["title"],
        "start_date": data["start_date"],
        "end_date": data["end_date"],
        "notes": data["notes"],
        "route_json": json.dumps(data["route"]),
        "people_json": json.dumps(data["people"]),
        "accommodations_json": json.dumps(data["accommodations"]),
    }


def _row_to_trip(row: Any) -> Trip:
    return Trip(
        id=row["id"],
        title=row["title"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        notes=row["notes"],
        route=json.loads(row["route_json"]),
        people=json.loads(row["people_json"]),
        accommodations=json.loads(row["accommodations_json"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_trips(query: str | None = None) -> list[Trip]:
    sql = "SELECT * FROM trips"
    params: list[Any] = []
    if query:
        q = f"%{query.strip()}%"
        sql += """
            WHERE
                title LIKE ?
                OR notes LIKE ?
                OR people_json LIKE ?
                OR accommodations_json LIKE ?
                OR route_json LIKE ?
        """
        params.extend([q, q, q, q, q])
    sql += " ORDER BY COALESCE(start_date, created_at) DESC, id DESC"

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_trip(row) for row in rows]


def get_trip(trip_id: int) -> Trip | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if row is None:
        return None
    return _row_to_trip(row)


def create_trip(payload: TripCreate) -> Trip:
    data = _serialize_trip_payload(payload)
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO trips (
                title, start_date, end_date, notes, route_json, people_json, accommodations_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["title"],
                data["start_date"],
                data["end_date"],
                data["notes"],
                data["route_json"],
                data["people_json"],
                data["accommodations_json"],
            ),
        )
        trip_id = cursor.lastrowid
    trip = get_trip(trip_id)
    if trip is None:
        raise RuntimeError("Trip could not be created")
    return trip


def update_trip(trip_id: int, payload: TripUpdate) -> Trip | None:
    data = _serialize_trip_payload(payload)
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE trips
            SET title = ?, start_date = ?, end_date = ?, notes = ?, route_json = ?, people_json = ?, accommodations_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                data["title"],
                data["start_date"],
                data["end_date"],
                data["notes"],
                data["route_json"],
                data["people_json"],
                data["accommodations_json"],
                trip_id,
            ),
        )
    if cursor.rowcount == 0:
        return None
    return get_trip(trip_id)


def delete_trip(trip_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
    return cursor.rowcount > 0


def _row_to_person(row: Any) -> PersonProfile:
    return PersonProfile(
        id=row["id"],
        name=row["name"],
        relationship=row["relationship"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


def list_people_profiles() -> list[PersonProfile]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, relationship, notes, created_at
            FROM people_profiles
            ORDER BY LOWER(name) ASC
            """
        ).fetchall()
    return [_row_to_person(row) for row in rows]


def create_person_profile(payload: PersonProfileCreate) -> PersonProfile:
    data = payload.model_dump(mode="json")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO people_profiles (name, relationship, notes)
            VALUES (?, ?, ?)
            """,
            (data["name"].strip(), data["relationship"].strip(), data["notes"].strip()),
        )
        person_id = cursor.lastrowid
        row = conn.execute(
            "SELECT id, name, relationship, notes, created_at FROM people_profiles WHERE id = ?",
            (person_id,),
        ).fetchone()
    if row is None:
        raise RuntimeError("Person profile could not be created")
    return _row_to_person(row)


def delete_person_profile(person_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM people_profiles WHERE id = ?", (person_id,))
    return cursor.rowcount > 0
