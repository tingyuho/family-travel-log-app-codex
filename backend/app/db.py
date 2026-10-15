from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .auth import hash_password
from .env import load_backend_env, validate_backend_environment

load_backend_env()
validate_backend_environment()

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # Local SQLite development does not require psycopg.
    psycopg = None
    dict_row = None


DB_PATH = Path(__file__).resolve().parent.parent / "travel_log.db"
DATABASE_URL = os.getenv("DATABASE_URL", "")
SEED_USER_ID = os.getenv("SEED_USER_ID", "").strip()
SEED_USER_PASSWORD = os.getenv("SEED_USER_PASSWORD", "")
SEED_CLAIM_LEGACY_RECORDS = os.getenv("SEED_CLAIM_LEGACY_RECORDS", "false").lower() == "true"
SESSION_TTL_DAYS = max(int(os.getenv("SESSION_TTL_DAYS", "30")), 1)
PASSWORD_RESET_CODE_TTL_MINUTES = max(int(os.getenv("PASSWORD_RESET_CODE_TTL_MINUTES", "15")), 1)
DatabaseIntegrityError = (sqlite3.IntegrityError,) + (
    (psycopg.IntegrityError,) if psycopg is not None else ()
)


def is_postgres() -> bool:
    return DATABASE_URL.startswith(("postgresql://", "postgres://"))


def _convert_placeholders(sql: str) -> str:
    return sql.replace("?", "%s") if is_postgres() else sql


class DatabaseConnection:
    def __init__(self) -> None:
        if is_postgres():
            if psycopg is None or dict_row is None:
                raise RuntimeError("DATABASE_URL is set, but psycopg is not installed")
            self._conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            self._conn = sqlite3.connect(DB_PATH)
            self._conn.row_factory = sqlite3.Row

    def __enter__(self) -> "DatabaseConnection":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> Any:
        return self._conn.execute(_convert_placeholders(sql), tuple(params))


def get_connection() -> DatabaseConnection:
    return DatabaseConnection()


def _has_column(conn: DatabaseConnection, table_name: str, column_name: str) -> bool:
    if is_postgres():
        row = conn.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ?
              AND column_name = ?
            """,
            (table_name, column_name),
        ).fetchone()
        return row is not None
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in rows)


def _create_tables(conn: DatabaseConnection) -> None:
    if is_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                user_id TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trips (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                trip_kind TEXT NOT NULL DEFAULT 'past',
                start_date DATE,
                end_date DATE,
                notes TEXT NOT NULL DEFAULT '',
                route_json TEXT NOT NULL DEFAULT '[]',
                people_json TEXT NOT NULL DEFAULT '[]',
                accommodations_json TEXT NOT NULL DEFAULT '[]',
                itinerary_json TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS people_profiles (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                relationship TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS packing_templates (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                items_json TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rate_limit_events (
                id SERIAL PRIMARY KEY,
                bucket_key TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS location_search_cache (
                cache_key TEXT PRIMARY KEY,
                query_text TEXT NOT NULL,
                limit_value INTEGER NOT NULL,
                provider TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            email TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            user_id TEXT PRIMARY KEY,
            code_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            trip_kind TEXT NOT NULL DEFAULT 'past',
            start_date TEXT,
            end_date TEXT,
            notes TEXT NOT NULL DEFAULT '',
            route_json TEXT NOT NULL DEFAULT '[]',
            people_json TEXT NOT NULL DEFAULT '[]',
            accommodations_json TEXT NOT NULL DEFAULT '[]',
            itinerary_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS people_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            relationship TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS packing_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            items_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rate_limit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS location_search_cache (
            cache_key TEXT PRIMARY KEY,
            query_text TEXT NOT NULL,
            limit_value INTEGER NOT NULL,
            provider TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _seed_user(conn: DatabaseConnection) -> None:
    if not SEED_USER_ID and not SEED_USER_PASSWORD:
        return
    if not SEED_USER_ID or not SEED_USER_PASSWORD:
        raise RuntimeError("Both SEED_USER_ID and SEED_USER_PASSWORD are required when seeding a user")

    if is_postgres():
        conn.execute(
            """
            INSERT INTO users (user_id, password_hash)
            VALUES (?, ?)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (SEED_USER_ID, hash_password(SEED_USER_PASSWORD)),
        )
    else:
        conn.execute(
            """
            INSERT OR IGNORE INTO users (user_id, password_hash)
            VALUES (?, ?)
            """,
            (SEED_USER_ID, hash_password(SEED_USER_PASSWORD)),
        )

    if SEED_CLAIM_LEGACY_RECORDS:
        conn.execute("UPDATE trips SET user_id = ? WHERE user_id = '' OR user_id IS NULL", (SEED_USER_ID,))
        conn.execute(
            "UPDATE people_profiles SET user_id = ? WHERE user_id = '' OR user_id IS NULL",
            (SEED_USER_ID,),
        )
        conn.execute(
            "UPDATE packing_templates SET user_id = ? WHERE user_id = '' OR user_id IS NULL",
            (SEED_USER_ID,),
        )


def init_db() -> None:
    with get_connection() as conn:
        _create_tables(conn)

        # Migrate older DBs that didn't have user ownership columns.
        if not _has_column(conn, "trips", "user_id"):
            conn.execute("ALTER TABLE trips ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
        if not _has_column(conn, "trips", "trip_kind"):
            conn.execute("ALTER TABLE trips ADD COLUMN trip_kind TEXT NOT NULL DEFAULT 'past'")
        if not _has_column(conn, "trips", "itinerary_json"):
            conn.execute("ALTER TABLE trips ADD COLUMN itinerary_json TEXT NOT NULL DEFAULT '[]'")
        if not _has_column(conn, "users", "email"):
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''")
        if not _has_column(conn, "people_profiles", "user_id"):
            conn.execute("ALTER TABLE people_profiles ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
        if not _has_column(conn, "people_profiles", "sort_order"):
            conn.execute("ALTER TABLE people_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        if not _has_column(conn, "packing_templates", "user_id"):
            conn.execute("ALTER TABLE packing_templates ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
        if not _has_column(conn, "user_sessions", "expires_at"):
            if is_postgres():
                conn.execute("ALTER TABLE user_sessions ADD COLUMN expires_at TIMESTAMPTZ")
            else:
                conn.execute("ALTER TABLE user_sessions ADD COLUMN expires_at TEXT")

        # Backfill session expiration for legacy rows.
        if is_postgres():
            conn.execute(
                """
                UPDATE user_sessions
                SET expires_at = created_at + (? * INTERVAL '1 day')
                WHERE expires_at IS NULL
                """,
                (SESSION_TTL_DAYS,),
            )
            conn.execute(
                """
                UPDATE trips
                SET trip_kind = CASE
                    WHEN COALESCE(start_date::text, '') = '' AND COALESCE(end_date::text, '') = '' THEN 'wishlist'
                    ELSE 'past'
                END
                WHERE trip_kind IS NULL OR trip_kind = '' OR trip_kind NOT IN ('past', 'wishlist')
                """
            )
            conn.execute(
                """
                UPDATE trips
                SET trip_kind = 'wishlist'
                WHERE trip_kind = 'past'
                  AND COALESCE(start_date::text, '') = ''
                  AND COALESCE(end_date::text, '') = ''
                """
            )
            conn.execute(
                """
                WITH ranked AS (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY sort_order ASC, created_at ASC, id ASC) AS rn
                    FROM people_profiles
                )
                UPDATE people_profiles p
                SET sort_order = ranked.rn
                FROM ranked
                WHERE p.id = ranked.id
                """
            )
        else:
            fallback_expiry = (datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                """
                UPDATE user_sessions
                SET expires_at = ?
                WHERE expires_at IS NULL
                """,
                (fallback_expiry,),
            )
            conn.execute(
                """
                UPDATE trips
                SET trip_kind = CASE
                    WHEN IFNULL(start_date, '') = '' AND IFNULL(end_date, '') = '' THEN 'wishlist'
                    ELSE 'past'
                END
                WHERE IFNULL(trip_kind, '') = '' OR trip_kind NOT IN ('past', 'wishlist')
                """
            )
            conn.execute(
                """
                UPDATE trips
                SET trip_kind = 'wishlist'
                WHERE trip_kind = 'past'
                  AND IFNULL(start_date, '') = ''
                  AND IFNULL(end_date, '') = ''
                """
            )
            rows = conn.execute(
                """
                SELECT id, user_id
                FROM people_profiles
                ORDER BY user_id ASC, sort_order ASC, created_at ASC, id ASC
                """
            ).fetchall()
            current_user = None
            rank = 0
            for row in rows:
                user_id = row["user_id"]
                if user_id != current_user:
                    current_user = user_id
                    rank = 1
                else:
                    rank += 1
                conn.execute(
                    "UPDATE people_profiles SET sort_order = ? WHERE id = ?",
                    (rank, row["id"]),
                )

        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_people_profiles_user_name ON people_profiles(user_id, name)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_templates_user_name ON packing_templates(user_id, name)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_user_kind ON trips(user_id, trip_kind)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_people_profiles_user ON people_profiles(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_people_profiles_user_sort ON people_profiles(user_id, sort_order)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_packing_templates_user ON packing_templates(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_created ON rate_limit_events(bucket_key, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_location_search_cache_expires ON location_search_cache(expires_at)")

        _seed_user(conn)
