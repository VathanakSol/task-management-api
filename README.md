# Task Management API

A small FastAPI service using Python's built-in `sqlite3` module. It supports task CRUD, validation, filtering by status, and consistent HTTP errors.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs for interactive API documentation. See [API_ENDPOINTS.md](API_ENDPOINTS.md) for the complete endpoint reference, or open `preview.html` for the live/demo request console. The database defaults to `tasks.db` in the project root. Set `TASKS_DB_PATH` to use another SQLite file.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/tasks` | Create a task |
| GET | `/tasks` | List tasks; optional `?status=todo|in_progress|done` |
| GET | `/tasks/{task_id}` | Retrieve one task |
| PUT | `/tasks/{task_id}` | Replace editable task fields |
| PATCH | `/tasks/{task_id}` | Update one or more fields |
| DELETE | `/tasks/{task_id}` | Delete a task |

Task fields: `title` (required, 1-200 non-whitespace characters), `description` (optional, up to 2000 characters), `status` (`todo`, `in_progress`, or `done`), and `due_date` (optional ISO date). Responses also include `id`, `created_at`, and `updated_at`.

Example:

```bash
curl -X POST http://127.0.0.1:8000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Review pull request","status":"todo","due_date":"2026-12-31"}'
```

## Tests

```bash
pytest -q
```

Tests use a separate temporary SQLite database for every test; they do not touch the development database.

## Implementation notes

- SQLite connections are opened per operation and use parameterized SQL.
- Pydantic validates request bodies and query/path parameters.
- Missing tasks return `404 {"detail": "Task not found"}`; invalid input returns FastAPI's standard 422 response.
- `PUT` requires all editable fields except optional ones; `PATCH` requires at least one supplied field.
