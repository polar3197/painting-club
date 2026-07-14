

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, nulls_last

from db.models import Member, Media, Media_Members, BlockedMember
from api.models import ProfileUpdate

async def db_get_profile(db: AsyncSession, username: str):
    username = username.lower()
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if not member:
        return None

    media_result = await db.execute(
        select(Media.name, Media_Members.hidden)
        .join(Media_Members, Media.id == Media_Members.media_id)
        .filter(Media_Members.member_id == member.id)
        # User-chosen tab order first (hold-and-drag reorder, NULL = never
        # customized → sorts last), then alphabetical. Also makes the order
        # stable across fetches — without an ORDER BY Postgres may return a
        # different order on mount vs. focus refetch and the profile's media
        # tabs visibly reshuffle.
        .order_by(nulls_last(Media_Members.position), Media.name)
    )
    shown: list[str] = []
    hidden: list[str] = []
    for name, is_hidden in media_result.all():
        (hidden if is_hidden else shown).append(name)
    return member, shown, hidden


async def db_get_blocked_usernames(db: AsyncSession, blocker_id) -> list[str]:
    rows = (
        await db.execute(
            select(Member.username)
            .join(BlockedMember, BlockedMember.blockee_id == Member.id)
            .filter(BlockedMember.blocker_id == blocker_id)
        )
    ).scalars().all()
    return list(rows)

async def db_update_profile(db: AsyncSession, username: str, payload: ProfileUpdate):
    username = username.lower()
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if not member:
        return None
    # exclude_unset: only fields the client actually sent are written. Without
    # it, optional fields a client omits (e.g. profile_colors from pre-colors
    # app builds) would default to None and wipe the stored value.
    for field, value in payload.model_dump(exclude_unset=True).items():
          setattr(member, field, value)
    await db.commit()
    return member
