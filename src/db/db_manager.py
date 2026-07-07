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
# Both share the polymorphic 'audio' Art type but are distinct media names so a
# member can add either to their profile independently.
_AUDIO_SEED = ("music",)


async def pre_init_migrations():
    """Migrations that MUST run before Base.metadata.create_all.

    Handles three boot states for the legacy written_word table:
    - Fresh DB: neither table exists. No-op; create_all will create written_form.
    - Already migrated: only written_form exists. No-op.
    - Stuck mid-migration: both tables exist because an earlier buggy boot ran
      create_all before this rename. The empty written_form is dropped and the
      legacy table is renamed in its place. Safe because written_form can't have
      rows yet — the buggy boot crashed before serving any upload.

    Also handles the collection→series rename so a live DB upgrades cleanly:
    the old per-creator "collection" table gets renamed to "series" (and the FK
    column on art moves with it). create_all then creates the brand-new
    polymorphic "collection" base + "weekly_prompt" subtype."""
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

        # Rename legacy per-creator collection table → series. We detect the legacy
        # variant by the presence of the creator_id column (the new abstract
        # collection table has no such column).
        await conn.execute(text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'collection'
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'collection'
                          AND column_name = 'creator_id'
                ) THEN
                    ALTER TABLE collection RENAME TO series;
                END IF;
            END $$;
            """
        ))

        await conn.execute(text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'art'
                          AND column_name = 'collection_id'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'art'
                          AND column_name = 'series_id'
                ) THEN
                    ALTER TABLE art RENAME COLUMN collection_id TO series_id;
                END IF;
            END $$;
            """
        ))

        # Legacy profile-question tables are dropped — they were never used.
        await conn.execute(text("DROP TABLE IF EXISTS prompt_records"))
        await conn.execute(text("DROP TABLE IF EXISTS prompt"))


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
        # Relabel the pre-existing 'song' media (historically type=NULL) as audio
        # so it renders/uploads through the audio pipeline. Scoped to type IS NULL
        # so we never clobber an intentional type set later.
        await conn.execute(text(
            "UPDATE media SET type='audio' WHERE name='song' AND type IS NULL"
        ))
        # Seed the audio media forms. INSERT-WHERE-NOT-EXISTS keeps this
        # idempotent: media.name has no unique constraint and create_all skips
        # the Python-side id default, so we supply gen_random_uuid() explicitly.
        # CAST is required: :name appears in both the SELECT list (untyped) and
        # the VARCHAR comparison, and asyncpg's prepared statements refuse the
        # ambiguity ("text versus character varying") without it.
        for _audio_name in _AUDIO_SEED:
            await conn.execute(
                text(
                    "INSERT INTO media (id, name, type) "
                    "SELECT gen_random_uuid(), CAST(:name AS VARCHAR), 'audio' "
                    "WHERE NOT EXISTS (SELECT 1 FROM media WHERE name = CAST(:name AS VARCHAR))"
                ),
                {"name": _audio_name},
            )
        # The `audio` subtype table is created by create_all on fresh DBs; these
        # guards add the columns on any DB where the table predates them (mirrors
        # the visual_2d.aspect_ratio pattern below).
        await conn.execute(text(
            "ALTER TABLE audio ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION"
        ))
        await conn.execute(text(
            "ALTER TABLE audio ADD COLUMN IF NOT EXISTS artist VARCHAR(255)"
        ))
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
        # Series (the renamed per-creator grouping) — the FK column on art needs
        # to exist on databases predating the column.
        await conn.execute(text(
            "ALTER TABLE art ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id)"
        ))
        # Collection (the new polymorphic base) — link from art to the abstract base.
        await conn.execute(text(
            "ALTER TABLE art ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES collection(id) ON DELETE SET NULL"
        ))
        # One submission per user per collection.
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS one_submission_per_collection "
            "ON art (creator_id, collection_id) WHERE collection_id IS NOT NULL"
        ))
        # User-defined ordering within a series for written_form pieces.
        await conn.execute(text(
            "ALTER TABLE written_form ADD COLUMN IF NOT EXISTS order_index INT"
        ))
        # Exactly one active weekly_prompt at a time.
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS one_active_weekly_prompt "
            "ON weekly_prompt ((TRUE)) WHERE is_active = true"
        ))
        # SQLAlchemy create_all skips DB-side defaults — set them here so raw
        # SQL inserts (seeds, future migrations) don't need to specify id/created_at.
        await conn.execute(text(
            "ALTER TABLE collection ALTER COLUMN id SET DEFAULT gen_random_uuid()"
        ))
        await conn.execute(text(
            "ALTER TABLE collection ALTER COLUMN created_at SET DEFAULT NOW()"
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
        # Per-member profile page colors (edit profile -> color scheme tab).
        # NULL = never customized; clients fall back to the default palette.
        await conn.execute(text(
            "ALTER TABLE member ADD COLUMN IF NOT EXISTS profile_colors JSONB"
        ))
        # Thread history is always read newest-first per conversation.
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_message_conversation_created "
            "ON message (conversation_id, created_at DESC)"
        ))
        # Series ordering generalized to every medium (albums, painting series):
        # position moves to the art base table. written_form.order_index stays
        # in sync (writes go to both) but art.series_order_index is the truth.
        await conn.execute(text(
            "ALTER TABLE art ADD COLUMN IF NOT EXISTS series_order_index INT"
        ))
        await conn.execute(text(
            "UPDATE art SET series_order_index = wf.order_index "
            "FROM written_form wf "
            "WHERE art.id = wf.id AND art.series_order_index IS NULL "
            "AND wf.order_index IS NOT NULL"
        ))
        # Requester-chosen medium type on a media request. The requester now
        # picks the type in the "propose a media form" dialog; the admin just
        # approves. Nullable so rows created before this column stay valid.
        await conn.execute(text(
            "ALTER TABLE media_request ADD COLUMN IF NOT EXISTS requested_type VARCHAR(50)"
        ))
    print("Migrations applied.")
