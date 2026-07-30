import uuid
import pytest
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db


PAYLOAD = {
    "id": str(uuid.uuid4()), "slug": "testuser", "title": None,
    "published": False, "theme": {},
    "blocks": [{"id": str(uuid.uuid4()), "kind": "gallery", "position": 0,
                "config": {"layout": "grid"}, "piece_ids": []}],
}


@pytest.fixture
def pclient(fake_member, monkeypatch):
    async def fake_get_db():
        yield None
    async def fake_payload(db, member):
        return dict(PAYLOAD)
    async def fake_update(db, member_id, **kw):
        if kw.get("slug") == "taken":
            raise ValueError("slug already taken")
        return None
    monkeypatch.setattr(main_mod, "db_my_portfolio_payload", fake_payload)
    monkeypatch.setattr(main_mod, "db_update_portfolio", fake_update)
    app.dependency_overrides[get_current_member] = lambda: fake_member
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def test_get_mine(pclient):
    r = pclient.get("/portfolio/mine")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "testuser"
    assert body["public_url"].endswith("/p/testuser")
    assert body["blocks"][0]["kind"] == "gallery"


def test_patch_mine_slug_conflict(pclient):
    r = pclient.patch("/portfolio/mine", json={"slug": "taken"})
    assert r.status_code == 409


def test_routes_require_auth():
    c = TestClient(app)
    assert c.get("/portfolio/mine").status_code in (401, 403)
