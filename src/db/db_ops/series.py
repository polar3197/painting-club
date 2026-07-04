from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from db.models import Art, Series, WrittenForm


async def db_get_or_create_series(
    db: AsyncSession,
    creator_id,
    media_id,
    name: str,
) -> Series:
    """Find a (creator, media, name) series or create it. Caller is expected
    to commit; this function only flushes so the new row gets an id."""
    name = name.strip()
    existing = await db.execute(
        select(Series).filter(
            Series.creator_id == creator_id,
            Series.media_id == media_id,
            Series.name == name,
        )
    )
    row = existing.scalars().first()
    if row:
        return row
    new_row = Series(creator_id=creator_id, media_id=media_id, name=name)
    db.add(new_row)
    await db.flush()
    return new_row


async def db_set_series_order(
    db: AsyncSession,
    series_id,
    current_member_id,
    ordered_art_ids: list,
):
    """Assign position 0..N-1 to the pieces of a series (any medium), in the
    order supplied. Validates that the series belongs to the caller and that
    every supplied id is a piece in that series. Writes the base-table
    art.series_order_index; written_form.order_index is kept in sync so older
    clients reading the legacy column keep working."""
    series_row = (
        await db.execute(select(Series).filter(Series.id == series_id))
    ).scalar_one_or_none()
    if series_row is None:
        raise ValueError("Series not found")
    if str(series_row.creator_id) != str(current_member_id):
        raise PermissionError("Not your series")
    piece_ids = {
        str(pid)
        for pid in (
            await db.execute(select(Art.id).filter(Art.series_id == series_id))
        ).scalars().all()
    }
    for aid in ordered_art_ids:
        if str(aid) not in piece_ids:
            raise ValueError(f"Art {aid} is not in this series")
    for idx, aid in enumerate(ordered_art_ids):
        await db.execute(
            update(Art).where(Art.id == aid).values(series_order_index=idx)
        )
        await db.execute(
            update(WrittenForm).where(WrittenForm.id == aid).values(order_index=idx)
        )
    await db.commit()


async def db_rename_series(
    db: AsyncSession,
    series_id,
    current_member_id,
    new_name: str,
) -> Series:
    row = (await db.execute(select(Series).filter(Series.id == series_id))).scalar_one_or_none()
    if row is None:
        raise ValueError("Series not found")
    if str(row.creator_id) != str(current_member_id):
        raise PermissionError("Not your series")
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("Series name cannot be empty")
    row.name = new_name
    await db.commit()
    return row
