-- User-chosen ordering of the media tabs on a profile (hold-and-drag).
-- NULL = never customized; profile queries order by position NULLS LAST, then
-- name, so untouched profiles keep the historical alphabetical order.
ALTER TABLE media_members ADD COLUMN IF NOT EXISTS position INT;
