-- Tracks per-member acceptance of the Painting Club terms of use.
-- Required by App Store guideline 1.2 (user-generated content).
--   docker compose exec db psql -U $PG_USER -d $PG_NAME \
--     -f /path/to/003_terms_acceptance.sql

BEGIN;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

COMMIT;
