-- Per-member profile page colors (edit profile -> color scheme tab).
-- JSONB object mapping component keys (bg, statementBox, mediaTab,
-- mediaTabSelected, picFrame, artCardBg, actionBtn) to color strings
-- ('#rrggbb'). NULL = member never customized; clients fall back to the
-- app-default palette, so future default tweaks reach uncustomized members.
-- Also applied idempotently at boot by db_manager.run_migrations().
--   docker compose exec db psql -U $PG_USER -d $PG_NAME \
--     -f /path/to/009_profile_colors.sql

BEGIN;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS profile_colors JSONB;

COMMIT;
