"""Direct tests for the generate_thumbnail helper (no HTTP, no DB)."""
import uuid
from PIL import Image

from api import main as main_mod
from tests.conftest import make_jpeg_bytes


def _write_jpeg(path, size=(800, 600)):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(make_jpeg_bytes(size=size))


def test_generate_thumbnail_success(tmp_static):
    art_id = str(uuid.uuid4())
    src = tmp_static / "src.jpg"
    _write_jpeg(src, size=(1200, 800))

    out = main_mod.generate_thumbnail(art_id, src, 256)
    assert out is not None
    assert out.exists()
    with Image.open(out) as img:
        assert img.format == "JPEG"
        assert img.width <= 256


def test_generate_thumbnail_returns_none_on_bad_input(tmp_static):
    art_id = str(uuid.uuid4())
    bogus = tmp_static / "not-an-image.jpg"
    bogus.parent.mkdir(parents=True, exist_ok=True)
    bogus.write_bytes(b"definitely not an image")

    out = main_mod.generate_thumbnail(art_id, bogus, 256)
    assert out is None
    # Partial thumb must be cleaned up so the GET endpoint doesn't serve garbage:
    assert not main_mod.thumb_file(art_id, 256).exists()


def test_generate_thumbnail_preserves_aspect_ratio(tmp_static):
    art_id = str(uuid.uuid4())
    src = tmp_static / "wide.jpg"
    _write_jpeg(src, size=(1000, 500))  # 2:1

    out = main_mod.generate_thumbnail(art_id, src, 512)
    assert out is not None
    with Image.open(out) as img:
        ratio = img.width / img.height
        assert abs(ratio - 2.0) < 0.05
