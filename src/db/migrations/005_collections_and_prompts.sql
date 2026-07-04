-- Rename the legacy per-creator "collection" (WrittenForm-only feature) to "series"
-- so the bare name "collection" can be reclaimed as the polymorphic base for
-- app-wide groupings (weekly prompts now, more later). Then drop the legacy
-- profile-question prompt tables and create the new collection/weekly_prompt pair.
--
-- For dev / fresh DBs the same logic also lives in db_manager.pre_init_migrations
-- so app startup converges to this schema even without manually running the file.

BEGIN;

-- 1. Rename old per-creator collection → series.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'collection'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'collection' AND column_name = 'creator_id'
    ) THEN
        ALTER TABLE collection RENAME TO series;
    END IF;
END $$;

-- 2. Rename art.collection_id → art.series_id to match (FK now points at the series table).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'art' AND column_name = 'collection_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'art' AND column_name = 'series_id'
    ) THEN
        ALTER TABLE art RENAME COLUMN collection_id TO series_id;
    END IF;
END $$;

-- 3. Drop legacy profile-question prompt tables (unused, freeing the name).
DROP TABLE IF EXISTS prompt_records;
DROP TABLE IF EXISTS prompt;

-- 4. New abstract collection base (polymorphic via "type" discriminator).
CREATE TABLE IF NOT EXISTS collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    short_summary TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Server defaults: SQLAlchemy's create_all skips defaults, so set them here
-- in case the table already existed when this script first ran.
ALTER TABLE collection ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE collection ALTER COLUMN created_at SET DEFAULT NOW();

-- 5. weekly_prompt subtype. Inherits id from collection (SQLAlchemy joined-table
-- inheritance). media_id pins which medium submissions must use.
CREATE TABLE IF NOT EXISTS weekly_prompt (
    id UUID PRIMARY KEY REFERENCES collection(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id),
    is_active BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMP
);

-- 6. Exactly one active weekly_prompt at a time, enforced by a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_weekly_prompt
    ON weekly_prompt ((TRUE)) WHERE is_active = true;

-- 7. New art.collection_id linking any Art row to the new polymorphic collection.
-- ON DELETE SET NULL keeps the art when an admin deletes a prompt.
ALTER TABLE art
    ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES collection(id) ON DELETE SET NULL;

-- 8. One submission per user per collection (enforced where collection_id is set).
CREATE UNIQUE INDEX IF NOT EXISTS one_submission_per_collection
    ON art (creator_id, collection_id) WHERE collection_id IS NOT NULL;

COMMIT;
