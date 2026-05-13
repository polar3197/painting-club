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
_WRITTEN_FORM_SEED = ("poetry", "writing")


async def pre_init_migrations():
    """Migrations that MUST run before Base.metadata.create_all.

    create_all would otherwise create an empty 'written_form' table on first boot
    after the rename, leaving us unable to ALTER ... RENAME the legacy table."""
    async with engine.begin() as conn:
        # Rename written_word -> written_form before create_all sees the new model.
        # No-op on fresh DBs (the IF EXISTS guard) and on already-migrated DBs.
        await conn.execute(text("ALTER TABLE IF EXISTS written_word RENAME TO written_form"))


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
        # Migrate any rows still using the legacy 'written_word' discriminator
        # before we seed 'written_form' so seeding is a no-op on already-migrated rows.
        await conn.execute(text("UPDATE media SET type='written_form' WHERE type='written_word'"))
        await conn.execute(text("UPDATE art   SET type='written_form' WHERE type='written_word'"))
        await conn.execute(
            text(
                "UPDATE media SET type='written_form' "
                "WHERE name = ANY(:names) AND type IS NULL"
            ),
            {"names": list(_WRITTEN_FORM_SEED)},
        )
        await conn.execute(text(
            "ALTER TABLE media_members ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false"
        ))
        # Canonical source aspect ratio (w/h), captured at upload. Avoids relying on
        # thumbnail pixel dimensions, which drift from source by PIL integer rounding.
        await conn.execute(text(
            "ALTER TABLE visual_2d ADD COLUMN IF NOT EXISTS aspect_ratio DOUBLE PRECISION"
        ))
        await conn.execute(text(
            "ALTER TABLE member ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP"
        ))
    print("Migrations applied.")
