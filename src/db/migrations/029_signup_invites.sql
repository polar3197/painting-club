-- 029: QR signup invites — a rotatable, expiring token printed on flyers lets
-- a scanner create an account in the browser with no admin code. Members
-- created this way carry signup_invite_id for after-the-fact review.
-- Paper trail only: create_all builds these on fresh DBs and run_migrations()
-- carries the idempotent guards for prod.

CREATE TABLE IF NOT EXISTS signup_invite (
    id UUID PRIMARY KEY,
    token VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(120),
    max_uses INT,
    uses INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE member ADD COLUMN IF NOT EXISTS signup_invite_id UUID REFERENCES signup_invite(id);
