-- 027: public artist portfolios — visibility controls and portfolio table hierarchy.
-- Paper trail only: create_all builds these on fresh DBs and run_migrations()
-- carries the idempotent guards for prod.

ALTER TABLE art ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'club';

CREATE TABLE IF NOT EXISTS portfolio (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL UNIQUE REFERENCES member(id) ON DELETE CASCADE,
    slug VARCHAR(60) NOT NULL UNIQUE,
    title VARCHAR(120),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    theme JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portfolio_block (
    id UUID PRIMARY KEY,
    portfolio_id UUID NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS portfolio_block_piece (
    block_id UUID NOT NULL REFERENCES portfolio_block(id) ON DELETE CASCADE,
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (block_id, art_id)
);
