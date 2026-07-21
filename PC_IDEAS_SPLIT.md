# PC Ideas — two-stream split

Five new feature ideas, divided into two parallel Claude workstreams. Same
collision-avoidance playbook as the last round (isolated worktrees, pre-assigned
migration numbers, one owner per new `db_ops/*.py`, fast-forward merge to main).

Main is at migration **018**. Stream A → **019–021**, Stream B → **022–024**
(numbered `.sql` files are paper-trail only; real migrations are idempotent
statements in `db_manager.run_migrations()` + `create_all` for new tables).

Shared hotspots to serialize on: `src/db/models.py`, `src/api/main.py`,
`src/api/models.py`, `ios-v1/src/navigation/index.tsx`, `ios-v1/src/screens/Admin.tsx`,
`ios-v1/src/api/index.ts`, `ios-v1/src/api/types.ts`.

---

## Decisions (from Charlie, 2026-07-14)

- **Contributor role = content + moderation.** Contributors can post
  announcements, edit docs, moderate announcement discussions (delete comments),
  and view the usage panel. No member/app-admin powers beyond that.
- **"Memory usage logging" = both, separate.** Two distinct Stream-B features:
  (a) a behavioral in-app usage trail (logins + navigation), and (b) device
  memory/perf telemetry (crashes, memory pressure) for diagnostics.

---

## Stream A — Contributor role + creation surfaces  *(Charlie's session / me)*

**Owns the contributor-role foundation and lands it first** so Stream B can gate
its panel on it.

1. **Contributor role**
   - New role value; `get_contributor_member` auth dependency mirroring
     `get_admin_member` (main.py:296). Admin implies contributor.
   - Expose in `Profile.role` (already a field). Admin UI to grant/revoke the role.
2. **Announcements** (new table + `db_ops/announcements.py`)
   - Contributor-authored; each announcement has an attached **discussion**
     (comments) thread. Contributors can delete comments (moderation).
   - FE: feed + compose (contributor-gated) + discussion view. Build on the
     existing unused `ios-v1/src/components/Announcements.tsx`.
3. **Docs upload/edit** (new table + `db_ops/docs.py`)
   - `ios-v1/src/constants/aboutContent.ts` is static (3 sections) → back it with
     a docs table + contributor edit UI. Members read; contributors edit.

Migrations: **019** (role), **020** (announcements + comments), **021** (docs).

## Stream B — Events surface + observability  *(other Claude)*

Gates the usage panel on Stream A's contributor role — until that lands, gate on
admin and swap the dependency after A merges.

4. **Events surface** — FE ONLY. The Events backend is already built and deployed
   (10 event routes live in main.py). Build list / detail / create-edit / invites.
5. **Usage logging — behavioral trail** — telemetry ingestion: login events +
   in-app navigation (screen focus). New table + ingest endpoint; client emits
   from a navigation listener.
6. **Usage logging — device/perf telemetry** — separate ingestion for memory
   pressure / crashes / perf. Separate table from #5.
7. **Contributor usage panel** — reads #5 + #6: who logged in, where they went,
   per-day. Gated on the contributor role.

Migrations: **022** (behavioral usage), **023** (device/perf telemetry),
**024** (any panel/index tables).

---

## Sequencing

1. Stream A lands the contributor role (migration 019, `Profile.role`, auth dep)
   **first**. Small, unblocks B.
2. Both streams proceed in parallel on their own worktrees.
3. B rebases onto A's role change before wiring the panel's auth.
