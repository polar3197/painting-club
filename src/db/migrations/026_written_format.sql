-- 026: written media split into short form (poetry/thoughts — scroll reader)
-- vs long form (stories/essays — paged reader). Paper trail for the idempotent
-- guards in run_migrations() (src/db/db_manager.py), which is what actually
-- runs on the Pi at api startup.

ALTER TABLE media ADD COLUMN IF NOT EXISTS written_format VARCHAR(10);
ALTER TABLE media_request ADD COLUMN IF NOT EXISTS requested_format VARCHAR(10);

-- One-time name-based backfill for written media that predate the column.
-- 'short' by name first, then 'long' for the written remainder; both scoped
-- to NULLs so explicitly-set formats are never clobbered.
UPDATE media SET written_format = 'short'
 WHERE type = 'written_form' AND written_format IS NULL
   AND name ~* '(poem|poetry|thought|haiku)';
UPDATE media SET written_format = 'long'
 WHERE type = 'written_form' AND written_format IS NULL;
