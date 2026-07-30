import time
import uuid
import pytest
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app
from db.session import get_db
from tests.conftest import make_jpeg_bytes

PUB = {
    "slug": "jane", "title": "Jane Doe", "artist_name": "Jane Doe",
    "statement": "I paint.", "theme": {"bg": "#faf8f4", "accent": "#8a6d3b"},
    "blocks": [{"kind": "gallery", "config": {"layout": "grid"},
                "pieces": [{"id": str(uuid.uuid4()), "title": "Dunes", "date": None, "aspect_ratio": 1.5}]}],
}


@pytest.fixture(autouse=True)
def setup_jwt_secret(monkeypatch):
    """Ensure JWT_SECRET is set for all tests in this module."""
    monkeypatch.setattr(main_mod, "JWT_SECRET", "test-secret-key-for-preview-sigs")


@pytest.fixture
def pub_client(tmp_static, monkeypatch):
    async def fake_get_db():
        yield None
    async def fake_payload(db, slug, include_unpublished=False):
        return dict(PUB) if slug == "jane" or include_unpublished else None
    monkeypatch.setattr(main_mod, "db_public_portfolio_payload", fake_payload)
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
    sig = main_mod.mint_preview_sig("jane", exp)
    assert main_mod.check_preview_sig("jane", sig, exp)
    assert not main_mod.check_preview_sig("jane", sig, exp + 1)
    assert not main_mod.check_preview_sig("other", sig, exp)
    assert not main_mod.check_preview_sig("jane", sig, int(time.time()) - 10)


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
