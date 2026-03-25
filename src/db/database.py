# src/db/base.py
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import declarative_base
from config import PostgreSQLConfig

pgconf = PostgreSQLConfig()
DATABASE_URL = pgconf.connection_string  # postgresql+asyncpg://
print(DATABASE_URL)

engine = create_async_engine(DATABASE_URL, echo=True)

Base = declarative_base()
