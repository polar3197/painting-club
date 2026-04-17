-- Adds the temp-password / first-time-setup flow.
-- Run once against the PostgreSQL container:
--   docker compose exec db psql -U $PG_USER -d $PG_NAME \
--     -f /path/to/002_temp_password_flow.sql

BEGIN;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS temp_password_plaintext VARCHAR(32),
    ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMP;

ALTER TABLE application
    ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES member(id);

COMMIT;
