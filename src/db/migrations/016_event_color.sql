-- Host-configurable accent color on an event (e.g. '#rrggbb'), configured later.
-- NULL = client default palette.
ALTER TABLE event ADD COLUMN IF NOT EXISTS color VARCHAR(20);
