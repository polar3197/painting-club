-- 028: WIP interface for 2D visual pieces.
-- is_wip flags a piece as work-in-progress. Each "add update" archives the
-- superseded image into wip_update; visual_2d.file_path keeps pointing at the
-- LATEST image so carousels/thumbs/search never special-case WIP.
-- Paper trail only — the live guards run idempotently in
-- src/db/db_manager.py run_migrations() at startup.

ALTER TABLE visual_2d ADD COLUMN IF NOT EXISTS is_wip BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS wip_update (
    id UUID PRIMARY KEY,
    art_id UUID NOT NULL REFERENCES visual_2d(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    aspect_ratio FLOAT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wip_update_art ON wip_update (art_id);
