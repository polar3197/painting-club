#!/bin/bash
set -euo pipefail
DB_USER="${PG_USER:-painting-admin}"
DB_NAME="${PG_NAME:-painting-club}"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
ALTER TABLE member ADD COLUMN IF NOT EXISTS profile_pic_path VARCHAR(300);
SQL
mkdir -p /mnt/ssd/painting-club/static/profile
