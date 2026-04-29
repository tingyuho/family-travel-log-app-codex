from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .auth import hash_password

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
            CREATE TABLE IF NOT EXISTS trips (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                start_date DATE,
                end_date DATE,
                notes TEXT NOT NULL DEFAULT '',
                route_json TEXT NOT NULL DEFAULT '[]',
                people_json TEXT NOT NULL DEFAULT '[]',
                accommodations_json TEXT NOT NULL DEFAULT '[]',
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
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
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
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            notes TEXT NOT NULL DEFAULT '',
            route_json TEXT NOT NULL DEFAULT '[]',
            people_json TEXT NOT NULL DEFAULT '[]',
            accommodations_json TEXT NOT NULL DEFAULT '[]',
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
        if not _has_column(conn, "people_profiles", "user_id"):
            conn.execute("ALTER TABLE people_profiles ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
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
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_people_profiles_user_name ON people_profiles(user_id, name)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_templates_user_name ON packing_templates(user_id, name)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_people_profiles_user ON people_profiles(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_packing_templates_user ON packing_templates(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)")

        _seed_user(conn)
