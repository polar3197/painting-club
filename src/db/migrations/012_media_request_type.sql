-- Requester-chosen medium type on a media request.
-- The requester now picks the type ("visual_2d" | "written_form" | "audio")
-- in the "propose a media form" dialog, instead of the admin choosing it at
-- approval. Nullable so rows created before this column stay valid; the admin
-- can still override the type when approving.
ALTER TABLE media_request ADD COLUMN IF NOT EXISTS requested_type VARCHAR(50);
