-- Audio media form: voice memos + uploaded music.
-- `audio` is a polymorphic subtype of `art` (discriminator art.type = 'audio'),
-- mirroring visual_2d / written_form. A single file on disk, no series grouping.
-- NOTE: this is a paper trail. The app applies the equivalent at boot via
-- db_manager.run_migrations()/init_db(); you don't run this by hand.
BEGIN;

-- Subtype table (create_all builds this on fresh DBs; spelled out here for parity).
CREATE TABLE IF NOT EXISTS audio (
    id               UUID PRIMARY KEY REFERENCES art(id),
    duration_seconds DOUBLE PRECISION,
    artist           VARCHAR(255)
);

-- Idempotent column guards for DBs where the table predates these columns.
ALTER TABLE audio ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION;
ALTER TABLE audio ADD COLUMN IF NOT EXISTS artist VARCHAR(255);

-- Relabel the pre-existing 'song' media (historically type=NULL) as audio.
UPDATE media SET type='audio' WHERE name='song' AND type IS NULL;

-- Seed the two audio media names (both share type='audio').
INSERT INTO media (id, name, type)
SELECT gen_random_uuid(), 'voice memo', 'audio'
WHERE NOT EXISTS (SELECT 1 FROM media WHERE name = 'voice memo');

INSERT INTO media (id, name, type)
SELECT gen_random_uuid(), 'music', 'audio'
WHERE NOT EXISTS (SELECT 1 FROM media WHERE name = 'music');

COMMIT;
