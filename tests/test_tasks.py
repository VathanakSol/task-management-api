from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TASKS_DB_PATH", str(tmp_path / "test_tasks.db"))
    with TestClient(app) as test_client:
        yield test_client


def task_payload(**overrides):
    payload = {
        "title": "Write release notes",
        "description": "Summarize API changes",
        "status": "todo",
        "due_date": str(date.today() + timedelta(days=7)),
    }
    payload.update(overrides)
    return payload


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_and_get_task(client):
    created = client.post("/tasks", json=task_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == 1
    assert body["title"] == "Write release notes"
    assert body["status"] == "todo"
    assert body["created_at"].endswith("Z")
    assert body["updated_at"].endswith("Z")

    fetched = client.get(f"/tasks/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body


def test_list_and_filter_tasks(client):
    client.post("/tasks", json=task_payload(title="First"))
    client.post("/tasks", json=task_payload(title="Second", status="done"))

    all_tasks = client.get("/tasks")
    assert all_tasks.status_code == 200
    assert len(all_tasks.json()) == 2

    done_tasks = client.get("/tasks", params={"status": "done"})
    assert done_tasks.status_code == 200
    assert [task["title"] for task in done_tasks.json()] == ["Second"]

    invalid_filter = client.get("/tasks", params={"status": "unknown"})
    assert invalid_filter.status_code == 422


def test_full_update_task(client):
    task_id = client.post("/tasks", json=task_payload()).json()["id"]
    updated_payload = task_payload(
        title="Updated title", description=None, status="in_progress", due_date=None
    )
    response = client.put(f"/tasks/{task_id}", json=updated_payload)

    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"
    assert response.json()["status"] == "in_progress"
    assert response.json()["description"] is None
    assert response.json()["due_date"] is None


def test_partial_update_preserves_other_fields(client):
    task_id = client.post("/tasks", json=task_payload()).json()["id"]
    response = client.patch(f"/tasks/{task_id}", json={"status": "done"})

    assert response.status_code == 200
    assert response.json()["status"] == "done"
    assert response.json()["title"] == "Write release notes"
    assert response.json()["description"] == "Summarize API changes"


def test_delete_task(client):
    task_id = client.post("/tasks", json=task_payload()).json()["id"]
    assert client.delete(f"/tasks/{task_id}").status_code == 204
    assert client.get(f"/tasks/{task_id}").status_code == 404


@pytest.mark.parametrize("method", ["get", "put", "patch", "delete"])
def test_missing_task_returns_consistent_404(client, method):
    kwargs = {"json": task_payload()} if method == "put" else {}
    if method == "patch":
        kwargs = {"json": {"title": "Missing"}}
    response = getattr(client, method)("/tasks/999", **kwargs)
    assert response.status_code == 404
    assert response.json() == {"detail": "Task 999 not found"}


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "Valid", "status": "invalid"},
        {"title": "Valid", "due_date": "not-a-date"},
        {"title": "Valid", "description": "x" * 2001},
    ],
)
def test_create_validation_errors(client, payload):
    response = client.post("/tasks", json=payload)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_patch_requires_at_least_one_field(client):
    task_id = client.post("/tasks", json=task_payload()).json()["id"]
    response = client.patch(f"/tasks/{task_id}", json={})
    assert response.status_code == 422


def test_invalid_task_id_is_rejected(client):
    response = client.get("/tasks/not-an-integer")
    assert response.status_code == 422


def test_database_is_isolated_between_tests(client):
    assert client.get("/tasks").json() == []
