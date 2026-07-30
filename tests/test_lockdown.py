from fastapi.testclient import TestClient
from api.main import app
from db.session import get_db


def test_members_roster_requires_auth():
    """Anonymous GET /members must 401/403 — it used to return the full roster
    with signed profile-pic URLs, defeating the member-only lockdown."""
    async def fake_get_db():
        yield None

    app.dependency_overrides[get_db] = fake_get_db
    try:
        c = TestClient(app)  # no dependency overrides on get_current_member: real auth deps run
        r = c.get("/members")
        assert r.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()
