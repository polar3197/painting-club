"""Delete endpoint: removes the source file."""
import uuid

from api import main as main_mod


def test_delete_unlinks_source(client, fake_member, tmp_static):
    art_id = str(uuid.uuid4())
    file_path = f"/static/art/{fake_member.id}/canvas/{art_id}.jpg"
    src = main_mod.abs_path(file_path)
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(b"fake-image-bytes")

    # tell the stubbed db_remove_visual_2d what file_path to return
    client.captured["remove_path"] = file_path

    resp = client.delete(f"/art/{art_id}")
    assert resp.status_code == 200, resp.text
    assert not src.exists(), "source file should be unlinked"


def test_delete_survives_missing_files(client, fake_member):
    """No source/thumbs on disk — endpoint must still succeed (idempotent cleanup)."""
    art_id = str(uuid.uuid4())
    client.captured["remove_path"] = f"/static/art/{fake_member.id}/canvas/{art_id}.jpg"

    resp = client.delete(f"/art/{art_id}")
    assert resp.status_code == 200


def test_delete_with_no_file_path_is_noop_on_fs(client, fake_member, tmp_static):
    """If db returns None for file_path (legacy rows), endpoint doesn't crash
    and doesn't touch any files."""
    art_id = str(uuid.uuid4())
    # leave captured["remove_path"] unset → fake_remove returns None
    resp = client.delete(f"/art/{art_id}")
    assert resp.status_code == 200
