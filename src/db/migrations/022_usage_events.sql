-- 022 — behavioral usage trail (#5)
-- Paper-trail only: this is a brand-new table, so create_all builds it at
-- startup. Kept here for the migration record. Stream B owns 022–024.

CREATE TABLE IF NOT EXISTS usage_event (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL,          -- 'login' | 'screen'
    screen      VARCHAR(120),                  -- route name for screen events
    occurred_at TIMESTAMP NOT NULL DEFAULT now(),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_usage_event_member_id ON usage_event (member_id);
CREATE INDEX IF NOT EXISTS ix_usage_event_occurred_at ON usage_event (occurred_at);
