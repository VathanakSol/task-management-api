"""SQLite connection and schema helpers."""

import os
import sqlite3
from collections.abc import Generator
from pathlib import Path

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent.parent / "tasks.db"


def get_database_path() -> str:
    """Resolve the path at call time so tests can use an isolated database."""
    return os.getenv("TASKS_DB_PATH", str(DEFAULT_DATABASE_PATH))


def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """Provide a short-lived connection with dictionary-like rows."""
    database_path = get_database_path()
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    """Create the tasks table if it does not already exist."""
    database_path = get_database_path()
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
                description TEXT CHECK(
                    description IS NULL OR length(description) <= 2000
                ),
                status TEXT NOT NULL DEFAULT 'pending' CHECK(
                    status IN ('pending', 'in_progress', 'completed')
                ),
                due_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
