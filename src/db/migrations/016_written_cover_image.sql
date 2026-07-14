-- 016: optional cover image on written pieces (paper trail — the live
-- migration is the idempotent ALTER in db_manager.run_migrations()).
--
-- A written piece may carry an image used as its cover in art-element
-- displays, so a text piece can render a picture card. NULL = no cover
-- (the client keeps rendering the text-snippet card).

ALTER TABLE written_form ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR(500);
