import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt

from db.models import Member, Media, Media_Members

async def db_get_members(db: AsyncSession):
    result = await db.execute(select(Member))
    return result.scalars().all()

async def db_login_user(db: AsyncSession, username: str, password: str):
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if member and bcrypt.checkpw(password.encode(), member.password_hash.encode()):
        return member
    return None

async def db_create_member(db: AsyncSession, username: str, password: str) -> Member:
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
        firstname: str,
        lastname: str,
) -> Member:
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(
        username=username, 
        password_hash=password_hash, 
        bio=bio, 
        city=city,
        firstname=firstname,
        lastname=lastname,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    print(f"Successfully created new user: {username}")
    return member

async def db_get_profile(db: AsyncSession, username: str):
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if not member:
        return None

    media_result = await db.execute(
        select(Media.name)
        .join(Media_Members, Media.id == Media_Members.media_id)
        .filter(Media_Members.member_id == member.id)
    )
    return member, media_result.scalars().all()

async def db_search_members(db: AsyncSession, city: str | None, uname: str | None):
    query = select(Member)
    print("uname: ", uname)
    print("city: ", city)
    if uname:
        query = query.filter(Member.username == uname)
    if city:
        query = query.where(Member.city == city)
    result = await db.execute(query)
    temp = result.scalars().all()
    print("RESULT: ", temp)
    return temp

async def db_get_search_options(db: AsyncSession):
    usernames_result, cities_result = await asyncio.gather(
        db.execute(select(Member.username).distinct()),
        db.execute(select(Member.city).distinct())
    )
    unique_usernames = usernames_result.scalars().all()
    unique_cities = cities_result.scalars().all()
    return unique_usernames, unique_cities

async def db_add_medium(db: AsyncSession, username: str, medium: str) -> bool:
    # check for user existence
    query = select(Member.id).filter(Member.username==username)
    result = await db.execute(query)
    member_id = result.scalars().first()

    # check media exists
    query = select(Media).filter(Media.name==medium)
    result = await db.execute(query)
    medium_record = result.scalars().first()

    if not medium_record:
    # if medium doesn't exist, create a new entry 
        new_medium = Media(name=medium)
        db.add(new_medium)
        await db.commit()
        await db.refresh(new_medium)
        media_id = new_medium.id
    else:
        media_id = medium_record.id
    
    # check if medium is mapped to member
    query = select(Media_Members).filter(Media_Members.media_id==media_id, Media_Members.member_id==member_id)
    result = await db.execute(query)
    if not result.scalars().one_or_none():
        new_mapping = Media_Members(media_id=media_id, member_id=member_id)
        db.add(new_mapping)
        await db.commit()
        await db.refresh(new_mapping)

    return True
