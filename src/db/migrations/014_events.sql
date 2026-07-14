-- Events: description, date + optional time, optional image, public or
-- invite-only. Hosts and invitees are M:N join tables (3NF).
CREATE TABLE IF NOT EXISTS event (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id  UUID NOT NULL REFERENCES member(id),
    title       VARCHAR(300) NOT NULL,
    description TEXT,
    event_date  DATE NOT NULL,
    event_time  TIME,
    image_path  VARCHAR(500),
    is_public   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_host (
    event_id  UUID NOT NULL REFERENCES event(id)  ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS event_invite (
    event_id  UUID NOT NULL REFERENCES event(id)  ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, member_id)
);
