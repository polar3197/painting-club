"""
One-off: migrate legacy baked-in profile pics from src/ui/public/imgs/{member_id}.png
into the new storage pipeline — copies file to /app/static/profile/{id}.{ext},
generates the 256px thumbnail at /app/static/profile-thumbs/{id}.jpg, and sets
member.profile_pic_path in the DB.

Only touches members whose profile_pic_path is NULL — safe to re-run, won't clobber
pics already uploaded through the normal pipeline.

Run from inside the api container:
    docker compose exec api python /src/scripts/migrate_legacy_profile_pics.py
"""
import asyncio
import shutil
import uuid
from pathlib import Path

from PIL import Image
import pillow_heif
from sqlalchemy import select

from db.session import AsyncSessionLocal
from db.models import Member

pillow_heif.register_heif_opener()

LEGACY_DIR = Path("/src/ui/public/imgs")
PROFILE_DIR = Path("/app/static/profile")
THUMB_DIR = Path("/app/static/profile-thumbs")
THUMB_DIM = 256


def is_uuid(name: str) -> bool:
    try:
        uuid.UUID(name)
        return True
    except ValueError:
        return False


def make_thumb(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((THUMB_DIM, THUMB_DIM), Image.LANCZOS)
        img.save(dst, format="JPEG", quality=82, optimize=True)


async def main() -> None:
    if not LEGACY_DIR.exists():
        print(f"No {LEGACY_DIR} — nothing to migrate.")
        return

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    migrated = skipped = failed = 0

    async with AsyncSessionLocal() as db:
        for src in sorted(LEGACY_DIR.iterdir()):
            if not src.is_file() or not is_uuid(src.stem):
                continue

            member_id = uuid.UUID(src.stem)
            member = (
                await db.execute(select(Member).filter(Member.id == member_id))
            ).scalar_one_or_none()

            if member is None:
                print(f"  - {src.name}: no matching member, skipping")
                skipped += 1
                continue
            if member.profile_pic_path:
                print(f"  - {src.name}: {member.username} already has profile_pic_path, skipping")
                skipped += 1
                continue

            ext = src.suffix.lstrip(".").lower() or "png"
            dst = PROFILE_DIR / f"{member_id}.{ext}"
            thumb = THUMB_DIR / f"{member_id}.jpg"
            web_path = f"/static/profile/{member_id}.{ext}"

            try:
                shutil.copy2(src, dst)
                make_thumb(dst, thumb)
                member.profile_pic_path = web_path
                await db.commit()
                migrated += 1
                print(f"  ✓ {member.username}: {src.name} -> {web_path}")
            except Exception as e:
                await db.rollback()
                failed += 1
                print(f"  ✗ {src.name}: {type(e).__name__}: {e}")
                dst.unlink(missing_ok=True)
                thumb.unlink(missing_ok=True)

    print(f"\nDone. migrated={migrated} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
