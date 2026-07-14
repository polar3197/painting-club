-- 017: member-suggested weekly prompts + the admin's ordered "up next" queue
-- (paper trail — the live migration is the idempotent CREATE TABLE in
-- db_manager.run_migrations(); create_all covers fresh DBs).
--
-- A member picks a medium (or none = medium-agnostic), writes prompt text and
-- submits. Admin reviews: proposed → approved (appended to the up-next queue,
-- order_index = max+1, reorderable) or rejected. order_index mirrors the
-- series/album ordering pattern used elsewhere.

CREATE TABLE IF NOT EXISTS weekly_prompt_suggestion (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    media_id UUID REFERENCES media(id),          -- NULL = medium agnostic
    prompt_text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'proposed',  -- proposed | approved | rejected
    order_index INT,                              -- up-next position (approved only)
    created_at TIMESTAMP DEFAULT now()
);
