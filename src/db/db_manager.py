import uuid

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

# Starter content for the editable "about the app" docs (migration 021). One row
# per About section; seeded once, then contributor-editable. `ethos` carries the
# existing hardcoded aboutContent (flattened to plain text — paragraphs split by
# blank lines); `art`/`aims` start empty. Seeding is ON CONFLICT-guarded on slug,
# so this never overwrites a doc that a contributor has since edited.
_ETHOS_BODY = (
    '"Underlying [the Web\'s] whole infrastructure was the intention to allow for '
    "collaboration, foster compassion and generate creativity — what I term the 3 "
    "C's. It was to be a tool to empower humanity. [...] Yet in the past decade, "
    "instead of embodying these values, the web has instead played a part in "
    'eroding them."\n'
    "— Tim Berners-Lee (creator of the World Wide Web)\n"
    "\n"
    "This is a general introduction to the spirit of Painting Club. Actually this "
    "is all gibberish, an official and succinct doc will be written and placed here "
    "to communicate what is achieved here and why it is fun and philosophically "
    "important.\n"
    "\n"
    "Painting Club is a big bet on my hope that community is more powerful than "
    "dopamine kicks.\n"
    "\n"
    "Online participation has become co-opted and turned into continual and "
    "pervasive exploitation and mental-priming of vulnerable, isolated people, by "
    "powerful idiots. — why do we enter this contract? For a fun way to connect "
    "with our friends over the internet.\n"
    "\n"
    "You have to be one sick mofo to prey upon people's desire to have connection "
    "and community. Connection is the purest and most fragile human desire —and "
    "Zuck twists and corrupts it before it can even stand up on its own.\n"
    "\n"
    "Social connection should not be monetized. Annnnd, that brings us to the four "
    "tenants of Painting Club\n"
    "\n"
    "1. no dopamine hooks\n"
    "2. sincerity as the metric\n"
    "3. no advertising\n"
    "4. no ai (not in a reactionary way, in a humanane way)\n"
    "\n"
    'Some people might say "no dopamine hooks? how will you get people to use the '
    'app?" or "why would people choose painting club over instagram/tiktok?". '
    "These questions miss the point. The goal is not to get users; the goal is not "
    "to harvest attention; the goal is not to coerce members into participating. "
    "The goal is to provide an alternative."
)
# (slug, title, order_index, body)
_DOC_SEED = (
    ("ethos", "Painting Club Ethos", 0, _ETHOS_BODY),
    ("art", "art", 1, ""),
    ("aims", "aims", 2, ""),
)


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

        # Events feature: on some prod DBs a legacy/unrelated `event` table
        # (id, type, color) pre-existed, so create_all SKIPPED building the real
        # Events table — every `POST /events` then 500s with "column creator_id
        # does not exist". The real event/event_host/event_invite tables are
        # empty in that state (no event could ever be created), so drop the
        # mismatched set and let create_all rebuild them with the correct schema.
        # Guarded on the missing creator_id column → runs at most once, and never
        # touches a correctly-shaped (or data-bearing) event table.
        await conn.execute(text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'event'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'event' AND column_name = 'creator_id'
                ) THEN
                    DROP TABLE IF EXISTS event_invite CASCADE;
                    DROP TABLE IF EXISTS event_host CASCADE;
                    DROP TABLE IF EXISTS event CASCADE;
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
        # User-chosen ordering of a profile's media tabs (hold-and-drag).
        # NULL = never customized; queries order position NULLS LAST, then name.
        await conn.execute(text(
            "ALTER TABLE media_members ADD COLUMN IF NOT EXISTS position INT"
        ))
        # Host-configurable accent color on an event.
        await conn.execute(text(
            "ALTER TABLE event ADD COLUMN IF NOT EXISTS color VARCHAR(20)"
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
        # Allow medium-agnostic prompts (promoted from a suggestion with no
        # medium). Idempotent — DROP NOT NULL is a no-op once already nullable.
        await conn.execute(text(
            "ALTER TABLE weekly_prompt ALTER COLUMN media_id DROP NOT NULL"
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
        # --- Stream B (016-017) ---
        # 016: optional cover image on written pieces, shown as the card image
        # in art-element displays. NULL = no cover (text-snippet card).
        await conn.execute(text(
            "ALTER TABLE written_form ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR(500)"
        ))
        # 024: message edit timestamp. NULL = never edited; set to server time on
        # each edit so the client can show "(edited)". New column on an existing
        # table, so create_all won't add it — this guard does.
        await conn.execute(text(
            "ALTER TABLE message ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP"
        ))
        # 017: member-suggested weekly prompts + the admin's ordered up-next
        # queue. create_all also builds this on fresh DBs; this guard covers
        # existing prod DBs. media_id NULL = medium-agnostic suggestion.
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS weekly_prompt_suggestion ("
            "  id UUID PRIMARY KEY,"
            "  member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,"
            "  media_id UUID REFERENCES media(id),"
            "  prompt_text TEXT NOT NULL,"
            "  status VARCHAR(20) NOT NULL DEFAULT 'proposed',"
            "  order_index INT,"
            "  created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        # 020: contributor-authored announcements + their attached discussion.
        # create_all builds these on fresh DBs; guards cover existing prod DBs.
        # author_id SET NULL keeps an announcement if the author is removed.
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS announcement ("
            "  id UUID PRIMARY KEY,"
            "  author_id UUID REFERENCES member(id) ON DELETE SET NULL,"
            "  title VARCHAR(300) NOT NULL,"
            "  body TEXT NOT NULL,"
            "  created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS announcement_comment ("
            "  id UUID PRIMARY KEY,"
            "  announcement_id UUID NOT NULL REFERENCES announcement(id) ON DELETE CASCADE,"
            "  member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,"
            "  text TEXT NOT NULL,"
            "  created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        # 021: editable "about the app" docs (one row per About section).
        # create_all builds this on fresh DBs; the guard covers existing prod
        # DBs. The seed is ON CONFLICT-guarded on slug, so starter content lands
        # exactly once and later contributor edits are never clobbered on reboot.
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS doc ("
            "  id UUID PRIMARY KEY,"
            "  slug VARCHAR(50) UNIQUE NOT NULL,"
            "  title VARCHAR(300) NOT NULL,"
            "  body TEXT NOT NULL DEFAULT '',"
            "  order_index INTEGER NOT NULL DEFAULT 0,"
            "  updated_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        for slug, title, order_index, body in _DOC_SEED:
            await conn.execute(
                text(
                    "INSERT INTO doc (id, slug, title, body, order_index, updated_at) "
                    "VALUES (:id, :slug, :title, :body, :order_index, now()) "
                    "ON CONFLICT (slug) DO NOTHING"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "slug": slug,
                    "title": title,
                    "body": body,
                    "order_index": order_index,
                },
            )
        # Docs go multi-per-section: add `section` and backfill the original
        # one-per-section rows (slug == section key) so they land in the right
        # section list. Idempotent.
        await conn.execute(text(
            "ALTER TABLE doc ADD COLUMN IF NOT EXISTS section VARCHAR(50)"
        ))
        await conn.execute(text(
            "UPDATE doc SET section = slug WHERE section IS NULL"
        ))
        # Weekly prompts get an explicit activated_at — the client's 7-day
        # lifespan ring measures from when a prompt WENT LIVE, which is not
        # collection.created_at (that's when an admin drafted it, possibly days
        # earlier). Backfill from created_at only for prompts that have already
        # been live: it's the sole approximation available for rows predating
        # this column, while never-activated drafts stay NULL so they don't read
        # as having gone live at draft time. Idempotent.
        await conn.execute(text(
            "ALTER TABLE weekly_prompt ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP"
        ))
        await conn.execute(text(
            "UPDATE weekly_prompt wp SET activated_at = c.created_at "
            "FROM collection c "
            "WHERE c.id = wp.id AND wp.activated_at IS NULL "
            "  AND (wp.is_active = TRUE OR wp.archived_at IS NOT NULL)"
        ))
        # 025: inspiration web — external-art catalog + directed "inspired by"
        # edges. create_all builds these on fresh DBs; guards cover prod.
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS external_art ("
            "  id UUID PRIMARY KEY,"
            "  artist VARCHAR(255) NOT NULL,"
            "  title VARCHAR(300),"
            "  image_path VARCHAR(500) NOT NULL,"
            "  created_by UUID REFERENCES member(id) ON DELETE SET NULL,"
            "  created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS inspiration ("
            "  id UUID PRIMARY KEY,"
            "  from_art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,"
            "  to_art_id UUID REFERENCES art(id) ON DELETE CASCADE,"
            "  to_external_id UUID REFERENCES external_art(id) ON DELETE CASCADE,"
            "  created_by UUID REFERENCES member(id) ON DELETE SET NULL,"
            "  created_at TIMESTAMP DEFAULT now(),"
            "  CONSTRAINT inspiration_exactly_one_target"
            "    CHECK ((to_art_id IS NULL) != (to_external_id IS NULL)),"
            "  CONSTRAINT inspiration_unique_art_target UNIQUE (from_art_id, to_art_id),"
            "  CONSTRAINT inspiration_unique_external_target UNIQUE (from_art_id, to_external_id)"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_inspiration_from ON inspiration (from_art_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_inspiration_to_art ON inspiration (to_art_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_inspiration_to_external ON inspiration (to_external_id)"
        ))
        # 026: written media split into short form (poetry/thoughts — the
        # reader scrolls) vs long form (stories/essays — the reader pages).
        # Format lives on the shared media row; NULL on non-written media
        # (clients treat NULL as long form). The backfill guesses from the tab
        # name; the 'long' sweep runs second so it only stamps written media
        # the name pass left NULL. Both touch NULLs only, so an explicit
        # format set later is never overwritten on reboot.
        await conn.execute(text(
            "ALTER TABLE media ADD COLUMN IF NOT EXISTS written_format VARCHAR(10)"
        ))
        await conn.execute(text(
            "ALTER TABLE media_request ADD COLUMN IF NOT EXISTS requested_format VARCHAR(10)"
        ))
        await conn.execute(text(
            "UPDATE media SET written_format = 'short' "
            "WHERE type = 'written_form' AND written_format IS NULL "
            "  AND name ~* '(poem|poetry|thought|haiku)'"
        ))
        await conn.execute(text(
            "UPDATE media SET written_format = 'long' "
            "WHERE type = 'written_form' AND written_format IS NULL"
        ))
        # 027: public artist portfolios — visibility controls + portfolio hierarchy.
        # create_all builds these on fresh DBs; guards cover existing prod DBs.
        # (Was drafted as 026; renumbered — written_format claimed 026 on main.)
        await conn.execute(text(
            "ALTER TABLE art ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'club'"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS portfolio ("
            "  id UUID PRIMARY KEY,"
            "  member_id UUID NOT NULL UNIQUE REFERENCES member(id) ON DELETE CASCADE,"
            "  slug VARCHAR(60) NOT NULL UNIQUE,"
            "  title VARCHAR(120),"
            "  published BOOLEAN NOT NULL DEFAULT FALSE,"
            "  theme JSONB NOT NULL DEFAULT '{}',"
            "  created_at TIMESTAMP DEFAULT now(),"
            "  updated_at TIMESTAMP"
            ")"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS portfolio_block ("
            "  id UUID PRIMARY KEY,"
            "  portfolio_id UUID NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,"
            "  kind VARCHAR(20) NOT NULL,"
            "  position INT NOT NULL DEFAULT 0,"
            "  config JSONB NOT NULL DEFAULT '{}'"
            ")"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS portfolio_block_piece ("
            "  block_id UUID NOT NULL REFERENCES portfolio_block(id) ON DELETE CASCADE,"
            "  art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,"
            "  position INT NOT NULL DEFAULT 0,"
            "  PRIMARY KEY (block_id, art_id)"
            ")"
        ))
        # 028: WIP interface for visual pieces. is_wip flags the piece; each
        # "add update" archives the superseded image into wip_update while
        # file_path keeps pointing at the latest (so nothing downstream changes).
        await conn.execute(text(
            "ALTER TABLE visual_2d ADD COLUMN IF NOT EXISTS is_wip BOOLEAN NOT NULL DEFAULT false"
        ))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS wip_update ("
            " id UUID PRIMARY KEY,"
            " art_id UUID NOT NULL REFERENCES visual_2d(id) ON DELETE CASCADE,"
            " file_path VARCHAR(500) NOT NULL,"
            " aspect_ratio FLOAT,"
            " created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_wip_update_art ON wip_update (art_id)"
        ))
    print("Migrations applied.")
