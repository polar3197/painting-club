"""WIP updates for 2D visual pieces.

The piece's file_path is ALWAYS the latest image; each add-update archives the
superseded image (and its aspect ratio) as a wip_update row. Un-marking WIP
keeps the history — it just hides the interface client-side.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Visual2D, WipUpdate


async def db_get_owned_visual(db: AsyncSession, art_id: str, member_id) -> Visual2D:
    """The piece, after verifying it exists and belongs to member_id."""
    piece = (
        await db.execute(select(Visual2D).filter(Visual2D.id == art_id))
    ).scalar_one_or_none()
    if piece is None:
        raise ValueError("Art not found")
    if str(piece.creator_id) != str(member_id):
        raise PermissionError("Not your piece")
    return piece


async def db_set_wip(db: AsyncSession, art_id: str, member_id, is_wip: bool) -> None:
    piece = await db_get_owned_visual(db, art_id, member_id)
    piece.is_wip = is_wip
    await db.commit()


async def db_add_wip_update(
    db: AsyncSession,
    art_id: str,
    member_id,
    new_file_path: str,
    new_aspect_ratio: float | None,
) -> None:
    """Archive the piece's current image as history and install the new one as
    the latest. Caller has already written the new file to disk; the old file
    stays on disk (it is now history, not garbage)."""
    piece = await db_get_owned_visual(db, art_id, member_id)
    db.add(WipUpdate(
        id=uuid.uuid4(),
        art_id=piece.id,
        file_path=piece.file_path,
        aspect_ratio=piece.aspect_ratio,
    ))
    piece.file_path = new_file_path
    piece.aspect_ratio = new_aspect_ratio
    # Adding an update implies the piece is (still) in progress.
    piece.is_wip = True
    await db.commit()


async def db_remove_wip_update(db: AsyncSession, art_id: str, update_id: str, member_id) -> str:
    """Delete one archived image from a piece's WIP history (owner only).
    Returns the removed row's file_path so the route can unlink the bytes."""
    await db_get_owned_visual(db, art_id, member_id)
    row = (
        await db.execute(
            select(WipUpdate).filter(WipUpdate.id == update_id, WipUpdate.art_id == art_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Update not found")
    file_path = row.file_path
    await db.delete(row)
    await db.commit()
    return file_path


async def db_pop_wip_current(db: AsyncSession, art_id: str, member_id) -> tuple[str, str]:
    """Remove the piece's CURRENT image by promoting the newest archived state
    to be the face. Returns (removed_path, promoted_path). Refuses when there is
    no archived state to fall back to (a piece must keep an image)."""
    piece = await db_get_owned_visual(db, art_id, member_id)
    latest = (
        await db.execute(
            select(WipUpdate)
            .filter(WipUpdate.art_id == art_id)
            .order_by(WipUpdate.created_at.desc())
        )
    ).scalars().first()
    if latest is None:
        raise ValueError("No earlier state to fall back to")
    removed = piece.file_path
    promoted = latest.file_path
    piece.file_path = promoted
    piece.aspect_ratio = latest.aspect_ratio
    await db.delete(latest)
    await db.commit()
    return removed, promoted


async def db_list_wip_updates(db: AsyncSession, art_id: str) -> list[WipUpdate]:
    """History rows for a piece, oldest first."""
    rows = (
        await db.execute(
            select(WipUpdate)
            .filter(WipUpdate.art_id == art_id)
            .order_by(WipUpdate.created_at.asc())
        )
    ).scalars().all()
    return list(rows)
