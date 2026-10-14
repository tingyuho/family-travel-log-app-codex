from __future__ import annotations

import json
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from .auth import (
    generate_token,
    hash_password,
    hash_reset_code,
    password_needs_rehash,
    verify_password,
    verify_reset_code,
)
from .db import PASSWORD_RESET_CODE_TTL_MINUTES, SESSION_TTL_DAYS, get_connection, is_postgres
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
    UserProfile,
)


def _serialize_trip_payload(payload: TripCreate | TripUpdate) -> dict[str, Any]:
    data = payload.model_dump(mode="json")
    return {
        "title": data["title"],
        "trip_kind": data.get("trip_kind", "past"),
        "start_date": data["start_date"],
        "end_date": data["end_date"],
        "notes": data["notes"],
        "route_json": json.dumps(data["route"]),
        "people_json": json.dumps(data["people"]),
        "accommodations_json": json.dumps(data["accommodations"]),
        "itinerary_json": json.dumps(data["itinerary"]),
    }


def _row_to_trip(row: Any) -> Trip:
    trip_kind = row["trip_kind"] if "trip_kind" in row.keys() else "past"
    if trip_kind not in {"past", "wishlist"}:
        trip_kind = "past"
    return Trip(
        id=row["id"],
        title=row["title"],
        trip_kind=trip_kind,
        start_date=row["start_date"],
        end_date=row["end_date"],
        notes=row["notes"],
        route=json.loads(row["route_json"]),
        people=json.loads(row["people_json"]),
        accommodations=json.loads(row["accommodations_json"]),
        itinerary=json.loads(row["itinerary_json"] or "[]"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_trips(user_id: str, query: str | None = None, trip_kind: str | None = None) -> list[Trip]:
    sql = "SELECT * FROM trips WHERE user_id = ?"
    params: list[Any] = [user_id]
    if trip_kind in {"past", "wishlist"}:
        sql += " AND trip_kind = ?"
        params.append(trip_kind)
    if query:
        q = f"%{query.strip()}%"
        sql += """
            AND (
                title LIKE ?
                OR notes LIKE ?
                OR people_json LIKE ?
                OR accommodations_json LIKE ?
                OR route_json LIKE ?
                OR itinerary_json LIKE ?
            )
        """
        params.extend([q, q, q, q, q, q])
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
                user_id, title, trip_kind, start_date, end_date, notes, route_json, people_json, accommodations_json, itinerary_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            {returning_clause}
            """,
            (
                user_id,
                data["title"],
                data["trip_kind"],
                data["start_date"],
                data["end_date"],
                data["notes"],
                data["route_json"],
                data["people_json"],
                data["accommodations_json"],
                data["itinerary_json"],
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
            SET title = ?, trip_kind = ?, start_date = ?, end_date = ?, notes = ?, route_json = ?, people_json = ?, accommodations_json = ?, itinerary_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (
                data["title"],
                data["trip_kind"],
                data["start_date"],
                data["end_date"],
                data["notes"],
                data["route_json"],
                data["people_json"],
                data["accommodations_json"],
                data["itinerary_json"],
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
        sort_order=row["sort_order"] or 0,
        created_at=row["created_at"],
    )


def list_people_profiles(user_id: str) -> list[PersonProfile]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, relationship, notes, sort_order, created_at
            FROM people_profiles
            WHERE user_id = ?
            ORDER BY sort_order ASC, LOWER(name) ASC, id ASC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_person(row) for row in rows]


def _next_person_sort_order(user_id: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM people_profiles WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return int((row["max_sort"] if row else 0) or 0) + 1


def _person_name_exists(conn: Any, user_id: str, name: str, exclude_person_id: int | None = None) -> bool:
    sql = "SELECT id FROM people_profiles WHERE user_id = ? AND LOWER(name) = LOWER(?)"
    params: list[Any] = [user_id, name]
    if exclude_person_id is not None:
        sql += " AND id <> ?"
        params.append(exclude_person_id)
    return conn.execute(sql, params).fetchone() is not None


def create_person_profile(user_id: str, payload: PersonProfileCreate) -> PersonProfile:
    data = payload.model_dump(mode="json")
    name = data["name"].strip()
    sort_order = _next_person_sort_order(user_id)
    with get_connection() as conn:
        if _person_name_exists(conn, user_id, name):
            raise ValueError("A profile with that name already exists")
        returning_clause = " RETURNING id" if is_postgres() else ""
        cursor = conn.execute(
            f"""
            INSERT INTO people_profiles (user_id, name, relationship, notes, sort_order)
            VALUES (?, ?, ?, ?, ?)
            {returning_clause}
            """,
            (user_id, name, data["relationship"].strip(), data["notes"].strip(), sort_order),
        )
        person_id = cursor.fetchone()["id"] if is_postgres() else cursor.lastrowid
        row = conn.execute(
            "SELECT id, name, relationship, notes, sort_order, created_at FROM people_profiles WHERE id = ? AND user_id = ?",
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
    new_name = data["name"].strip()
    with get_connection() as conn:
        current_row = conn.execute(
            "SELECT name FROM people_profiles WHERE id = ? AND user_id = ?",
            (person_id, user_id),
        ).fetchone()
        if current_row is None:
            return None
        old_name = (current_row["name"] or "").strip()
        if _person_name_exists(conn, user_id, new_name, exclude_person_id=person_id):
            raise ValueError("A profile with that name already exists")

        cursor = conn.execute(
            """
            UPDATE people_profiles
            SET name = ?, relationship = ?, notes = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                new_name,
                data["relationship"].strip(),
                data["notes"].strip(),
                person_id,
                user_id,
            ),
        )
        if old_name and old_name.lower() != new_name.lower():
            trip_rows = conn.execute(
                """
                SELECT id, people_json
                FROM trips
                WHERE user_id = ? AND people_json LIKE ?
                """,
                (user_id, f"%{old_name}%"),
            ).fetchall()
            for trip_row in trip_rows:
                try:
                    people = json.loads(trip_row["people_json"] or "[]")
                except json.JSONDecodeError:
                    continue
                changed = False
                next_people: list[Any] = []
                for person_name in people:
                    if isinstance(person_name, str) and person_name.strip().lower() == old_name.lower():
                        next_people.append(new_name)
                        changed = True
                    else:
                        next_people.append(person_name)
                if changed:
                    conn.execute(
                        """
                        UPDATE trips
                        SET people_json = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND user_id = ?
                        """,
                        (json.dumps(next_people), trip_row["id"], user_id),
                    )
        row = conn.execute(
            "SELECT id, name, relationship, notes, sort_order, created_at FROM people_profiles WHERE id = ? AND user_id = ?",
            (person_id, user_id),
        ).fetchone()
    if cursor.rowcount == 0 or row is None:
        return None
    return _row_to_person(row)


def reorder_people_profiles(user_id: str, ordered_ids: list[int]) -> list[PersonProfile] | None:
    if not ordered_ids:
        return None
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM people_profiles WHERE user_id = ? ORDER BY sort_order ASC, id ASC",
            (user_id,),
        ).fetchall()
        current_ids = [row["id"] for row in rows]
        if set(current_ids) != set(ordered_ids) or len(current_ids) != len(ordered_ids):
            return None

        for index, person_id in enumerate(ordered_ids, start=1):
            conn.execute(
                "UPDATE people_profiles SET sort_order = ? WHERE id = ? AND user_id = ?",
                (index, person_id, user_id),
            )

    return list_people_profiles(user_id)


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


def create_user(user_id: str, email: str, password: str) -> bool:
    with get_connection() as conn:
        if is_postgres():
            cursor = conn.execute(
                """
                INSERT INTO users (user_id, email, password_hash)
                VALUES (?, ?, ?)
                ON CONFLICT (user_id) DO NOTHING
                """,
                (user_id, email, hash_password(password)),
            )
        else:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO users (user_id, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (user_id, email, hash_password(password)),
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


def create_password_reset_code(user_id: str, code: str) -> str | None:
    with get_connection() as conn:
        user_row = conn.execute(
            "SELECT email FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if user_row is None:
            return None

        email = (user_row["email"] or "").strip()
        if not email:
            return None

        expires_at = datetime.now(UTC) + timedelta(minutes=PASSWORD_RESET_CODE_TTL_MINUTES)
        expires_value = expires_at.isoformat() if is_postgres() else expires_at.strftime("%Y-%m-%d %H:%M:%S")

        conn.execute("DELETE FROM password_reset_codes WHERE expires_at <= CURRENT_TIMESTAMP")
        if is_postgres():
            conn.execute(
                """
                INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
                VALUES (?, ?, ?)
                ON CONFLICT (user_id)
                DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, created_at = CURRENT_TIMESTAMP
                """,
                (user_id, hash_reset_code(code), expires_value),
            )
        else:
            conn.execute(
                """
                INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id)
                DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, created_at = CURRENT_TIMESTAMP
                """,
                (user_id, hash_reset_code(code), expires_value),
            )
        return email


def consume_password_reset_code(user_id: str, code: str) -> bool:
    with get_connection() as conn:
        conn.execute("DELETE FROM password_reset_codes WHERE expires_at <= CURRENT_TIMESTAMP")
        row = conn.execute(
            """
            SELECT code_hash
            FROM password_reset_codes
            WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP
            """,
            (user_id,),
        ).fetchone()
        if row is None or not verify_reset_code(code, row["code_hash"]):
            return False
        conn.execute("DELETE FROM password_reset_codes WHERE user_id = ?", (user_id,))
        return True


def get_user_profile(user_id: str) -> UserProfile | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT user_id, email FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if row is None:
        return None
    return UserProfile(user_id=row["user_id"], email=row["email"] or "")


def update_user_email(user_id: str, email: str) -> UserProfile | None:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET email = ? WHERE user_id = ?",
            (email, user_id),
        )
    if cursor.rowcount == 0:
        return None
    return get_user_profile(user_id)


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


def enforce_rate_limit(bucket_key: str, limit: int, window_seconds: int) -> bool:
    if limit <= 0 or window_seconds <= 0:
        return True

    cutoff = datetime.now(UTC) - timedelta(seconds=window_seconds)
    cutoff_value = cutoff.isoformat() if is_postgres() else cutoff.strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute("DELETE FROM rate_limit_events WHERE created_at <= ?", (cutoff_value,))
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM rate_limit_events WHERE bucket_key = ? AND created_at > ?",
            (bucket_key, cutoff_value),
        ).fetchone()
        count = int((row["count"] if row else 0) or 0)
        if count >= limit:
            return False
        conn.execute("INSERT INTO rate_limit_events (bucket_key) VALUES (?)", (bucket_key,))
    return True


def get_cached_location_search(query: str, limit: int, provider: str) -> list[dict[str, str]] | None:
    cache_key = _location_cache_key(query, limit, provider)
    with get_connection() as conn:
        conn.execute("DELETE FROM location_search_cache WHERE expires_at <= CURRENT_TIMESTAMP")
        row = conn.execute(
            """
            SELECT payload_json
            FROM location_search_cache
            WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP
            """,
            (cache_key,),
        ).fetchone()
    if row is None:
        return None
    try:
        payload = json.loads(row["payload_json"] or "[]")
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, list) else None


def save_location_search_cache(
    query: str,
    limit: int,
    provider: str,
    payload: list[dict[str, str]],
    ttl_seconds: int,
) -> None:
    cache_key = _location_cache_key(query, limit, provider)
    expires_at = datetime.now(UTC) + timedelta(seconds=max(ttl_seconds, 30))
    expires_value = expires_at.isoformat() if is_postgres() else expires_at.strftime("%Y-%m-%d %H:%M:%S")
    payload_json = json.dumps(payload)
    with get_connection() as conn:
        conn.execute("DELETE FROM location_search_cache WHERE expires_at <= CURRENT_TIMESTAMP")
        if is_postgres():
            conn.execute(
                """
                INSERT INTO location_search_cache (cache_key, query_text, limit_value, provider, payload_json, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (cache_key)
                DO UPDATE SET
                    query_text = EXCLUDED.query_text,
                    limit_value = EXCLUDED.limit_value,
                    provider = EXCLUDED.provider,
                    payload_json = EXCLUDED.payload_json,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (cache_key, query.strip().lower(), limit, provider, payload_json, expires_value),
            )
        else:
            conn.execute(
                """
                INSERT INTO location_search_cache (cache_key, query_text, limit_value, provider, payload_json, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key)
                DO UPDATE SET
                    query_text = excluded.query_text,
                    limit_value = excluded.limit_value,
                    provider = excluded.provider,
                    payload_json = excluded.payload_json,
                    expires_at = excluded.expires_at,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (cache_key, query.strip().lower(), limit, provider, payload_json, expires_value),
            )


def _location_cache_key(query: str, limit: int, provider: str) -> str:
    normalized = f"{provider}:{limit}:{query.strip().lower()}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
