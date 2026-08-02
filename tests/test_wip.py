"""WIP update endpoint: archive-and-replace mechanics + validation."""
import uuid
from types import SimpleNamespace

from api import main as main_mod
from tests.conftest import make_jpeg_bytes, make_pdf_bytes


def _stub_piece(fake_member, tmp_static, file_rel="/static/art/m/painting/old.jpg"):
    """A fake owned Visual2D row whose current file exists on disk."""
    old_abs = tmp_static / file_rel.lstrip("/")
    old_abs.parent.mkdir(parents=True, exist_ok=True)
    old_abs.write_bytes(make_jpeg_bytes())
    return SimpleNamespace(
        id=uuid.uuid4(),
        creator_id=fake_member.id,
        file_path=file_rel,
        aspect_ratio=1.0,
    ), old_abs


def test_wip_update_archives_old_and_installs_new(client, fake_member, tmp_static, monkeypatch):
    piece, old_abs = _stub_piece(fake_member, tmp_static)
    archived = {}

    async def fake_execute(q):
        return SimpleNamespace(scalar_one_or_none=lambda: piece)

    async def fake_add_wip_update(db, art_id, member_id, new_file_path, new_aspect_ratio):
        archived.update(
            art_id=art_id,
            member_id=member_id,
            new_file_path=new_file_path,
            new_aspect_ratio=new_aspect_ratio,
        )

    monkeypatch.setattr(main_mod, "db_add_wip_update", fake_add_wip_update)

    # The route reads the piece via db.execute — the conftest db is None, so
    # bypass by patching the select round-trip at the session level.
    class FakeDb:
        async def execute(self, q):
            return SimpleNamespace(scalar_one_or_none=lambda: piece)

    from db.session import get_db as real_get_db  # noqa: F401
    from api.main import app, get_db

    async def fake_get_db():
        yield FakeDb()

    app.dependency_overrides[get_db] = fake_get_db

    resp = client.post(
        f"/art/{piece.id}/wip-update",
        files={"file": ("update.jpg", make_jpeg_bytes(color=(10, 200, 30)), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # New file landed on disk at a rev-suffixed path; the old file is KEPT.
    new_rel = archived["new_file_path"]
    assert new_rel != piece.file_path
    assert (tmp_static / new_rel.lstrip("/")).exists()
    assert old_abs.exists(), "superseded image must remain on disk as history"
    # Aspect ratio computed for the new image; archive op got the right ids.
    assert archived["new_aspect_ratio"] is not None
    assert str(archived["art_id"]) == str(piece.id)
    assert body["ok"] is True


def test_wip_update_rejects_pdf(client, fake_member, tmp_static):
    piece, _ = _stub_piece(fake_member, tmp_static)
    resp = client.post(
        f"/art/{piece.id}/wip-update",
        files={"file": ("update.pdf", make_pdf_bytes(), "application/pdf")},
    )
    assert resp.status_code == 400


def test_remove_wip_update_unlinks_file(client, fake_member, tmp_static, monkeypatch):
    # An archived history file on disk that the delete should unlink.
    rel = "/static/art/m/painting/old-abc.jpg"
    old_abs = tmp_static / rel.lstrip("/")
    old_abs.parent.mkdir(parents=True, exist_ok=True)
    old_abs.write_bytes(make_jpeg_bytes())

    async def fake_remove_wip_update(db, art_id, update_id, member_id):
        return rel

    monkeypatch.setattr(main_mod, "db_remove_wip_update", fake_remove_wip_update)
    resp = client.delete(f"/art/{uuid.uuid4()}/wip-updates/{uuid.uuid4()}")
    assert resp.status_code == 200, resp.text
    assert not old_abs.exists(), "archived file must be unlinked on removal"


def test_remove_wip_update_404_when_missing(client, monkeypatch):
    async def fake_remove_wip_update(db, art_id, update_id, member_id):
        raise ValueError("Update not found")

    monkeypatch.setattr(main_mod, "db_remove_wip_update", fake_remove_wip_update)
    resp = client.delete(f"/art/{uuid.uuid4()}/wip-updates/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_wip_update_403_for_non_owner(client, fake_member, tmp_static):
    piece, _ = _stub_piece(fake_member, tmp_static)
    piece.creator_id = uuid.uuid4()  # someone else's piece

    class FakeDb:
        async def execute(self, q):
            return SimpleNamespace(scalar_one_or_none=lambda: piece)

    from api.main import app, get_db

    async def fake_get_db():
        yield FakeDb()

    app.dependency_overrides[get_db] = fake_get_db

    resp = client.post(
        f"/art/{piece.id}/wip-update",
        files={"file": ("update.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 403
