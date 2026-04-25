from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from db.models import Member, BlockedMember


async def db_block_member(db: AsyncSession, blocker_id, blockee_id) -> bool:
    """Returns True if a new block edge was created, False if it already existed.
    Raises ValueError if a member tries to block themselves."""
    if str(blocker_id) == str(blockee_id):
        raise ValueError("Cannot block yourself")
    existing = (
        await db.execute(
            select(BlockedMember).filter(
                BlockedMember.blocker_id == blocker_id,
                BlockedMember.blockee_id == blockee_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return False
    db.add(BlockedMember(blocker_id=blocker_id, blockee_id=blockee_id))
    await db.commit()
    return True


async def db_unblock_member(db: AsyncSession, blocker_id, blockee_id) -> bool:
    """Returns True if a row was deleted."""
    result = await db.execute(
        delete(BlockedMember).where(
            BlockedMember.blocker_id == blocker_id,
            BlockedMember.blockee_id == blockee_id,
        )
    )
    await db.commit()
    return (result.rowcount or 0) > 0


async def db_list_blocks(db: AsyncSession, blocker_id) -> list[str]:
    """Usernames the given member has blocked."""
    rows = (
        await db.execute(
            select(Member.username)
            .join(BlockedMember, BlockedMember.blockee_id == Member.id)
            .filter(BlockedMember.blocker_id == blocker_id)
        )
    ).scalars().all()
    return list(rows)


async def db_resolve_username(db: AsyncSession, username: str):
    """Helper: username -> Member row (or None)."""
    return (
        await db.execute(select(Member).filter(Member.username == username.lower()))
    ).scalar_one_or_none()


async def db_is_blocked(db: AsyncSession, blocker_id, blockee_id) -> bool:
    """True if blocker has blocked blockee (asymmetric)."""
    row = (
        await db.execute(
            select(BlockedMember.blocker_id).filter(
                BlockedMember.blocker_id == blocker_id,
                BlockedMember.blockee_id == blockee_id,
            )
        )
    ).scalar_one_or_none()
    return row is not None
