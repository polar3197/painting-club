-- 025: inspiration web — directed "inspired by" edges between club pieces,
-- plus a club-shared catalog of external (outside-the-club) pieces to cite.
-- Paper trail only: create_all builds these on fresh DBs and run_migrations()
-- carries the idempotent guards for prod.

CREATE TABLE IF NOT EXISTS external_art (
  id          UUID PRIMARY KEY,
  artist      VARCHAR(255) NOT NULL,
  title       VARCHAR(300),
  image_path  VARCHAR(500) NOT NULL,
  created_by  UUID REFERENCES member(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspiration (
  id              UUID PRIMARY KEY,
  from_art_id     UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
  to_art_id       UUID REFERENCES art(id) ON DELETE CASCADE,
  to_external_id  UUID REFERENCES external_art(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES member(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT now(),
  -- exactly one target: another club piece XOR an external piece
  CONSTRAINT inspiration_exactly_one_target
    CHECK ((to_art_id IS NULL) != (to_external_id IS NULL)),
  CONSTRAINT inspiration_unique_art_target UNIQUE (from_art_id, to_art_id),
  CONSTRAINT inspiration_unique_external_target UNIQUE (from_art_id, to_external_id)
);

CREATE INDEX IF NOT EXISTS idx_inspiration_from ON inspiration (from_art_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_to_art ON inspiration (to_art_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_to_external ON inspiration (to_external_id);
