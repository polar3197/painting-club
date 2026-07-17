# Pending backend changes (apply when RPi access is available)

> **NEXT PULL — two things ride together (2026-07-16): READY, NOT DEPLOYED.**
> Run on the Pi (`quentin@192.168.86.92`, must be on the home LAN):
> ```
> cd ~/painting-club && git pull && docker restart nginx
> ```
> **The `docker restart nginx` is mandatory, not optional.** The api hot-reloads
> from its bind mount, but nginx re-reads its config only on restart.
>
> 1. **Image-caching fix (`fdaf75a`)** — art re-downloaded on every page change
>    because each signed URL was unique per request (cache key never repeated)
>    and nginx sent `no-store`. Bucketed the signed expiry so a piece keeps one
>    stable URL per window, and serves `private, max-age=21600` (phone caches,
>    CDN still can't). **The nginx half is exactly what needs the restart.**
> 2. **`weekly_prompt.activated_at`** — new column feeding the client's 7-day
>    prompt lifespan ring. NOT the same as `collection.created_at`, which is when
>    an admin *drafted* the prompt; a prompt queued in advance would read as
>    already part-expired the moment it went live. Stamped in all three
>    activation paths (`db_create_prompt(activate=True)`, `db_activate_prompt`,
>    `db_activate_suggestion`). Migration is an idempotent `ADD COLUMN IF NOT
>    EXISTS` + a backfill from `created_at` scoped to prompts that have actually
>    been live (drafts stay NULL); verified against a throwaway postgres —
>    second run is `UPDATE 0`, so restarts don't drift.
>
> Ordering is free: the iOS client treats `activated_at` as optional and falls
> back to a plain solid ring, so the OTA and this pull can land in either order
> without a broken intermediate state.

> **Stream A status (2026-07-13): DEPLOYED ✅** #6 Bookmarks, #7 Events, #1 tab
> order, plus user-orderable media tabs (`media_members.position`, migration
> 015, `PATCH /members/media-order`) are live on the Pi (`089f926`) and
> verified in prod: all four tables exist, `/events` + bookmarks routes serve
> (401 unauthenticated), `media_members.position` and
> `media_request.requested_type` present — **which closes #5**. 13-check smoke
> passed against a throwaway postgres pre-deploy. Note for Stream B:
> `db_manager.py` gained one guard (media_members.position); new tables ride
> `create_all` (no guards), .sql files 013–015 are documentation. FE work now
> unblocked: bookmark button + collection view, events UI, hold-and-drag media
> tabs (iOS must also drop its client-side alphabetical sort in
> `UserProfile.tsx` so the server order shows), written-cover + prompt-queue
> FE after Stream B lands.

> **Stream A round 2 (2026-07-14): READY, NOT DEPLOYED.** Contributor role +
> announcements + editable docs. Role tier is now member<contributor<admin
> (admin implies contributor); new `get_contributor_member` dep. **New tables:**
> `announcement` + `announcement_comment` (guarded in `db_manager`, paper trail
> `020`) and `doc` (guarded **and seeded** from the old iOS `aboutContent`, paper
> trail `021`); `019` is role-only (no DDL — role col was already free
> VARCHAR(20)). The doc seed is `ON CONFLICT (slug) DO NOTHING`, so it lands
> starter content once and never clobbers a contributor's later edit. **New
> routes:** `GET /admin/members`, `PATCH /admin/members/{u}/role`;
> `POST/GET /announcements`, `GET/DELETE /announcements/{id}`,
> `POST /announcements/{id}/comments`,
> `DELETE /announcements/{id}/comments/{cid}` (author-or-contributor authoring +
> comment moderation); `GET /docs`, `GET /docs/{slug}`, `PUT /docs/{slug}`
> (contributor edit). **New db_ops:** `announcements.py`, `docs.py` — note the
> announcement comment ops are imported into `main.py` under aliases
> (`db_add_comment as db_add_announcement_comment`, etc.) to avoid shadowing the
> art-comment ops in `comments.py`; keep the aliases. **Verified:** 24-check
> smoke passed against a throwaway `postgres:16` + local uvicorn (auth 401s,
> contributor 403s, role promote, announcement CRUD + comment moderation, docs
> read/edit, seed present). iOS FE also landed (announcements inline Home card +
> discussion screen + contributor compose; About sections are now doc-backed with
> a contributor edit affordance) and `npx tsc --noEmit` is clean **except** 2
> pre-existing `Reanimated.SharedValue` errors in Home's bounce-ball WIP — not
> Stream A. Deploy = commit + push + `git pull` on the Pi (startup re-runs the
> idempotent migrations + create_all).

Backend changes that were **diagnosed and designed while the Pi was
unreachable** but not yet deployed. The iOS/web clients are already shipped and
work without these — each item notes what's mitigated vs. what only the backend
can fully fix.

> **Stream B observability (2026-07-14): DEPLOYED ✅** (origin/main `7ce38bc`,
> Pi pulled + hot-reloaded, migrations applied, startup clean). `usage_event`
> (#5) + `device_event` (#6) tables created via `create_all`; routes `POST /usage`
> + `GET /usage/summary`, `POST /telemetry` + `GET /telemetry/summary` live
> (401 unauth verified). db_ops `usage.py`/`telemetry.py`. Pre-deploy 14/14 on a
> throwaway postgres. OTA to runtime 1.0.4 published (branch `production`, update
> group `f59bd892`). **1.0.3 users NOT covered** (published 1.0.4 only per
> Charlie).
>
> **⚠️ ROLE MODEL INVERTED (2026-07-14) — Stream A please note.** Charlie
> corrected the hierarchy to **member < admin < contributor** (contributor is the
> TOP tier = admin's powers + docs/roles/announcements). This REVERSES the old
> "admin implies contributor" that `PC_IDEAS_SPLIT.md` + Stream A's original code
> assumed. Deployed changes: `get_admin_member` now allows `(admin, contributor)`;
> `get_contributor_member` is `contributor`-only (admins no longer qualify);
> `_is_contributor` is `contributor`-only; `PATCH /admin/members/{u}/role` re-gated
> to contributor-only. **Consequence for Stream A:** the Admin.tsx members-tab
> "save role" now 403s for pure admins — it's superseded by the new contributor
> **"user roles"** page (Settings → user roles) and can be retired. Announcement/
> docs authoring + comment moderation are now contributor-only too (were
> admin-or-contributor). `charlie` was promoted admin→contributor to dogfood.

**Deploy = commit + push + `git pull` on the Pi** (`quentin@<pi>`; the api
container bind-mounts `src/` and auto-reloads on pull). No new native modules;
these are pure Python query/serializer changes. Re-runnable and additive.

---

## 1. Stable media-tab order (root-cause fix for tab jitter)

**Symptom:** the per-medium tabs on a profile visibly reshuffle while the
profile loads. Cause: the profile is fetched twice on open (mount + focus
refetch) and this query has **no `ORDER BY`**, so Postgres can return the same
media in a different order between the two fetches → the fixed grid reshuffles.

**Client status:** already mitigated on iOS (the client sorts media
alphabetically before rendering, in `ios-v1/src/screens/UserProfile.tsx`). The
server fix is still worth doing — it fixes the **web** app too and removes the
latent instability at the source. Use the **same alphabetical order** as the
client so there's no one-time reshuffle.

**Change** — `src/db/db_ops/profile.py`, in `db_get_profile`, add one line to
the media query:

```python
    media_result = await db.execute(
        select(Media.name, Media_Members.hidden)
        .join(Media_Members, Media.id == Media_Members.media_id)
        .filter(Media_Members.member_id == member.id)
        .order_by(Media.name)          # <-- add: stable order across fetches
    )
```

No migration. Safe/idempotent.

---

## 2. Backfill `aspect_ratio` for old art (real fix for "images load square first")

**Symptom:** art images briefly appear as a square, then snap to their true
aspect ratio. Cause: the `visual_2d.aspect_ratio` column was added **without a
backfill**, so every piece uploaded before that migration has
`aspect_ratio = NULL`. New uploads compute it and render correctly; old pieces
have no stored ratio, so the client can't reserve the correct shape before the
image downloads → square flash.

**Client status:** NOT mitigated (there's no clean client-only fix — you can't
reserve space for a shape you don't yet know). This backfill is the real fix.
Once ratios are populated, the existing client code renders the correct shape
on first paint, and the same flash is fixed for free in the profile series
view, comments, and the web portfolio.

**Change** — `src/api/main.py`. Add a one-time, idempotent backfill and call it
from the `lifespan` startup hook (helpers `abs_path` and `_compute_aspect_ratio`
already exist in this file; `select` and `Visual2D` are already imported):

```python
async def backfill_visual_2d_aspect_ratios(db: AsyncSession) -> None:
    """One-time: compute aspect_ratio for visual_2d rows added before the
    column existed (aspect_ratio IS NULL). Idempotent — only touches NULLs, so
    it's safe to leave in place and re-run on every boot."""
    rows = (await db.execute(
        select(Visual2D).filter(Visual2D.aspect_ratio.is_(None))
    )).scalars().all()
    changed = 0
    for v in rows:
        if not v.file_path or v.file_path.lower().endswith(".pdf"):
            continue
        ratio = _compute_aspect_ratio(abs_path(v.file_path))
        if ratio:
            v.aspect_ratio = ratio
            changed += 1
    if changed:
        await db.commit()
    print(f"[backfill] aspect_ratio set on {changed} rows")
```

Invoke it in the `lifespan` startup (around line 209-213), after
`run_migrations()`, using a session (mirror how other startup DB work opens
one — e.g. `async with async_session() as db: await backfill_visual_2d_aspect_ratios(db)`;
match the actual session-maker name used elsewhere in `main.py`).

No schema migration (column already exists). PDFs legitimately stay NULL (they
have no thumbnail either — by design).

**After deploying:** optionally remove the now-redundant `RNImage.getSize`
thumbnail-measuring effect in `ios-v1/src/screens/UserProfile.tsx` `Visual2DPiece`
(the `onLoad` handler already self-corrects any stale ratio). Optional cleanup,
not required.

---

## 3. (Optional / efficiency) Written-form pieces in `/art/search`

**Context:** the main art gallery now shows written-form pieces next to
paintings. This is **already working**, assembled **client-side** in
`ios-v1/src/screens/ArtGallery.tsx` by fanning out over members and calling the
per-member written endpoint. So this backend change is **not required** — it's
purely an efficiency improvement (one query instead of N per-member requests).

If you want it: extend `db_search_art` in `src/db/db_ops/search.py` to also
query the `WrittenForm` subtype (parallel to the existing `Visual2D` query),
merge newest-first, and tag each row with an `art_type` field
("visual_2d"/"written_form") added to `ArtResult` in `src/api/models.py`
(additive, backward-compatible). This was written and tested locally against a
throwaway postgres earlier, then reverted in favor of the client-side approach.
If deployed, the client fan-out dedupes by id so the two coexist safely; the
fan-out could later be removed for efficiency.

Lowest priority — only do this if the client fan-out ever feels slow.

---

## 4. Approving a re-submitted join request fails on a duplicate email

**Symptom:** in the admin panel, tapping **approve** on a join request whose
email already belongs to a member does nothing visible (the button looked
unresponsive). This happens when someone applies, gets approved once, can't
finish logging in, and **re-submits with the same email**.

**Cause:** `member.email` is `UNIQUE` (`src/db/models.py`). The first approval
created a `Member` with that email (application left in `pending_setup`).
Approving the second application calls `db_approve_application`
(`src/db/db_ops/applications.py`), which inserts *another* member with the same
email → Postgres `UNIQUE` violation (IntegrityError) on commit. The route
`update_application_status` (`src/api/main.py`, ~line 1794) only catches
`ValueError`, so the IntegrityError escapes as a **500**.

**Client status:** partially mitigated — the iOS admin now **surfaces** the
failure as an alert instead of silently swallowing it (`handleUpdate` in
`ios-v1/src/screens/Admin.tsx`, uncommitted in the working tree at time of
writing). But the surfaced message is a generic 500 until the backend returns a
clear error. Admin workaround that fully unblocks today: delete the older
`pending_setup` application row — `db_delete_application` also deletes the orphan
member, freeing the email — then approve the new request.

**Change** — make it graceful, two parts:

1. **Clear 409 instead of 500.** In `db_approve_application`, before creating the
   member, look up an existing member by `app.email`; if one exists, raise a
   `ValueError` with a clear message (e.g. `"a member with this email already
   exists — delete the earlier request first"`). Then in
   `update_application_status`, map the duplicate-email `ValueError` to **409**
   (the route already turns `ValueError` into 404 today — split it so
   "not found" → 404 and "already exists" → 409, mirroring how
   `resolve_media_request` distinguishes them).

2. **(Better) Auto-handle the orphan.** If the existing member is an
   un-completed `pending_setup` account (never logged in — still
   `must_change_password`, temp password unused), reuse it: re-issue a fresh
   temp password + expiry and move the new application to `pending_setup`
   pointing at it (or delete the orphan + its old application and create fresh).
   Then a re-application "just works" without the admin having to delete
   anything.

No schema migration.

---

## 5. (Already committed — just needs `git pull`) Media-request `requested_type`

Not a change to write — a heads-up for whoever deploys. Commit `6cd141b` adds a
nullable `media_request.requested_type` column (SQLAlchemy model + an idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `run_migrations()` +
`012_media_request_type.sql`) plus the API plumbing so the requester picks the
medium type and the admin just confirms. It **activates automatically on the
next `git pull`** (the migration runs at startup). Until then, the shipped iOS
app sends the chosen type but the old backend ignores it, so requests arrive
type-less and the admin falls back to the legacy type picker — no error, just
the requester's choice dropped. After the pull, the full flow works and any
type-less legacy requests still approve via the fallback picker.

---

# New infrastructure (backend-first; FE designs come later)

These four are net-new features. Build + deploy the **backend** (schema + API)
now; the client UI is deliberately unspecified and will be designed after. Each
new table is `create_all`-covered for fresh DBs plus an idempotent
`CREATE TABLE IF NOT EXISTS` in `run_migrations()` for prod. Prefer a **new
`db_ops/<feature>.py`** per feature to keep `main.py`/`models.py` edits small.

## 6. Bookmarks — a personal collection of others' works

**Goal:** a user can bookmark any piece; their bookmarks form a saved
collection. FE (a bookmark control on every piece + a collection view) TBD.

**Schema (clean 3NF — pure M:N between member and art):**
```
bookmark
  member_id  UUID  FK member(id) ON DELETE CASCADE
  art_id     UUID  FK art(id)    ON DELETE CASCADE
  created_at TIMESTAMP DEFAULT now()
  PRIMARY KEY (member_id, art_id)     -- one bookmark per user per piece
```
Composite PK is the whole key — no partial or transitive dependencies, textbook
3NF. `art` is the polymorphic base, so this bookmarks any medium (visual /
written / audio) uniformly.

**API** (`src/db/db_ops/bookmarks.py` + routes in `main.py`):
- `POST /art/{art_id}/bookmark` (auth) — idempotent insert.
- `DELETE /art/{art_id}/bookmark` (auth).
- `GET /members/me/bookmarks` (auth) — join `art`, return the **existing
  art-result shape** so the client renders it like any gallery.
- *(phase 2, optional)* a `bookmarked: bool` flag on piece payloads for the
  viewer — more invasive (thread the viewer id into the art serializers); defer
  until the FE needs it.

## 7. Events

**Goal:** events with a description, host(s), date + time, an optional image,
and visibility control — **public** (all members can see) or private
(invite-only). FE TBD.

**Schema (3NF):**
```
event
  id          UUID PK
  title       VARCHAR(300)
  description TEXT
  event_date  DATE            -- separate date + time per spec
  event_time  TIME NULL
  image_path  VARCHAR NULL
  is_public   BOOLEAN NOT NULL DEFAULT false
  creator_id  UUID FK member(id)
  created_at  TIMESTAMP DEFAULT now()

event_host                    -- "host(s)" is many-to-many
  event_id  UUID FK event(id) ON DELETE CASCADE
  member_id UUID FK member(id)
  PRIMARY KEY (event_id, member_id)

event_invite                  -- grants a private event's visibility
  event_id  UUID FK event(id) ON DELETE CASCADE
  member_id UUID FK member(id)
  PRIMARY KEY (event_id, member_id)
```
**Visibility rule:** an event is viewable iff `is_public` OR viewer is the
creator OR viewer ∈ `event_host` OR viewer ∈ `event_invite`.

**API** (`src/db/db_ops/events.py` + routes):
- `POST /events` (auth; creator auto-added as a host), `PATCH /events/{id}`,
  `DELETE /events/{id}` (creator/host only).
- `POST /events/{id}/hosts` / `DELETE …`, `POST /events/{id}/invites` /
  `DELETE …` (add/remove members).
- `POST /events/{id}/image` — reuse the existing static-upload pipeline (mirror
  the art image upload).
- `GET /events` (auth) — events visible to the viewer (public + hosted +
  invited). `GET /events/{id}` — detail, enforcing the visibility rule.

## 8. Cover image for written pieces

**Goal:** attach an image to a written piece, used as the **cover in the
art-element display** (so a text piece can render a picture card).

**Schema:** one nullable column on the existing subtype —
`ALTER TABLE written_form ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR(500)`.
Additive, backward-compatible.

**API:** extend the written-form create/update endpoints to accept an optional
cover image (multipart, reuse the image pipeline), store the path; add
`cover_image_path` to `WrittenFormOut` (`src/api/models.py`) and the
written-form select in `db_ops`. FE then uses it as the card image.

## 9. Weekly-prompt suggestions + admin queue

**Goal:** wire the existing "suggest a weekly prompt" button — a user picks a
**medium (or "medium agnostic")**, writes the prompt, and submits. Submissions
land in a **new admin "weekly prompts" tab** with two panels: **proposed**
(pending) and **up next** (approved, **hold-and-drag orderable** exactly like
album songs).

**Schema (3NF):**
```
weekly_prompt_suggestion
  id          UUID PK
  member_id   UUID FK member(id)
  media_id    UUID FK media(id) NULL   -- NULL = "medium agnostic"
  prompt_text TEXT NOT NULL
  status      VARCHAR(20) DEFAULT 'proposed'  -- proposed | approved | rejected
  order_index INT NULL                 -- position in the up-next queue (approved only)
  created_at  TIMESTAMP DEFAULT now()
```
Nullable FK to `media` (not a stored medium string) keeps it normalized;
`order_index` mirrors the album/series ordering that already exists.

**API** (`src/db/db_ops/weekly_prompts.py` or extend existing prompt ops):
- `POST /weekly-prompts/suggestions` (auth) — `{ media_id?, prompt_text }`.
- `GET /admin/weekly-prompts` (admin) — `{ proposed: [...], up_next: [...] }`
  (up_next ordered by `order_index`).
- `PATCH /admin/weekly-prompts/{id}` (admin) — approve (→ append to up-next,
  `order_index = max+1`) / reject.
- `PATCH /admin/weekly-prompts/reorder` (admin) — ordered id array → set
  `order_index`. **Reuse the existing album/song reorder implementation** as the
  template (same drag-to-reorder pattern the FE will mirror).
- *(phase 2)* `POST /admin/weekly-prompts/{id}/activate` — promote a queued
  suggestion into the live `weekly_prompt` row (ties the queue into the active
  prompt rotation).

---

# Work split — two parallel Claudes

Split so each stream owns coherent domains and mostly-separate files. **Both**
streams still touch `src/db/models.py`, `src/api/main.py`, and
`run_migrations()` in `src/db/db_manager.py` — the collision hotspots. To avoid
clobbering each other:
- **Work on separate git branches** (or worktrees) and merge to `main`; don't
  both edit the shared working tree live.
- **Migration file numbers:** next is `013`. **Stream A → 013–015, Stream B →
  016–018.** In `run_migrations()` each stream appends its own block; keep them
  in your assigned number order to make merges trivial.
- Put new logic in **new `db_ops/*.py` files** (zero collision there).
- Deploy: commit → push → `git pull` on the Pi (`quentin@192.168.86.92`);
  startup re-runs `create_all` + idempotent `run_migrations()`.

**Stream A — new social entities (+ quick wins):**
- #7 Events (largest)
- #6 Bookmarks
- #1 Stable media-tab order (one-line `ORDER BY`)
- #5 Media-request `requested_type` (already committed — just `git pull` + verify)

> **Stream B status (2026-07-13):** #9, #8, #4, #2 all implemented + locally
> verified (41 scenario checks green); #3 skipped per the doc (optional).
> Committed on branch `stream-b` (`1ff60b0`), migrations 016–017 used.
> **Awaiting push approval + Pi pull** — see STREAM_B_qs.md at the repo root.

**Stream B — prompts, covers & fixes:**
- #9 Weekly-prompt suggestions + admin queue
- #8 Written-piece cover image
- #4 Duplicate-email approval → 409 + orphan handling
- #2 Backfill `aspect_ratio` for old art
- #3 Written-form in `/art/search` (optional / only if the fan-out feels slow)
