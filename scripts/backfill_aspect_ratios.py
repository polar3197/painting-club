"""
One-off: walk every Visual2D row that has no aspect_ratio yet, open the underlying
file from /app/static, and compute aspect_ratio = width / height. Idempotent —
safe to re-run: already-populated rows are skipped, and failures are logged without
blocking other rows.

PDFs are skipped (no single canonical aspect ratio).

Run from inside the api container:
    docker compose cp scripts/backfill_aspect_ratios.py api:/tmp/backfill.py
    docker compose exec api python /tmp/backfill.py
"""
import asyncio
from pathlib import Path

from PIL import Image
import pillow_heif
from sqlalchemy import select

from db.session import AsyncSessionLocal
from db.models import Visual2D

pillow_heif.register_heif_opener()

STATIC_ROOT = Path("/app")


def abs_path(rel: str) -> Path:
    return STATIC_ROOT / rel.lstrip("/")


async def main() -> None:
    populated = skipped = failed = 0
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Visual2D).filter(Visual2D.aspect_ratio.is_(None))
        )).scalars().all()

        if not rows:
            print("No Visual2D rows missing aspect_ratio — nothing to do.")
            return

        print(f"Found {len(rows)} rows to backfill.")
        for piece in rows:
            path = abs_path(piece.file_path or "")
            if not piece.file_path or not path.exists():
                skipped += 1
                print(f"  - {piece.id}: file missing ({piece.file_path}), skipping")
                continue
            if path.suffix.lower() == ".pdf":
                skipped += 1
                continue

            try:
                with Image.open(path) as img:
                    w, h = img.size
                if not w or not h:
                    raise ValueError(f"zero dimension {w}x{h}")
                piece.aspect_ratio = w / h
                populated += 1
                print(f"  ✓ {piece.id}: {w}x{h} -> {piece.aspect_ratio:.4f}")
            except Exception as e:
                failed += 1
                print(f"  ✗ {piece.id}: {type(e).__name__}: {e}")

        await db.commit()

    print(f"\nDone. populated={populated} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
