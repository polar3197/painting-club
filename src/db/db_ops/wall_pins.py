from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Art, Member, WallPin

WALL_TYPES = {"visual_2d", "written_form", "audio"}


async def db_list_wall_pins(db: AsyncSession) -> list[dict]:
    """Every member's pins — small (≤ 3 per member), and the walls need all of
    them to float each person's pinned piece."""
    rows = (await db.execute(
        select(Member.username, WallPin.art_type, WallPin.art_id)
        .join(Member, Member.id == WallPin.member_id)
    )).all()
    return [{"username": u, "art_type": t, "art_id": str(a)} for u, t, a in rows]


async def db_toggle_wall_pin(db: AsyncSession, member_id, art_id) -> bool:
    """Pin the member's own piece to its type's wall, replacing any previous
    pin of that type; if it's already the pin, unpin it. Returns the new state.
    Raises LookupError (no such piece) / PermissionError (not theirs) /
    ValueError (type has no wall)."""
    art = (await db.execute(select(Art.creator_id, Art.type).filter(Art.id == art_id))).one_or_none()
    if art is None:
        raise LookupError("Art not found")
    creator_id, art_type = art
    if creator_id != member_id:
        raise PermissionError("You can only pin your own pieces")
    if art_type not in WALL_TYPES:
        raise ValueError(f"No wall for {art_type}")
    existing = await db.get(WallPin, (member_id, art_type))
    if existing is not None and existing.art_id == art_id:
        await db.delete(existing)
        await db.commit()
        return False
    if existing is not None:
        existing.art_id = art_id
    else:
        db.add(WallPin(member_id=member_id, art_type=art_type, art_id=art_id))
    await db.commit()
    return True
