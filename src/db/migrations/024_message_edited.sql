-- 024: message edit timestamp (paper trail — the live migration is the
-- idempotent ALTER in db_manager.run_migrations()).
--
-- Supports message edit/delete: authors can edit their own messages, and the
-- client shows "(edited)" when this is non-NULL. Delete is a hard delete (no
-- column needed). NULL = never edited.

ALTER TABLE message ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
