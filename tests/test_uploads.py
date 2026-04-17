"""Upload endpoint behavior: HEIC handling, id-keyed paths, eager thumbs."""
import re
from PIL import Image

from api import main as main_mod
from tests.conftest import make_jpeg_bytes, make_png_bytes, make_pdf_bytes


UUID_RE = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def _upload_jpeg(client, *, title="my piece", medium="canvas", filename="img.jpg", content_type="image/jpeg"):
    return client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": medium, "title": title},
        files={"file": (filename, make_jpeg_bytes(), content_type)},
    )


# ------------------- HEIC MIME mismatch fix -------------------

def test_mime_mismatch_no_longer_rejected(client, monkeypatch):
    """Regression test for the iOS bug: client-labeled content-type != magic-detected mime
    used to 400; after the fix, the server trusts magic bytes and accepts the upload."""
    # Simulate iOS: client labels as image/jpeg, magic bytes detect image/heic
    monkeypatch.setattr(main_mod.magic, "from_buffer", lambda *_a, **_k: "image/heic")
    # Short-circuit conversion so we don't need real HEIC bytes
    monkeypatch.setattr(main_mod, "heic_to_jpeg_bytes", lambda contents: make_jpeg_bytes())

    resp = client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "heic piece"},
        files={"file": ("pic.heic", b"\x00fake-heic-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["file_path"].endswith(".jpg")


def test_heic_conversion_roundtrip(client, monkeypatch):
    """Real HEIC bytes through the endpoint: stored as .jpg, file is decodable."""
    try:
        from tests.conftest import make_heic_bytes
        heic = make_heic_bytes()
    except Exception:
        import pytest
        pytest.skip("pillow-heif cannot generate HEIC in this environment")

    resp = client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "real heic"},
        files={"file": ("pic.heic", heic, "image/heic")},
    )
    assert resp.status_code == 200, resp.text
    file_path = resp.json()["file_path"]
    assert file_path.endswith(".jpg")

    written = main_mod.abs_path(file_path)
    assert written.exists()
    # Decodes as a JPEG:
    with Image.open(written) as img:
        img.verify()


# ------------------- ID-keyed file paths -------------------

def test_filename_is_art_id_not_title(client, fake_member):
    resp = _upload_jpeg(client, title="My Very Fancy Title!!")
    assert resp.status_code == 200, resp.text
    file_path = resp.json()["file_path"]

    # expected shape: /static/art/{member_id}/{safe_medium}/{uuid}.jpg
    pattern = rf"^/static/art/{fake_member.id}/canvas/{UUID_RE}\.jpg$"
    assert re.match(pattern, file_path), f"unexpected path: {file_path}"
    # The title must not appear anywhere in the filesystem path:
    assert "fancy" not in file_path.lower()
    assert "title" not in file_path.lower()


def test_same_title_no_collision(client):
    """Two uploads with identical title+medium must land in distinct files."""
    r1 = _upload_jpeg(client, title="Untitled")
    r2 = _upload_jpeg(client, title="Untitled")
    assert r1.status_code == 200 and r2.status_code == 200
    p1, p2 = r1.json()["file_path"], r2.json()["file_path"]
    assert p1 != p2
    assert main_mod.abs_path(p1).exists()
    assert main_mod.abs_path(p2).exists()
    # Both bytes should be present — neither overwrote the other:
    assert main_mod.abs_path(p1).stat().st_size > 0
    assert main_mod.abs_path(p2).stat().st_size > 0


# ------------------- Eager thumbnails -------------------

def test_eager_thumbs_generated_for_image(client, tmp_static):
    resp = _upload_jpeg(client)
    assert resp.status_code == 200
    # Derive art_id from the returned path (last path segment before .jpg)
    file_path = resp.json()["file_path"]
    art_id = file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0]

    for w in (256, 512, 1024):
        thumb = main_mod.thumb_file(art_id, w)
        assert thumb.exists(), f"thumb missing for width {w}"
        with Image.open(thumb) as img:
            # thumbnail() preserves aspect ratio and caps the longest side,
            # so for a 64x64 source upscaled to w, width should be <= w.
            assert img.width <= w


def test_eager_thumbs_skipped_for_pdf(client, tmp_static):
    resp = client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "doc"},
        files={"file": ("doc.pdf", make_pdf_bytes(), "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    assert not main_mod.thumbs_dir().exists() or not any(main_mod.thumbs_dir().iterdir())


# ------------------- Size / allowlist still enforced -------------------

def test_oversize_rejected(client, monkeypatch):
    monkeypatch.setattr(main_mod, "MAX_UPLOAD_BYTES", 100)
    resp = client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "big"},
        files={"file": ("img.jpg", b"x" * 500, "image/jpeg")},
    )
    assert resp.status_code == 413


def test_disallowed_mime_rejected(client):
    resp = client.post(
        "/art/upload/visual-2d",
        data={"username": "testuser", "medium": "canvas", "title": "bad"},
        files={"file": ("evil.txt", b"hello world", "text/plain")},
    )
    assert resp.status_code == 400
