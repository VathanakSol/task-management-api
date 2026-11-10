from datetime import date, datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.database import get_connection, init_db
from app.schemas import TaskCreate, TaskResponse, TaskStatus, TaskUpdate

app = FastAPI(title="Task Management API", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_task(task_id: int) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return dict(row)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/tasks", response_model=list[TaskResponse])
def list_tasks(
    task_status: Optional[TaskStatus] = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    query = "SELECT * FROM tasks"
    params: list = []
    if task_status is not None:
        query += " WHERE status = ?"
        params.append(task_status.value)
    query += " ORDER BY id LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate) -> dict:
    now = utc_now()
    with get_connection() as connection:
        cursor = connection.execute(
            """INSERT INTO tasks
               (title, description, status, due_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                task.title,
                task.description,
                task.status.value,
                task.due_date.isoformat() if task.due_date else None,
                now,
                now,
            ),
        )
        connection.commit()
        task_id = cursor.lastrowid
    return fetch_task(task_id)


@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int) -> dict:
    return fetch_task(task_id)


@app.put("/tasks/{task_id}", response_model=TaskResponse)
def replace_task(task_id: int, task: TaskCreate) -> dict:
    fetch_task(task_id)
    with get_connection() as connection:
        connection.execute(
            """UPDATE tasks SET title = ?, description = ?, status = ?,
               due_date = ?, updated_at = ? WHERE id = ?""",
            (
                task.title,
                task.description,
                task.status.value,
                task.due_date.isoformat() if task.due_date else None,
                utc_now(),
                task_id,
            ),
        )
        connection.commit()
    return fetch_task(task_id)


@app.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, task: TaskUpdate) -> dict:
    current = fetch_task(task_id)
    changes = task.model_dump(exclude_unset=True)
    if not changes:
        return current
    values = {
        "title": changes.get("title", current["title"]),
        "description": changes.get("description", current["description"]),
        "status": changes.get("status", current["status"]),
        "due_date": changes.get("due_date", current["due_date"]),
    }
    if isinstance(values["status"], TaskStatus):
        values["status"] = values["status"].value
    if isinstance(values["due_date"], date):
        values["due_date"] = values["due_date"].isoformat()
    with get_connection() as connection:
        connection.execute(
            """UPDATE tasks SET title = ?, description = ?, status = ?,
               due_date = ?, updated_at = ? WHERE id = ?""",
            (*values.values(), utc_now(), task_id),
        )
        connection.commit()
    return fetch_task(task_id)


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int) -> None:
    fetch_task(task_id)
    with get_connection() as connection:
        connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        connection.commit()
