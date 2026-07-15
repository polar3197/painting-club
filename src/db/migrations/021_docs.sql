-- 021: editable "about the app" docs, one row per About section
-- (paper trail — the live migration is the idempotent CREATE TABLE + seed in
-- db_manager.run_migrations(); create_all covers fresh DBs).
--
-- Backs the previously-static ios-v1 aboutContent. Any member reads
-- (GET /docs, GET /docs/{slug}); contributors edit (PUT /docs/{slug}, gated on
-- api.main.get_contributor_member). `body` is plain text (paragraphs separated
-- by blank lines); `slug` is the About section key (ethos/art/aims) and
-- `order_index` fixes the section order in the hub. Docs are seeded, not
-- created on the fly, so there is no POST route. The seed (ethos starter text
-- from the old aboutContent; art/aims empty) is ON CONFLICT-guarded on slug so
-- it runs exactly once and never overwrites a contributor's later edit.

CREATE TABLE IF NOT EXISTS doc (
    id UUID PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,   -- About section key: ethos/art/aims
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT now()
);
