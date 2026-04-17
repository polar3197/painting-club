"""Approval + temp-password + setup flow — endpoint wiring, DB layer stubbed."""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db
from db.db_ops.applications import TEMP_PASSWORD_ALPHABET, _gen_temp_password
from db.models import Member, Application


# ------------------- password generator -------------------

def test_gen_temp_password_length_and_alphabet():
    pw = _gen_temp_password(12)
    assert len(pw) == 12
    assert all(c in TEMP_PASSWORD_ALPHABET for c in pw)
    # no ambiguous chars
    assert not any(c in pw for c in "0O1lI")


def test_gen_temp_password_randomness():
    pws = {_gen_temp_password(12) for _ in range(50)}
    assert len(pws) > 45  # collisions should be astronomically unlikely


# ------------------- fixtures -------------------

class FakeAdmin:
    def __init__(self):
        self.id = uuid.uuid4()
        self.username = "admin"
        self.role = "admin"


@pytest.fixture
def admin_client(monkeypatch):
    async def fake_get_db():
        yield None

    app.dependency_overrides[get_current_member] = lambda: FakeAdmin()
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


# ------------------- approve endpoint -------------------

def test_approve_returns_temp_credentials(admin_client, monkeypatch):
    fake_app = Application(
        id=uuid.uuid4(),
        firstname="Jane", lastname="Doe", email="jane@x.com",
        status="pending_setup",
    )
    fake_member = Member(
        id=uuid.uuid4(),
        username="user_abc12345",
        email="jane@x.com",
        password_hash="x",
        must_change_password=True,
        temp_password_plaintext="AbCd1234EfGh",
        temp_password_expires_at=datetime.utcnow() + timedelta(days=7),
    )

    async def fake_approve(db, application_id):
        return fake_app, fake_member, "AbCd1234EfGh"
    monkeypatch.setattr(main_mod, "db_approve_application", fake_approve)

    resp = admin_client.patch(
        f"/admin/applications/{fake_app.id}",
        json={"status": "approved"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["temp_username"] == "user_abc12345"
    assert body["temp_password"] == "AbCd1234EfGh"
    assert body["status"] == "pending_setup"


def test_reject_still_plain_status_update(admin_client, monkeypatch):
    called = {}

    async def fake_update(db, app_id, status):
        called["app_id"] = app_id
        called["status"] = status
        return None

    async def fake_approve(*_a, **_k):
        raise AssertionError("approval path should not run for status=rejected")

    monkeypatch.setattr(main_mod, "db_update_application_status", fake_update)
    monkeypatch.setattr(main_mod, "db_approve_application", fake_approve)

    app_id = str(uuid.uuid4())
    resp = admin_client.patch(f"/admin/applications/{app_id}", json={"status": "rejected"})
    assert resp.status_code == 200
    assert called == {"app_id": app_id, "status": "rejected"}


# ------------------- login must_setup flag -------------------

def _install_login_stub(monkeypatch, member):
    async def fake_login(db, username, password):
        return member
    monkeypatch.setattr(main_mod, "db_login_user", fake_login)
    # create_token just needs member.id to build a JWT
    monkeypatch.setattr(main_mod, "create_token", lambda m: "fake-token")


def test_login_sets_must_setup_true_for_temp_user(monkeypatch):
    member = Member(
        id=uuid.uuid4(), username="user_abc12345", password_hash="x",
        must_change_password=True,
        temp_password_expires_at=datetime.utcnow() + timedelta(days=7),
    )
    _install_login_stub(monkeypatch, member)

    async def fake_get_db():
        yield None
    app.dependency_overrides[get_db] = fake_get_db
    try:
        c = TestClient(app)
        resp = c.post("/members/login", json={"username": "user_abc12345", "password": "any"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["must_setup"] is True
        assert body["access_token"] == "fake-token"
    finally:
        app.dependency_overrides.clear()


def test_login_sets_must_setup_false_for_normal_user(monkeypatch):
    member = Member(
        id=uuid.uuid4(), username="jane", password_hash="x",
        must_change_password=False,
    )
    _install_login_stub(monkeypatch, member)

    async def fake_get_db():
        yield None
    app.dependency_overrides[get_db] = fake_get_db
    try:
        c = TestClient(app)
        resp = c.post("/members/login", json={"username": "jane", "password": "any"})
        assert resp.status_code == 200
        assert resp.json()["must_setup"] is False
    finally:
        app.dependency_overrides.clear()


def test_login_rejects_expired_temp_password(monkeypatch):
    member = Member(
        id=uuid.uuid4(), username="user_old", password_hash="x",
        must_change_password=True,
        temp_password_expires_at=datetime.utcnow() - timedelta(days=1),
    )
    _install_login_stub(monkeypatch, member)

    async def fake_get_db():
        yield None
    app.dependency_overrides[get_db] = fake_get_db
    try:
        c = TestClient(app)
        resp = c.post("/members/login", json={"username": "user_old", "password": "any"})
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


# ------------------- setup-account endpoint -------------------

@pytest.fixture
def setup_client(monkeypatch):
    """Current member is a pending-setup user; db_complete_setup is stubbed."""
    pending_member = Member(
        id=uuid.uuid4(),
        username="user_abc12345",
        password_hash="x",
        must_change_password=True,
        temp_password_plaintext="AbCd1234EfGh",
        temp_password_expires_at=datetime.utcnow() + timedelta(days=7),
    )

    async def fake_get_db():
        yield None

    app.dependency_overrides[get_current_member] = lambda: pending_member
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    c.pending_member = pending_member  # type: ignore[attr-defined]
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def test_setup_account_success(setup_client, monkeypatch):
    async def fake_complete(db, member, new_username, new_password):
        member.username = new_username
        member.must_change_password = False
        return member
    monkeypatch.setattr(main_mod, "db_complete_setup", fake_complete)

    resp = setup_client.post(
        "/members/setup-account",
        headers={"Authorization": "Bearer x"},
        json={"new_username": "jane_doe", "new_password": "hunter22!"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "jane_doe"


def test_setup_account_rejects_short_username(setup_client):
    resp = setup_client.post(
        "/members/setup-account",
        headers={"Authorization": "Bearer x"},
        json={"new_username": "ab", "new_password": "hunter22!"},
    )
    assert resp.status_code == 400
    assert "username" in resp.json()["detail"].lower()


def test_setup_account_rejects_short_password(setup_client):
    resp = setup_client.post(
        "/members/setup-account",
        headers={"Authorization": "Bearer x"},
        json={"new_username": "jane_doe", "new_password": "short"},
    )
    assert resp.status_code == 400
    assert "password" in resp.json()["detail"].lower()


def test_setup_account_rejects_already_setup_user(monkeypatch):
    already_done = Member(
        id=uuid.uuid4(), username="jane", password_hash="x",
        must_change_password=False,
    )

    async def fake_get_db():
        yield None

    app.dependency_overrides[get_current_member] = lambda: already_done
    app.dependency_overrides[get_db] = fake_get_db
    try:
        c = TestClient(app)
        resp = c.post(
            "/members/setup-account",
            headers={"Authorization": "Bearer x"},
            json={"new_username": "jane_doe", "new_password": "hunter22!"},
        )
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_setup_account_rejects_taken_username(setup_client, monkeypatch):
    async def fake_complete(db, member, new_username, new_password):
        raise ValueError("Username is taken")
    monkeypatch.setattr(main_mod, "db_complete_setup", fake_complete)

    resp = setup_client.post(
        "/members/setup-account",
        headers={"Authorization": "Bearer x"},
        json={"new_username": "taken", "new_password": "hunter22!"},
    )
    assert resp.status_code == 409
