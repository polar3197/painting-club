from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Collection


async def db_get_or_create_collection(
    db: AsyncSession,
    creator_id,
    media_id,
    name: str,
) -> Collection:
    """Find a (creator, media, name) collection or create it. Caller is expected
    to commit; this function only flushes so the new row gets an id."""
    name = name.strip()
    existing = await db.execute(
        select(Collection).filter(
            Collection.creator_id == creator_id,
            Collection.media_id == media_id,
            Collection.name == name,
        )
    )
    row = existing.scalars().first()
    if row:
        return row
    new_col = Collection(creator_id=creator_id, media_id=media_id, name=name)
    db.add(new_col)
    await db.flush()
    return new_col


async def db_rename_collection(
    db: AsyncSession,
    collection_id,
    current_member_id,
    new_name: str,
) -> Collection:
    row = (await db.execute(select(Collection).filter(Collection.id == collection_id))).scalar_one_or_none()
    if row is None:
        raise ValueError("Collection not found")
    if str(row.creator_id) != str(current_member_id):
        raise PermissionError("Not your collection")
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("Collection name cannot be empty")
    row.name = new_name
    await db.commit()
    return row
