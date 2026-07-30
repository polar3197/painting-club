import time
import uuid
import pytest
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app
from db.session import get_db
from tests.conftest import make_jpeg_bytes

PUB_ID = str(uuid.uuid4())
PUB = {
    "id": PUB_ID, "slug": "jane", "title": "Jane Doe", "artist_name": "Jane Doe",
    "statement": "I paint.", "theme": {"bg": "#faf8f4", "accent": "#8a6d3b"},
    "published": True,
    "blocks": [{"kind": "gallery", "config": {"layout": "grid"},
                "pieces": [{"id": str(uuid.uuid4()), "title": "Dunes", "date": None, "aspect_ratio": 1.5}]}],
}


@pytest.fixture(autouse=True)
def setup_jwt_secret(monkeypatch):
    """Ensure JWT_SECRET is set for all tests in this module."""
    monkeypatch.setattr(main_mod, "JWT_SECRET", "test-secret-key-for-preview-sigs")


@pytest.fixture
def pub_client(tmp_static, monkeypatch):
    async def fake_payload(db, slug, include_unpublished=False):
        return dict(PUB) if slug == "jane" else None
    monkeypatch.setattr(main_mod, "db_public_portfolio_payload", fake_payload)
    async def fake_get_db():
        yield None
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def test_public_page_renders_without_auth(pub_client):
    r = pub_client.get("/p/jane")
    assert r.status_code == 200
    html = r.text
    assert "Jane Doe" in html and "Dunes" in html
    assert 'property="og:title"' in html
    # invisibility: the page must never mention the club
    assert "paint club" not in html.lower() and "paintingclub" not in html.lower()
    # og:image derives origin from request, not hardcoded PUBLIC_SITE_ORIGIN
    assert 'content="http://testserver/p/img/' in html


def test_unknown_or_unpublished_404(pub_client):
    assert pub_client.get("/p/nobody").status_code == 404


def test_preview_sig_roundtrip():
    exp = int(time.time()) + 600
    sig = main_mod.mint_preview_sig(PUB_ID, exp)
    assert main_mod.check_preview_sig(PUB_ID, sig, exp)
    assert not main_mod.check_preview_sig(PUB_ID, sig, exp + 1)
    assert not main_mod.check_preview_sig(str(uuid.uuid4()), sig, exp)
    assert not main_mod.check_preview_sig(PUB_ID, sig, int(time.time()) - 10)


def test_public_img_gated_on_visibility(pub_client, tmp_static, monkeypatch):
    art_id = str(uuid.uuid4())
    src = tmp_static / "static" / "art" / "x.jpg"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(make_jpeg_bytes(size=(2000, 1000)))

    async def fake_path(db, aid):
        return "/static/art/x.jpg" if aid == art_id else None
    monkeypatch.setattr(main_mod, "db_public_art_file_path", fake_path)
    r = pub_client.get(f"/p/img/{art_id}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert "public" in r.headers["cache-control"]
    assert pub_client.get(f"/p/img/{uuid.uuid4()}").status_code == 404


def test_unpublished_preview_by_id(tmp_static, monkeypatch):
    """A preview signature is bound to the portfolio id, not the slug, so a
    slug rename/reclaim can't leak the new claimant's draft to old link holders."""
    unpub = dict(PUB)
    unpub["published"] = False

    async def fake_payload(db, slug, include_unpublished=False):
        return dict(unpub) if slug == "jane" else None
    monkeypatch.setattr(main_mod, "db_public_portfolio_payload", fake_payload)
    async def fake_get_db():
        yield None
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        assert c.get("/p/jane").status_code == 404

        exp = int(time.time()) + 600
        sig = main_mod.mint_preview_sig(PUB_ID, exp)
        r = c.get(f"/p/jane?pv={sig}&exp={exp}")
        assert r.status_code == 200
        assert "no-store" in r.headers["cache-control"]
    finally:
        app.dependency_overrides.clear()


def test_malformed_inputs_no_500(pub_client):
    assert pub_client.get("/p/img/not-a-uuid").status_code == 404

    r = pub_client.get("/p/jane", params={"pv": "é", "exp": "9999999999"})
    assert r.status_code in (200, 404)
