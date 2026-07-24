"""Mid-res display derivative: eager gen at upload, gated serve route, cleanup."""
import uuid

from PIL import Image

from api import main as main_mod
from api.main import app
from db.session import get_db
from tests.conftest import make_jpeg_bytes, make_pdf_bytes


def _upload(client, body: bytes, filename="img.jpg", content_type="image/jpeg"):
    return client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "piece"},
        files={"file": (filename, body, content_type)},
    )


def _override_art_lookup(file_path):
    """Route tests need db.execute(...).scalar_one_or_none() → file_path."""

    class FakeResult:
        def scalar_one_or_none(self):
            return file_path

    class FakeDb:
        async def execute(self, _q):
            return FakeResult()

    async def fake_get_db():
        yield FakeDb()

    app.dependency_overrides[get_db] = fake_get_db


# ------------------- eager generation at upload -------------------

def test_upload_generates_display_eagerly(client, tmp_static):
    resp = _upload(client, make_jpeg_bytes(size=(2400, 1200)))
    assert resp.status_code == 200, resp.text

    displays = list((tmp_static / "static" / "display").glob("*.jpg"))
    assert len(displays) == 1, "exactly one display derivative expected"
    with Image.open(displays[0]) as img:
        assert img.format == "JPEG"
        # Downscaled to DISPLAY_SIZE on the long edge, aspect preserved.
        assert max(img.size) == main_mod.DISPLAY_SIZE
        w, h = img.size
        assert abs(w / h - 2.0) < 0.01


def test_small_image_not_upscaled(client, tmp_static):
    resp = _upload(client, make_jpeg_bytes(size=(64, 64)))
    assert resp.status_code == 200, resp.text
    displays = list((tmp_static / "static" / "display").glob("*.jpg"))
    assert len(displays) == 1
    with Image.open(displays[0]) as img:
        assert img.size == (64, 64)


def test_pdf_upload_skips_display(client, tmp_static):
    resp = _upload(client, make_pdf_bytes(), filename="doc.pdf", content_type="application/pdf")
    assert resp.status_code == 200, resp.text
    display_dir = tmp_static / "static" / "display"
    assert not display_dir.exists() or not list(display_dir.glob("*"))


# ------------------- serve route -------------------

def test_display_route_lazy_generates(client, fake_member, tmp_static):
    """No display on disk (pre-eager-gen art) → route generates and serves it."""
    art_id = str(uuid.uuid4())
    file_path = f"/static/art/{fake_member.id}/canvas/{art_id}.jpg"
    src = main_mod.abs_path(file_path)
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(make_jpeg_bytes(size=(2000, 1000)))
    _override_art_lookup(file_path)

    resp = client.get(f"/art/{art_id}/display")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "image/jpeg"
    assert "private" in resp.headers["cache-control"]
    assert main_mod.display_file(art_id).exists(), "lazy gen should persist the derivative"


def test_display_route_pdf_serves_original(client, fake_member, tmp_static):
    art_id = str(uuid.uuid4())
    file_path = f"/static/art/{fake_member.id}/canvas/{art_id}.pdf"
    src = main_mod.abs_path(file_path)
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(make_pdf_bytes())
    _override_art_lookup(file_path)

    resp = client.get(f"/art/{art_id}/display")
    assert resp.status_code == 200
    assert resp.content == make_pdf_bytes()
    assert not main_mod.display_file(art_id).exists()


def test_display_route_unknown_art_404(client):
    _override_art_lookup(None)
    resp = client.get(f"/art/{uuid.uuid4()}/display")
    assert resp.status_code == 404


def test_display_route_corrupt_source_falls_back(client, fake_member, tmp_static):
    """Gen failure (unreadable image) → serve the original bytes, don't 500."""
    art_id = str(uuid.uuid4())
    file_path = f"/static/art/{fake_member.id}/canvas/{art_id}.jpg"
    src = main_mod.abs_path(file_path)
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(b"not-actually-a-jpeg")
    _override_art_lookup(file_path)

    resp = client.get(f"/art/{art_id}/display")
    assert resp.status_code == 200
    assert resp.content == b"not-actually-a-jpeg"


# ------------------- cleanup on delete -------------------

def test_delete_unlinks_display(client, fake_member, tmp_static):
    art_id = str(uuid.uuid4())
    file_path = f"/static/art/{fake_member.id}/canvas/{art_id}.jpg"
    src = main_mod.abs_path(file_path)
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(make_jpeg_bytes())
    disp = main_mod.display_file(art_id)
    disp.parent.mkdir(parents=True, exist_ok=True)
    disp.write_bytes(b"display-bytes")

    client.captured["remove_path"] = file_path
    resp = client.delete(f"/art/{art_id}")
    assert resp.status_code == 200, resp.text
    assert not disp.exists(), "display derivative should be unlinked with the piece"
