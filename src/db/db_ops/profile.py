

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Member, Media, Media_Members
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
    )
    shown: list[str] = []
    hidden: list[str] = []
    for name, is_hidden in media_result.all():
        (hidden if is_hidden else shown).append(name)
    return member, shown, hidden

async def db_update_profile(db: AsyncSession, username: str, payload: ProfileUpdate):
    username = username.lower()
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if not member:
        return None
    for field, value in payload.model_dump().items():
          setattr(member, field, value)
    await db.commit()
    return member
