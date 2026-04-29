from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from .auth import generate_token, hash_password, password_needs_rehash, verify_password
from .db import SESSION_TTL_DAYS, get_connection, is_postgres
from .schemas import (
    PackingTemplate,
    PackingTemplateCreate,
    PackingTemplateUpdate,
    PersonProfile,
    PersonProfileCreate,
    PersonProfileUpdate,
    Trip,
    TripCreate,
    TripUpdate,
)


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


def list_trips(user_id: str, query: str | None = None) -> list[Trip]:
    sql = "SELECT * FROM trips WHERE user_id = ?"
    params: list[Any] = [user_id]
    if query:
        q = f"%{query.strip()}%"
        sql += """
            AND (
                title LIKE ?
                OR notes LIKE ?
                OR people_json LIKE ?
                OR accommodations_json LIKE ?
                OR route_json LIKE ?
            )
        """
        params.extend([q, q, q, q, q])
    sql += " ORDER BY COALESCE(start_date, created_at) DESC, id DESC"

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_trip(row) for row in rows]


def get_trip(user_id: str, trip_id: int) -> Trip | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM trips WHERE id = ? AND user_id = ?",
            (trip_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return _row_to_trip(row)


def create_trip(user_id: str, payload: TripCreate) -> Trip:
    data = _serialize_trip_payload(payload)
    with get_connection() as conn:
        returning_clause = " RETURNING id" if is_postgres() else ""
        cursor = conn.execute(
            f"""
            INSERT INTO trips (
                user_id, title, start_date, end_date, notes, route_json, people_json, accommodations_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            {returning_clause}
            """,
            (
                user_id,
                data["title"],
                data["start_date"],
                data["end_date"],
                data["notes"],
                data["route_json"],
                data["people_json"],
                data["accommodations_json"],
            ),
        )
        trip_id = cursor.fetchone()["id"] if is_postgres() else cursor.lastrowid
    trip = get_trip(user_id, trip_id)
    if trip is None:
        raise RuntimeError("Trip could not be created")
    return trip


def update_trip(user_id: str, trip_id: int, payload: TripUpdate) -> Trip | None:
    data = _serialize_trip_payload(payload)
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE trips
            SET title = ?, start_date = ?, end_date = ?, notes = ?, route_json = ?, people_json = ?, accommodations_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
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
                user_id,
            ),
        )
    if cursor.rowcount == 0:
        return None
    return get_trip(user_id, trip_id)


def delete_trip(user_id: str, trip_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
    return cursor.rowcount > 0


def _row_to_person(row: Any) -> PersonProfile:
    return PersonProfile(
        id=row["id"],
        name=row["name"],
        relationship=row["relationship"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


def list_people_profiles(user_id: str) -> list[PersonProfile]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, relationship, notes, created_at
            FROM people_profiles
            WHERE user_id = ?
            ORDER BY LOWER(name) ASC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_person(row) for row in rows]


def create_person_profile(user_id: str, payload: PersonProfileCreate) -> PersonProfile:
    data = payload.model_dump(mode="json")
    with get_connection() as conn:
        returning_clause = " RETURNING id" if is_postgres() else ""
        cursor = conn.execute(
            f"""
            INSERT INTO people_profiles (user_id, name, relationship, notes)
            VALUES (?, ?, ?, ?)
            {returning_clause}
            """,
            (user_id, data["name"].strip(), data["relationship"].strip(), data["notes"].strip()),
        )
        person_id = cursor.fetchone()["id"] if is_postgres() else cursor.lastrowid
        row = conn.execute(
            "SELECT id, name, relationship, notes, created_at FROM people_profiles WHERE id = ? AND user_id = ?",
            (person_id, user_id),
        ).fetchone()
    if row is None:
        raise RuntimeError("Person profile could not be created")
    return _row_to_person(row)


def delete_person_profile(user_id: str, person_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM people_profiles WHERE id = ? AND user_id = ?",
            (person_id, user_id),
        )
    return cursor.rowcount > 0


def update_person_profile(user_id: str, person_id: int, payload: PersonProfileUpdate) -> PersonProfile | None:
    data = payload.model_dump(mode="json")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE people_profiles
            SET name = ?, relationship = ?, notes = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                data["name"].strip(),
                data["relationship"].strip(),
                data["notes"].strip(),
                person_id,
                user_id,
            ),
        )
        row = conn.execute(
            "SELECT id, name, relationship, notes, created_at FROM people_profiles WHERE id = ? AND user_id = ?",
            (person_id, user_id),
        ).fetchone()
    if cursor.rowcount == 0 or row is None:
        return None
    return _row_to_person(row)


def _row_to_packing_template(row: Any) -> PackingTemplate:
    return PackingTemplate(
        id=row["id"],
        name=row["name"],
        items=json.loads(row["items_json"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _clean_packing_items(items: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for item in items:
        value = item.strip()
        key = value.lower()
        if value and key not in seen:
            cleaned.append(value)
            seen.add(key)
    return cleaned


def list_packing_templates(user_id: str) -> list[PackingTemplate]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, items_json, created_at, updated_at
            FROM packing_templates
            WHERE user_id = ?
            ORDER BY LOWER(name) ASC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_packing_template(row) for row in rows]


def create_packing_template(user_id: str, payload: PackingTemplateCreate) -> PackingTemplate:
    data = payload.model_dump(mode="json")
    items = _clean_packing_items(data["items"])
    with get_connection() as conn:
        returning_clause = " RETURNING id" if is_postgres() else ""
        cursor = conn.execute(
            f"""
            INSERT INTO packing_templates (user_id, name, items_json)
            VALUES (?, ?, ?)
            {returning_clause}
            """,
            (user_id, data["name"].strip(), json.dumps(items)),
        )
        template_id = cursor.fetchone()["id"] if is_postgres() else cursor.lastrowid
        row = conn.execute(
            """
            SELECT id, name, items_json, created_at, updated_at
            FROM packing_templates
            WHERE id = ? AND user_id = ?
            """,
            (template_id, user_id),
        ).fetchone()
    if row is None:
        raise RuntimeError("Packing template could not be created")
    return _row_to_packing_template(row)


def update_packing_template(
    user_id: str,
    template_id: int,
    payload: PackingTemplateUpdate,
) -> PackingTemplate | None:
    data = payload.model_dump(mode="json")
    items = _clean_packing_items(data["items"])
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE packing_templates
            SET name = ?, items_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (data["name"].strip(), json.dumps(items), template_id, user_id),
        )
        row = conn.execute(
            """
            SELECT id, name, items_json, created_at, updated_at
            FROM packing_templates
            WHERE id = ? AND user_id = ?
            """,
            (template_id, user_id),
        ).fetchone()
    if cursor.rowcount == 0 or row is None:
        return None
    return _row_to_packing_template(row)


def delete_packing_template(user_id: str, template_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM packing_templates WHERE id = ? AND user_id = ?",
            (template_id, user_id),
        )
    return cursor.rowcount > 0


def create_user(user_id: str, password: str) -> bool:
    with get_connection() as conn:
        if is_postgres():
            cursor = conn.execute(
                """
                INSERT INTO users (user_id, password_hash)
                VALUES (?, ?)
                ON CONFLICT (user_id) DO NOTHING
                """,
                (user_id, hash_password(password)),
            )
        else:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO users (user_id, password_hash)
                VALUES (?, ?)
                """,
                (user_id, hash_password(password)),
            )
    return cursor.rowcount > 0


def authenticate_user(user_id: str, password: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            return False
        password_hash = row["password_hash"]
        if not verify_password(password, password_hash):
            return False
        if password_needs_rehash(password_hash):
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE user_id = ?",
                (hash_password(password), user_id),
            )
        return True


def reset_user_password(user_id: str, new_password: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET password_hash = ? WHERE user_id = ?",
            (hash_password(new_password), user_id),
        )
        if cursor.rowcount == 0:
            return False
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        return True


def create_session(user_id: str) -> str:
    token = generate_token()
    expires_at = datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS)
    expires_value = expires_at.isoformat() if is_postgres() else expires_at.strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
            """,
            (token, user_id, expires_value),
        )
    return token


def get_user_by_token(token: str) -> str | None:
    with get_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
        row = conn.execute(
            "SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP",
            (token,),
        ).fetchone()
    if row is None:
        return None
    return row["user_id"]


def revoke_session(token: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
    return cursor.rowcount > 0
