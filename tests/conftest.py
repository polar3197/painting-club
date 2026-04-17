import io
import uuid
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db


class FakeMember:
    def __init__(self):
        self.id = uuid.uuid4()
        self.username = "testuser"
        self.role = "member"


@pytest.fixture
def fake_member():
    return FakeMember()


@pytest.fixture
def tmp_static(tmp_path, monkeypatch):
    """Redirect STATIC_ROOT to a per-test tmp dir so writes don't escape."""
    monkeypatch.setattr(main_mod, "STATIC_ROOT", tmp_path)
    return tmp_path


@pytest.fixture
def client(fake_member, tmp_static, monkeypatch):
    """TestClient with auth + DB layer stubbed — endpoints still hit real filesystem (under tmp_static)."""
    captured: dict = {}

    async def fake_get_db():
        yield None

    async def fake_add(**kwargs):
        captured["add"] = kwargs
        return str(kwargs["art_id"])

    async def fake_remove(db, art_id, current_member_id):
        # default: return the path the test stored via client.state; overridable per-test
        return captured.get("remove_path")

    app.dependency_overrides[get_current_member] = lambda: fake_member
    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(main_mod, "db_add_visual_2d", fake_add)
    monkeypatch.setattr(main_mod, "db_remove_visual_2d", fake_remove)

    # Bare TestClient (no `with ...`) skips the lifespan, which would try to init the DB.
    c = TestClient(app)
    c.captured = captured  # type: ignore[attr-defined]
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def make_jpeg_bytes(size=(64, 64), color=(128, 64, 32)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def make_png_bytes(size=(64, 64), color=(128, 64, 32)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def make_pdf_bytes() -> bytes:
    # Minimal valid PDF — libmagic recognizes it by the %PDF- header.
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 0>>endobj\n"
        b"xref\n0 3\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000052 00000 n \n"
        b"trailer<</Size 3/Root 1 0 R>>\n"
        b"startxref\n92\n%%EOF\n"
    )


def make_heic_bytes(size=(64, 64), color=(128, 64, 32)) -> bytes:
    """Generate HEIC bytes using pillow-heif."""
    import pillow_heif
    heif = pillow_heif.from_pillow(Image.new("RGB", size, color))
    buf = io.BytesIO()
    heif.save(buf, format="HEIF")
    return buf.getvalue()
