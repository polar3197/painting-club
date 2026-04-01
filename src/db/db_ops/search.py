
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Member, Media, Media_Members, Visual2D

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