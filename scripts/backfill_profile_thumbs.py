"""
One-off: walk /app/static/profile/ and generate a 256px thumbnail alongside each existing
profile pic at /app/static/profile-thumbs/. Safe to re-run — skips files whose thumb
already exists and is newer than the source.

Run from inside the api container so /app paths resolve:
    docker compose exec api python /src/scripts/backfill_profile_thumbs.py
"""
from pathlib import Path
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

PROFILE_DIR = Path("/app/static/profile")
THUMB_DIR = Path("/app/static/profile-thumbs")
THUMB_DIM = 256


def main() -> None:
    if not PROFILE_DIR.exists():
        print(f"No {PROFILE_DIR} — nothing to do.")
        return

    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    made = skipped = failed = 0

    for src in sorted(PROFILE_DIR.iterdir()):
        if not src.is_file():
            continue
        # member_id is the filename stem; thumbs are always .jpg
        thumb = THUMB_DIR / f"{src.stem}.jpg"
        if thumb.exists() and thumb.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        try:
            with Image.open(src) as img:
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.thumbnail((THUMB_DIM, THUMB_DIM), Image.LANCZOS)
                img.save(thumb, format="JPEG", quality=82, optimize=True)
            made += 1
            print(f"  ✓ {src.name} -> {thumb.name}")
        except Exception as e:
            failed += 1
            print(f"  ✗ {src.name}: {type(e).__name__}: {e}")
            if thumb.exists():
                thumb.unlink(missing_ok=True)

    print(f"\nDone. generated={made} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
