-- User-defined ordering for written_form pieces within a series.
-- order_index is nullable: new pieces land at the bottom (NULLS LAST), tiebreak
-- on date desc to preserve "newest first" feel for ungrouped pieces.
BEGIN;

ALTER TABLE written_form ADD COLUMN IF NOT EXISTS order_index INT;

COMMIT;
