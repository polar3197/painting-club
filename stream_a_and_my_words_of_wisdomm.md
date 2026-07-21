# Stream A handoff + words of wisdom

Everything another Claude needs to pick up **Stream A** (contributor role +
announcements/docs) mid-flight. Written 2026-07-14.

The high-level divvy lives in **`PC_IDEAS_SPLIT.md`** — read that first for the
two-stream split and who owns what. This doc is the *implementation* handoff for
Stream A specifically.

---

## The three Stream-A tasks and their state

| # | Task | State |
|---|------|-------|
| 1 | Contributor role foundation | ✅ **DONE**, typechecked clean. NOT committed/deployed. |
| 2 | Announcements + discussion | 🟡 **Backend done, FE not started.** One paper-trail file missing (see below). |
| 3 | Docs upload/edit | ⛔ **Not started.** |

**Nothing has been committed, pushed, or deployed.** All changes are uncommitted
in the `stream-b` worktree (yes, Stream A work is living in the `stream-b`
worktree dir — that's just the checkout I'm in; the *branch* is `main`). Charlie
requires explicit per-action approval before any git commit/push/deploy.

---

## Task 1 — Contributor role foundation ✅ (this is what unblocks Stream B)

Role hierarchy is now **member < contributor < admin**; admin implies
contributor. Contributor grants: post announcements, edit docs, moderate
announcement discussions. Decided with Charlie: **content + moderation**, no
member/app-admin powers beyond that.

Files changed:
- `src/db/db_ops/members.py` — `VALID_ROLES = {"member","contributor","admin"}`;
  fixed the last-admin demote guard from `role == "member"` to `role != "admin"`
  (demoting admin→contributor also loses an admin — the old guard missed it).
- `src/api/main.py` — new `get_contributor_member` dep (mirrors
  `get_admin_member` at ~line 296; allows `role in ("contributor","admin")`).
  New `GET /admin/members` endpoint (all members + roles, trusted tiers sorted
  first) → `AdminMemberOut`.
- `src/api/models.py` — added `AdminMemberOut`; updated `MemberRoleUpdate`
  comment. The role PATCH endpoint already existed and validates against
  VALID_ROLES, so it accepts "contributor" for free.
- `ios-v1/src/api/types.ts` — `MemberRole` type + `AdminMemberOut`.
- `ios-v1/src/api/index.ts` — `get_admin_members(token)`,
  `set_member_role(username, role, token)` (PATCH `/admin/members/{u}/role`).
- `ios-v1/src/screens/Admin.tsx` — new **members** tab with a per-member role
  picker (member/contributor/admin chips, optimistic update + rollback). New
  `MemberRoleRow` component + `memberRow`/`roleChip*` styles.
- `src/db/migrations/019_contributor_role.sql` — paper-trail (no DDL; role col
  already free VARCHAR(20)).

Verified: iOS `npx tsc --noEmit` exits 0; backend `py_compile` clean. NOT
runtime-tested (no fastapi in this worktree's env — see wisdom #4).

---

## Task 2 — Announcements + discussion 🟡 (backend done, FE to do)

Data model: `announcement` (author_id SET NULL, title, body, created_at) +
`announcement_comment` (announcement_id CASCADE, member_id CASCADE, text,
created_at). Any member reads + comments; contributor authoring; comment
deletable by its author OR any contributor (moderation); deleting an
announcement cascades its discussion.

Backend files DONE:
- `src/db/models.py` — `Announcement` + `AnnouncementComment` models (added
  just before `class Art`).
- `src/db/db_ops/announcements.py` — NEW. `db_create_announcement`,
  `db_list_announcements` (returns `(announcement, author_username,
  author_firstname, comment_count)` via a grouped comment-count subquery +
  outerjoin so authorless rows survive), `db_get_announcement`,
  `db_delete_announcement`, `db_list_comments`, `db_add_comment`,
  `db_get_comment`, `db_delete_comment`.
- `src/api/models.py` — `AnnouncementIn`, `AnnouncementCommentIn`,
  `AnnouncementCommentOut`, `AnnouncementOut`, `AnnouncementDetailOut`
  (extends Out with `comments: list`).
- `src/api/main.py` — routes after the prompt-review route (~line 1590):
  `POST /announcements` (contributor), `GET /announcements`,
  `GET /announcements/{id}` (detail w/ comments), `DELETE /announcements/{id}`
  (author or contributor), `POST /announcements/{id}/comments`,
  `DELETE /announcements/{id}/comments/{comment_id}`. Plus helpers
  `_is_contributor`, `_announcement_out`, `_announcement_comment_out`.
  **Import note:** the announcements db_ops are imported into main.py with
  ALIASES (`db_add_comment as db_add_announcement_comment`, etc.) because
  `db.db_ops.comments` already exports `db_add_comment`/`db_delete_comment`.
  Don't drop the aliases or you'll shadow the art-comment ops.
- `src/db/db_manager.py` — idempotent `CREATE TABLE IF NOT EXISTS` guards for
  both tables (after the weekly_prompt_suggestion guard).

✅ `src/db/migrations/020_announcements.sql` paper-trail exists (was briefly
missing after a model outage; recreated).

✅ Backend re-verified: `python3 -m py_compile src/api/main.py src/api/models.py
src/db/db_manager.py src/db/db_ops/announcements.py src/db/models.py` is clean.
(Still only a syntax check — no runtime/import test yet; see wisdom #4.)

**Announcements FE — NOT started.** What's needed:
- `ios-v1/src/api/types.ts` + `index.ts`: `AnnouncementOut`,
  `AnnouncementDetailOut`, `AnnouncementCommentOut` types; `get_announcements`,
  `get_announcement`, `create_announcement`, `delete_announcement`,
  `add_announcement_comment`, `delete_announcement_comment` fns.
- There's an **existing unused `ios-v1/src/components/Announcements.tsx`** — build
  the feed on it. Add an announcement-detail screen for the discussion (mirror
  `ConversationThread.tsx` for the comment-thread + keyboard-aware input, and the
  art comment UI for comment rows).
- Compose UI gated on `profile.role in ('contributor','admin')` (Profile.role is
  already exposed). Mirror `ProposePromptDialog.tsx` for a swipe-down compose
  sheet if you want consistency.
- Wire into `ios-v1/src/navigation/index.tsx` (SHARED with Stream B — localize).

---

## Task 3 — Docs upload/edit ⛔ (not started)

Goal: `ios-v1/src/constants/aboutContent.ts` is static (3 hardcoded sections).
Back it with a docs table + `db_ops/docs.py`; members read, contributors edit.
Suggested shape: a `doc` table (slug/title/body/order_index/updated_at) seeded
from the current aboutContent sections, `GET /docs` + `GET /docs/{slug}` (any
member), `PUT /docs/{slug}` (contributor). FE: render docs from the API in the
About screens (`About.tsx`/`AboutSection.tsx`/`AboutPost.tsx`) + a contributor
edit affordance. Migration **021**.

---

## Migration numbering (coordinate with Stream B!)

main is at **018**. **Stream A → 019–021**, Stream B → 022–024. Used so far:
019 (role, done), 020 (announcements — recreate the file). Docs gets **021**.
Numbered `.sql` files are **paper-trail only**; the *real* migration is
idempotent statements in `db_manager.run_migrations()` + `create_all` for new
tables (all additive, never destructive).

---

## Words of wisdom (gotchas I hit / conventions to respect)

1. **`create_all` DOES create new tables on existing DBs**, but the codebase
   still adds explicit `CREATE TABLE IF NOT EXISTS` guards in
   `run_migrations()` for every new table (belt-and-suspenders + paper trail).
   Follow the pattern — I did for the announcement tables.
2. **Alias-collision in main.py imports.** `db_add_comment`/`db_delete_comment`
   exist in BOTH `comments.py` (art) and my `announcements.py`. I aliased the
   announcement ones on import. Watch for this when adding more db_ops.
3. **Route ordering:** literal path segments must be declared BEFORE
   `/{param}` routes or FastAPI captures them as params (see the
   `/admin/weekly-prompts/reorder` before `/{suggestion_id}` comment). My
   announcement routes have no such conflict, but keep it in mind for docs.
4. **This worktree has NO python deps** (`fastapi` not importable) — `py_compile`
   only checks syntax, not imports/runtime. The proven way to actually test the
   backend: throwaway `postgres:16` docker + local `uvicorn` on a spare port
   (last round used 8135) + httpx scenario scripts. `import httpx as requests`
   if `requests` is missing from the venv. Do this before proposing a deploy.
5. **AppTextInput force-disables autoCorrect/spellCheck app-wide.** For any
   free-text field where you WANT autocorrect (announcement body, comments), use
   raw RN `TextInput` with explicit `autoCorrect`/`spellCheck` — see
   `ConversationThread.tsx` for the precedent.
6. **Deploy = commit → push to GitHub → `git pull` on the Pi** (`quentin@`,
   `~/painting-club`; api bind-mounts `src/` and runs uvicorn `--reload`, so a
   pull hot-reloads + re-runs idempotent migrations). Test against the Pi, not
   local docker. Public API: `https://paintingclub.art/api`.
7. **EAS OTA** ships iOS: `npx eas-cli update --channel production
   --non-interactive` from `ios-v1` (runtime 1.0.4). ALWAYS publish from the
   SHARED main checkout (includes the parallel session's WIP) — never an
   isolated clean worktree, or you revert their live work. Restart the app twice
   to load an update.
8. **Standing constraints (non-negotiable):** NO `Co-Authored-By: Claude`
   trailer on commits; git commit/push/branch/deploy needs explicit per-action
   approval from Charlie even in auto-approve mode; never add
   instructional/explanatory helper text to user-facing UI unless Charlie asks;
   keep `PENDING_BACKEND_CHANGES.md` updated with backend changes awaiting a Pi
   deploy.
9. **Shared FE hotspots** to serialize on with Stream B: `navigation/index.tsx`,
   `Admin.tsx`, `api/index.ts`, `api/types.ts`. Localize edits; expect to rebase.

---

## Recommended pickup order

1. `py_compile` the backend (verify my announcement routes import clean).
2. Recreate `020_announcements.sql`.
3. Spin up throwaway postgres + uvicorn, smoke-test role + announcement
   endpoints (401 without token, create/list/comment/delete happy paths,
   403 for non-contributor create, moderation delete).
4. Build the announcements FE.
5. Then docs (task 3).
6. Update `PENDING_BACKEND_CHANGES.md`; propose the deploy to Charlie.
