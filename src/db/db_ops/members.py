
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt

from db.models import Member, Application

async def db_get_members(db: AsyncSession):
    result = await db.execute(select(Member))
    return result.scalars().all()

async def db_login_user(db: AsyncSession, username: str, password: str):
    username = username.lower()
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if member and bcrypt.checkpw(password.encode(), member.password_hash.encode()):
        return member
    return None

async def db_create_member(db: AsyncSession, username: str, password: str) -> Member:
    username = username.lower()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(username=username, password_hash=password_hash)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    print(f"Successfully created new user: {username}")
    return member

async def db_complete_setup(
        db: AsyncSession,
        member: Member,
        new_username: str,
        new_password: str,
) -> Member:
    """Finalize a pending-setup member: update username + password, clear temp state,
    resolve the linked application. Raises ValueError if the username is already taken."""
    taken = (await db.execute(
        select(Member).filter(Member.username == new_username, Member.id != member.id)
    )).scalar_one_or_none()
    if taken is not None:
        raise ValueError("Username is taken")

    member.username = new_username
    member.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member.must_change_password = False
    member.temp_password_plaintext = None
    member.temp_password_expires_at = None

    app_row = (await db.execute(
        select(Application).filter(Application.member_id == member.id)
    )).scalar_one_or_none()
    if app_row is not None:
        app_row.status = "resolved"

    await db.commit()
    await db.refresh(member)
    return member


async def db_create_full_member(
        db: AsyncSession, 
        username: str, 
        password: str,
        bio: str,
        city: str,
        state: str,
        firstname: str,
        lastname: str,
) -> Member:
    username = username.lower()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(
        username=username,
        password_hash=password_hash, 
        bio=bio, 
        city=city,
        state=state,
        firstname=firstname,
        lastname=lastname,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    print(f"Successfully created new user: {username}")
    return member