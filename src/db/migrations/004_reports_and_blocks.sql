-- Reports queue + per-member blocks (Apple guideline 1.2 — UGC moderation).
-- These tables are also created idempotently by Base.metadata.create_all on app start;
-- this file exists for production parity / docs and can be re-run safely.
--   docker compose exec db psql -U $PG_USER -d $PG_NAME \
--     -f /path/to/004_reports_and_blocks.sql

BEGIN;

CREATE TABLE IF NOT EXISTS report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES member(id),
    target_type VARCHAR(20) NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_member (
    blocker_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    blockee_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blockee_id)
);

COMMIT;
