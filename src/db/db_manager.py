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

    Handles three boot states for the legacy written_word table:
    - Fresh DB: neither table exists. No-op; create_all will create written_form.
    - Already migrated: only written_form exists. No-op.
    - Stuck mid-migration: both tables exist because an earlier buggy boot ran
      create_all before this rename. The empty written_form is dropped and the
      legacy table is renamed in its place. Safe because written_form can't have
      rows yet — the buggy boot crashed before serving any upload."""
    async with engine.begin() as conn:
        await conn.execute(text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'written_word'
                ) THEN
                    DROP TABLE IF EXISTS written_form;
                    ALTER TABLE written_word RENAME TO written_form;
                END IF;
            END $$;
            """
        ))


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
        # Collections — created in create_all but the FK column on art needs
        # to be added to existing databases.
        await conn.execute(text(
            "ALTER TABLE art ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES collection(id)"
        ))
        # Per-user "last viewed" timestamp for the comments-on-my-art dialog,
        # used to render unseen comments in a different colour.
        await conn.execute(text(
            "ALTER TABLE member ADD COLUMN IF NOT EXISTS comments_last_viewed_at TIMESTAMP"
        ))
        # Speeds up cursor pagination of comments-received as the dataset grows.
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_comment_art_created ON comment (art_id, created_at DESC)"
        ))
    print("Migrations applied.")
