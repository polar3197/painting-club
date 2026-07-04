-- Feature-request board: members post requests for the app and up/down vote them.
-- One vote per member per request (composite PK); re-voting the same direction
-- retracts, the opposite direction switches. Cascades keep member deletion clean.
-- NOTE: this is a paper trail. The app applies the equivalent at boot via
-- db_manager.run_migrations()/init_db(); you don't run this by hand.
BEGIN;

CREATE TABLE IF NOT EXISTS feature_request (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id  UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    title      VARCHAR(300) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_request_vote (
    request_id UUID NOT NULL REFERENCES feature_request(id) ON DELETE CASCADE,
    member_id  UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    value      INTEGER NOT NULL,  -- +1 up, -1 down
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (request_id, member_id)
);

COMMIT;
