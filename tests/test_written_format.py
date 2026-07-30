"""Written short/long form — endpoint wiring + request-flow logic, DB stubbed."""
import uuid

import pytest
from fastapi.testclient import TestClient

from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db
from db.db_ops.media_requests import db_create_media_request


class FakeUser:
    def __init__(self, role):
        self.id = uuid.uuid4()
        self.username = f"{role}user"
        self.role = role


class FakeMediaRow:
    def __init__(self, name, type_=None, written_format=None):
        self.id = uuid.uuid4()
        self.name = name
        self.type = type_
        self.written_format = written_format


def make_client(role, monkeypatch, set_format_result=None, set_format_error=None):
    async def fake_get_db():
        yield None

    captured = {}

    async def fake_set_media_format(db, name, written_format):
        if set_format_error is not None:
            raise set_format_error
        captured["set"] = (name, written_format)
        return set_format_result or FakeMediaRow(name, "written_form", written_format)

    app.dependency_overrides[get_current_member] = lambda: FakeUser(role)
    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(main_mod, "db_set_media_format", fake_set_media_format)
    c = TestClient(app)
    c.captured = captured  # type: ignore[attr-defined]
    return c


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ------------------- PATCH /media/{name}/format -------------------

def test_format_patch_member_403(monkeypatch):
    c = make_client("member", monkeypatch)
    r = c.patch("/media/poetry/format", json={"written_format": "short"})
    assert r.status_code == 403


def test_format_patch_admin_403(monkeypatch):
    # Contributor is the top tier; plain admins don't qualify.
    c = make_client("admin", monkeypatch)
    r = c.patch("/media/poetry/format", json={"written_format": "short"})
    assert r.status_code == 403


def test_format_patch_contributor_ok(monkeypatch):
    c = make_client("contributor", monkeypatch)
    r = c.patch("/media/poetry/format", json={"written_format": "short"})
    assert r.status_code == 200
    assert r.json()["written_format"] == "short"
    assert c.captured["set"] == ("poetry", "short")


def test_format_patch_invalid_value_422(monkeypatch):
    c = make_client("contributor", monkeypatch)
    r = c.patch("/media/poetry/format", json={"written_format": "medium"})
    assert r.status_code == 422


def test_format_patch_unknown_medium_404(monkeypatch):
    c = make_client(
        "contributor", monkeypatch, set_format_error=ValueError("Medium 'nope' not found")
    )
    r = c.patch("/media/nope/format", json={"written_format": "long"})
    assert r.status_code == 404


def test_format_patch_non_written_422(monkeypatch):
    c = make_client(
        "contributor",
        monkeypatch,
        set_format_error=ValueError("Medium 'oil' is not a written medium"),
    )
    r = c.patch("/media/oil/format", json={"written_format": "short"})
    assert r.status_code == 422


# ------------------- GET /media carries written_format -------------------

def test_list_media_includes_written_format(monkeypatch):
    rows = [
        FakeMediaRow("poetry", "written_form", "short"),
        FakeMediaRow("essays", "written_form", "long"),
        FakeMediaRow("oil", "visual_2d", None),
    ]

    async def fake_list(db):
        return rows

    async def fake_get_db():
        yield None

    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(main_mod, "db_list_media", fake_list)
    c = TestClient(app)
    r = c.get("/media")
    assert r.status_code == 200
    by_name = {m["name"]: m["written_format"] for m in r.json()}
    assert by_name == {"poetry": "short", "essays": "long", "oil": None}


# ------------------- request flow: format rides through -------------------

def test_submit_media_request_passes_format(monkeypatch):
    captured = {}

    async def fake_create(db, member_id, name, requested_type=None, requested_format=None):
        captured["req"] = (name, requested_type, requested_format)

        class Row:
            id = uuid.uuid4()
            member_id = uuid.uuid4()
            requested_name = name
            status = "pending"
            requested_type = None
            requested_format = None
            resolved_type = None
            from datetime import datetime

            created_at = datetime(2026, 7, 30)

        row = Row()
        row.requested_type = requested_type
        row.requested_format = requested_format
        return row

    async def fake_get_db():
        yield None

    app.dependency_overrides[get_current_member] = lambda: FakeUser("member")
    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(main_mod, "db_create_media_request", fake_create)
    c = TestClient(app)
    r = c.post(
        "/media-requests",
        json={"name": "haikus", "type": "written_form", "format": "short"},
    )
    assert r.status_code == 201
    assert captured["req"] == ("haikus", "written_form", "short")
    assert r.json()["requested_format"] == "short"


# ------------------- db op validation (no DB touched on the error paths) ---


class FakeDb:
    """Just enough AsyncSession for db_create_media_request's happy path."""

    def __init__(self):
        self.added = []

    def add(self, row):
        self.added.append(row)

    async def commit(self):
        pass

    async def refresh(self, row):
        pass


@pytest.mark.anyio
async def test_request_invalid_format_rejected():
    with pytest.raises(ValueError):
        await db_create_media_request(
            None, uuid.uuid4(), "x", requested_type="written_form", requested_format="epic"
        )


@pytest.mark.anyio
async def test_request_format_dropped_for_non_written():
    db = FakeDb()
    row = await db_create_media_request(
        db, uuid.uuid4(), "watercolor", requested_type="visual_2d", requested_format="short"
    )
    assert row.requested_format is None


@pytest.mark.anyio
async def test_request_format_kept_for_written():
    db = FakeDb()
    row = await db_create_media_request(
        db, uuid.uuid4(), "poems", requested_type="written_form", requested_format="short"
    )
    assert row.requested_format == "short"
