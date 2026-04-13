#!/bin/bash
# One-off migration: comment.username -> comment.member_id, and rename static dirs to member_id.
# Run on the Pi from ~/painting-club. Requires the stack to be running.

set -euo pipefail

DB_USER="${PG_USER:-painting-admin}"
DB_NAME="${PG_NAME:-painting-club}"
STATIC_ROOT="/mnt/ssd/painting-club/static/art"

echo "== 1. Migrating comment table =="
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
BEGIN;
ALTER TABLE comment ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES member(id) ON DELETE CASCADE;
UPDATE comment c SET member_id = m.id FROM member m WHERE c.username = m.username AND c.member_id IS NULL;
ALTER TABLE comment ALTER COLUMN member_id SET NOT NULL;
ALTER TABLE comment DROP CONSTRAINT IF EXISTS comment_username_fkey;
ALTER TABLE comment DROP COLUMN IF EXISTS username;
COMMIT;
SQL

echo "== 2. Renaming static dirs from username to member_id =="
mapfile -t rows < <(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -F'|' \
  -c "SELECT username, id FROM member;")

for row in "${rows[@]}"; do
  uname="${row%%|*}"
  mid="${row##*|}"
  src="$STATIC_ROOT/$uname"
  dst="$STATIC_ROOT/$mid"
  if [ -d "$src" ] && [ ! -e "$dst" ]; then
    echo "  mv $src -> $dst"
    mv "$src" "$dst"
  fi
done

echo "== 3. Updating visual_2d.file_path =="
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
UPDATE visual_2d v
SET file_path = REPLACE(v.file_path, '/static/art/' || m.username || '/', '/static/art/' || m.id::text || '/')
FROM art a, member m
WHERE v.id = a.id AND a.creator_id = m.id
  AND v.file_path LIKE '/static/art/' || m.username || '/%';
SQL

echo "== Done =="
