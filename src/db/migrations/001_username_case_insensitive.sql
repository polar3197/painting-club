-- One-time migration: make usernames case-insensitive.
-- Run once against the PostgreSQL container:
--   docker compose exec db psql -U $PG_USER -d $PG_NAME \
--     -f /path/to/001_username_case_insensitive.sql
--
-- Before running, verify no case-variant collisions exist:
--   SELECT LOWER(username), COUNT(*) FROM member
--   GROUP BY 1 HAVING COUNT(*) > 1;
-- If rows are returned, resolve the duplicates manually first.

BEGIN;

UPDATE member SET username = LOWER(username);

CREATE UNIQUE INDEX IF NOT EXISTS member_username_lower_idx
  ON member (LOWER(username));

COMMIT;
