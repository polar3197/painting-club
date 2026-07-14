-- Bookmarks: a member's saved collection of other people's pieces.
-- Pure M:N between member and the polymorphic art base (any medium).
-- Composite PK = one bookmark per member per piece (3NF: the whole key).
CREATE TABLE IF NOT EXISTS bookmark (
    member_id  UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    art_id     UUID NOT NULL REFERENCES art(id)    ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (member_id, art_id)
);
