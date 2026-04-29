from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from app.db import DB_PATH, init_db


TABLES = {
    "users": ("user_id", "password_hash", "created_at"),
    "trips": (
        "id",
        "user_id",
        "title",
        "start_date",
        "end_date",
        "notes",
        "route_json",
        "people_json",
        "accommodations_json",
        "created_at",
        "updated_at",
    ),
    "people_profiles": ("id", "user_id", "name", "relationship", "notes", "created_at"),
    "packing_templates": ("id", "user_id", "name", "items_json", "created_at", "updated_at"),
}


def rows_from_sqlite(db_path: Path, table_name: str) -> list[sqlite3.Row]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(f"SELECT * FROM {table_name}").fetchall()
        except sqlite3.OperationalError:
            return []


def upsert_rows(conn: psycopg.Connection, table_name: str, columns: tuple[str, ...], rows: list[sqlite3.Row]) -> None:
    if not rows:
        return
    placeholders = ", ".join(["%s"] * len(columns))
    column_list = ", ".join(columns)
    conflict_column = "user_id" if table_name == "users" else "id"
    update_columns = [column for column in columns if column != conflict_column]
    update_sql = ", ".join(f"{column} = EXCLUDED.{column}" for column in update_columns)
    sql = f"""
        INSERT INTO {table_name} ({column_list})
        VALUES ({placeholders})
        ON CONFLICT ({conflict_column}) DO UPDATE SET {update_sql}
    """
    for row in rows:
        conn.execute(sql, tuple(row[column] for column in columns))


def reset_sequence(conn: psycopg.Connection, table_name: str) -> None:
    conn.execute(
        """
        SELECT setval(
            pg_get_serial_sequence(%s, 'id'),
            COALESCE((SELECT MAX(id) FROM """ + table_name + """), 1),
            true
        )
        """,
        (table_name,),
    )


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("Set DATABASE_URL to your hosted Postgres URL before running this migration")

    sqlite_path = Path(os.getenv("SQLITE_DB_PATH", DB_PATH))
    if not sqlite_path.exists():
        raise RuntimeError(f"SQLite database not found: {sqlite_path}")

    init_db()
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        for table_name, columns in TABLES.items():
            upsert_rows(conn, table_name, columns, rows_from_sqlite(sqlite_path, table_name))
        for table_name in ("trips", "people_profiles", "packing_templates"):
            reset_sequence(conn, table_name)

    print(f"Migrated {sqlite_path} to Postgres.")


if __name__ == "__main__":
    main()
