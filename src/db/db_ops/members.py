
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt

from db.models import Member

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