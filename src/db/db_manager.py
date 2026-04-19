from sqlalchemy import text

from db.database import Base, engine

async def init_db():
    print(f"Tables to create: {list(Base.metadata.tables.keys())}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created!")

async def empty_db():
    print(f"Tables to drop: {list(Base.metadata.tables.keys())}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    print("Database tables dropped!")


# Idempotent migrations applied after init_db. Safe to re-run.
# Adds columns to existing tables (create_all only creates missing tables, not
# missing columns) and seeds overarching types for the known media rows.
_VISUAL_2D_SEED = ("painting", "drawing", "stained glass", "photography", "self portraits")
_WRITTEN_WORD_SEED = ("poetry", "writing")


async def run_migrations():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE media ADD COLUMN IF NOT EXISTS type VARCHAR(50)"))
        await conn.execute(
            text(
                "UPDATE media SET type='visual_2d' "
                "WHERE name = ANY(:names) AND type IS NULL"
            ),
            {"names": list(_VISUAL_2D_SEED)},
        )
        await conn.execute(
            text(
                "UPDATE media SET type='written_word' "
                "WHERE name = ANY(:names) AND type IS NULL"
            ),
            {"names": list(_WRITTEN_WORD_SEED)},
        )
    print("Migrations applied.")
