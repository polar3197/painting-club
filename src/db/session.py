# src/db/session.py
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from db.database import engine

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
