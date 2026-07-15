-- 020: contributor-authored announcements + an attached discussion thread
-- (paper trail — the live migration is the idempotent CREATE TABLE in
-- db_manager.run_migrations(); create_all covers fresh DBs).
--
-- Authoring an announcement is gated on the contributor role
-- (api.main.get_contributor_member; admin implies contributor). Any member can
-- read announcements and post comments. A comment is deletable by its author or
-- by any contributor (moderation). Deleting an announcement cascades its
-- discussion; if the author's account is removed the announcement survives with
-- a NULL author_id.

CREATE TABLE IF NOT EXISTS announcement (
    id UUID PRIMARY KEY,
    author_id UUID REFERENCES member(id) ON DELETE SET NULL,  -- NULL = author removed
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcement_comment (
    id UUID PRIMARY KEY,
    announcement_id UUID NOT NULL REFERENCES announcement(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);
