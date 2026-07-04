-- Messaging: 1:1 (dm) and group conversations, participants, messages.
-- `conversation` is a polymorphic base (mirroring collection/weekly_prompt):
-- DM-only and group-only attributes live on subtype tables so no base column
-- is NULL-by-type. "One DM per member pair" is enforced by the ordered-pair
-- unique constraint on dm_conversation. Per-participant read state
-- (last_read_at) mirrors the member.comments_last_viewed_at unread pattern.
-- NOTE: this is a paper trail. The app applies the equivalent at boot via
-- db_manager.run_migrations()/init_db(); you don't run this by hand.
BEGIN;

CREATE TABLE IF NOT EXISTS conversation (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type       VARCHAR(20) NOT NULL,  -- 'dm' | 'group'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_conversation (
    id             UUID PRIMARY KEY REFERENCES conversation(id) ON DELETE CASCADE,
    member_low_id  UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    member_high_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    CONSTRAINT uq_dm_pair UNIQUE (member_low_id, member_high_id),
    CONSTRAINT ck_dm_pair_ordered CHECK (member_low_id < member_high_id)
);

CREATE TABLE IF NOT EXISTS group_conversation (
    id         UUID PRIMARY KEY REFERENCES conversation(id) ON DELETE CASCADE,
    title      VARCHAR(300) NOT NULL,
    -- SET NULL so the group survives its creator deleting their account.
    created_by UUID REFERENCES member(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversation_participant (
    conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    member_id       UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
    joined_at       TIMESTAMP DEFAULT NOW(),
    last_read_at    TIMESTAMP,  -- read cursor: messages newer than this are unread
    PRIMARY KEY (conversation_id, member_id)
);

CREATE TABLE IF NOT EXISTS message (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Thread history is always read newest-first per conversation (keyset pagination).
CREATE INDEX IF NOT EXISTS idx_message_conversation_created
    ON message (conversation_id, created_at DESC);

COMMIT;
