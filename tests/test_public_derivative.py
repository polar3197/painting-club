import uuid
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db
from tests.conftest import make_jpeg_bytes


def _write_src(tmp_static, name="src.jpg", size=(2400, 1200)):
    p = tmp_static / "static" / "art" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(make_jpeg_bytes(size=size))
    return p


def test_generate_public_image_downscales_and_strips(tmp_static):
    src = _write_src(tmp_static)
    art_id = str(uuid.uuid4())
    out = main_mod.generate_public_image(art_id, src)
    assert out == main_mod.public_file(art_id) and out.exists()
    with Image.open(out) as img:
        assert max(img.size) <= main_mod.PUBLIC_SIZE
        assert img.format == "JPEG"
        assert not img.getexif()  # EXIF stripped


def test_visibility_flip_manages_derivative(tmp_static, fake_member, monkeypatch):
    src = _write_src(tmp_static)
    art_id = str(uuid.uuid4())
    rel = "/static/art/src.jpg"

    async def fake_get_db():
        yield None
    async def fake_set(db, member_id, aid, vis):
        return rel
    monkeypatch.setattr(main_mod, "db_set_art_visibility", fake_set)
    app.dependency_overrides[get_current_member] = lambda: fake_member
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        r = c.patch(f"/art/{art_id}/visibility", json={"visibility": "public"})
        assert r.status_code == 200 and r.json()["visibility"] == "public"
        assert main_mod.public_file(art_id).exists()  # eager-generated
        r = c.patch(f"/art/{art_id}/visibility", json={"visibility": "club"})
        assert r.status_code == 200
        assert not main_mod.public_file(art_id).exists()  # revoked = deleted
    finally:
        app.dependency_overrides.clear()
