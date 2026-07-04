-- Series for every medium: albums (audio), collections (writing), series
-- (paintings). The series table was already medium-generic (creator_id,
-- media_id, name) and art.series_id lives on the base art table, so the only
-- schema change is generalizing intra-series ordering: it moves from
-- written_form.order_index to art.series_order_index so audio/visual pieces
-- can be ordered too. written_form.order_index is retained and kept in sync
-- by the API (additive transition, nothing dropped).
-- NOTE: this is a paper trail. The app applies the equivalent at boot via
-- db_manager.run_migrations()/init_db(); you don't run this by hand.
BEGIN;

ALTER TABLE art ADD COLUMN IF NOT EXISTS series_order_index INT;

-- Backfill from the legacy written_form column (idempotent: only NULL targets).
UPDATE art SET series_order_index = wf.order_index
FROM written_form wf
WHERE art.id = wf.id
  AND art.series_order_index IS NULL
  AND wf.order_index IS NOT NULL;

COMMIT;
