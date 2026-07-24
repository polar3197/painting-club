# Pending backend changes (apply when RPi access is available)

> **NEXT PULL — three things ride together (2026-07-16..18): DEPLOYED ✅ 2026-07-24**
> (Pi pulled to `c2dd08c`, nginx restarted, migrations ran clean, routes smoke-tested).
> Run on the Pi (`quentin@192.168.86.92`, must be on the home LAN):
> ```
> cd ~/painting-club && git pull && docker restart nginx
> ```
> **The `docker restart nginx` is mandatory, not optional.** The api hot-reloads
> from its bind mount, but nginx re-reads its config only on restart. (Item 3 is
> api-only and would hot-reload without the restart, but items 1–2 need it.)
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
> 3. **`GET /members/{member_id}/pic/thumb`** — new member-gated route serving
>    the 256px profile-pic thumbnail (mirrors `/art/{id}/thumb`). The People
>    roster/search grid loads this instead of the full multi-MB pic per tile —
>    the biggest remaining profile-pic bandwidth sink. The raw
>    `/static/profile-thumbs/` path is blocked at nginx (lockdown), so this route
>    is how members reach the already-generated thumbs. api-only, no nginx/db
>    change. Lazy-generates + falls back to the full pic if a thumb is missing.
>
> 5. **Profile-pic upload returns a SIGNED path** (bug: changing your pic
>    silently 403s). The upload endpoint returned `versioned_pic_path()` — an
>    UNSIGNED `/static/profile/…?v=<mtime>` path — but the lockdown makes nginx
>    require a signature there, so the new pic never loaded. Fix: `sign_path()`
>    now preserves any pre-existing query (so the ?v= survives signing — nginx
>    only checks $uri+md5+expires, so extra args don't affect validation), and
>    the upload endpoint signs its response. This also fixes stale re-uploads for
>    *other* viewers (the signed path now carries ?v=, so their cache busts).
>    api-only. The iOS client already works around it (refetches for a signed URL
>    + busts its own avatar key on upload), so this deploy just makes it clean.
>
> 4. **Prompt activation → contributor-only** (approve stays admin). Per Charlie:
>    admins approve/queue suggestions, but only contributors decide what goes
>    live. `admin_activate_prompt` + `admin_activate_suggestion` re-gated
>    `get_admin_member` → `get_contributor_member`; `admin_create_prompt` stays
>    admin but 403s when `activate=True` from a non-contributor. Untouched (stay
>    admin): create/draft, archive, review/approve suggestions, reorder queue.
>    api-only. Until this deploys, prod still lets admins activate — the iOS
>    "make active" reactivate button already gates itself to contributors, so no
>    broken state.
>
> Ordering is free: the iOS client treats `activated_at` as optional (falls back
> to a plain solid ring), and the People roster falls back to the full pic if the
> profile-thumb route 404s — so the OTA and this pull can land in either order
> with no broken intermediate state. Until item 3 deploys, the roster simply
> keeps loading full pics as it does today (no bandwidth win yet, no breakage).

> **Bookmarks → series fields (2026-07-19): DEPLOYED ✅ 2026-07-24. api-only,
> hot-reloaded on `git pull` (no nginx/db/migration).** `GET /members/me/bookmarks`
> now returns `series_id` + `series_name` per saved piece so the iOS "saved" page
> can regroup bookmarked pieces into their collection/album as one tile.
> - `src/db/db_ops/bookmarks.py` `db_list_bookmarks`: added `Art.series_id` +
>   `Series.name` via `outerjoin(Series, Series.id == Art.series_id)` (LEFT join —
>   NULL for standalone pieces).
> - `src/api/models.py` `BookmarkedArtOut`: added optional `series_id` +
>   `series_name`.
> - `src/api/main.py` `list_my_bookmarks`: maps the two new row fields.
> Additive + backward-compatible. The shipped iOS OTA already handles their
> absence (renders every saved piece individually until this lands); after the
> pull, saved collections/albums collapse into grouped tiles. No client breakage
> either order.

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

> **Stream A round 2 (2026-07-14): DEPLOYED ✅** (on the Pi as of the 2026-07-24
> pull at the latest; role-inversion follow-up was already live). Contributor role +
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

## 10. Inspiration web — real backend + dummy-setup teardown

> **Status (2026-07-23): BUILT + VERIFIED, NOT DEPLOYED (uncommitted, Stream
> WEB working tree).** Backend: models + migration 025 + `db_ops/inspirations.py`
> + all routes below + nginx block — 39-check smoke green against a throwaway
> `postgres:16` + local uvicorn (edge CRUD, ownership 403s, CHECK/unique
> constraints, BFS depth, singleton exclusion, artKind mapping, external
> upload/eager-thumb/gated serve, idempotent re-POST, moderator delete);
> app restart re-ran migrations cleanly. One contract addition vs. the spec:
> `POST /inspirations` also accepts an untyped **`to_node_id`** (server
> resolves art vs external) because the client's frozen
> `addInspiration(from, to)` signature doesn't carry the node kind.
> Seed script (`scripts/seed_inspiration_web.py`) exercised end-to-end against
> the throwaway rig (fake charlie + curated titles): 5 externals + 4 edges
> created, second run fully idempotent — it resolves pieces via
> `search-targets`, NOT `/art/search` (which is visual-only + hides
> profile-hidden media). FE Phase-1 teardown also done: `inspiration.ts`
> rewritten to real fetches (signatures frozen; `registerArt`/
> `setInspirationViewer` now no-ops), `inspirationMock.ts` deleted (fuse.js
> stays — used elsewhere), demo-state key wiped at module load, external
> images use the gated route + bearer; `npx tsc --noEmit` clean except the 2
> known Home.tsx Reanimated errors. **Deploy order:** commit/push → Pi pull +
> `docker restart nginx` → run the seed script (laptop, as charlie) → THEN the
> OTA (the mock is gone from the bundle, so the OTA must not precede the pull).

**Context:** the inspiration web UI is fully shipped and working on-device
(`ios-v1/src/screens/WebScreen.tsx` force-directed graph + zoom/pan camera,
`ios-v1/src/components/ConnectCreateDialog.tsx` connect/create popup, entry
points in `ArtGallery.tsx` + `UserProfile.tsx`). But it runs entirely on a
**Phase-0 mock** (`ios-v1/src/api/inspirationMock.ts`): curated seed links are
hard-coded in the bundle, member-made links persist only on the device that
made them (SecureStore `inspiration_demo_state_v1`), and nothing is shared
between phones. Phase 1 = real backend + tear the mock down.

**The contract is already frozen** — `ios-v1/src/api/inspiration.ts` is the
permanent interface (types + signatures must not change; WebScreen and the
dialog are built against it). Its header names the intended endpoints. The
graph model: nodes are club art (any medium — visual/written/audio all live in
the `art` base table) or **external art** (outside-the-club pieces: artist,
optional title, image). Edges are directed: `from` = the inspired club piece,
`to` = its inspiration (club art or external). Only the owner of the `from`
piece may add/remove its edges (`mine` gates the UI).

**Schema (3NF; migration `025_inspiration_web.sql` + guarded idempotent
`CREATE TABLE IF NOT EXISTS` in `run_migrations()` + `create_all`):**
```
external_art
  id          UUID PK
  artist      VARCHAR(255) NOT NULL
  title       VARCHAR(300) NULL
  image_path  VARCHAR(500) NOT NULL     -- /static/external/{id}.{jpg|png}
  created_by  UUID FK member(id)
  created_at  TIMESTAMP DEFAULT now()

inspiration
  id              UUID PK
  from_art_id     UUID FK art(id)          ON DELETE CASCADE NOT NULL
  to_art_id       UUID FK art(id)          ON DELETE CASCADE NULL
  to_external_id  UUID FK external_art(id) ON DELETE CASCADE NULL
  created_by      UUID FK member(id)
  created_at      TIMESTAMP DEFAULT now()
  CHECK ((to_art_id IS NULL) != (to_external_id IS NULL))   -- exactly one target
  UNIQUE (from_art_id, to_art_id)
  UNIQUE (from_art_id, to_external_id)
```
Two nullable FKs + CHECK (not a stored kind string) keeps referential
integrity and gives cascade-on-art-delete for free.

**API** (`src/db/db_ops/inspirations.py` + routes in `main.py`, all
member-gated):
- `GET /art/{art_id}/web?depth=2` — BFS both directions from the focus,
  return `{focusId, nodes, edges}`. **Must include the focus node itself even
  if it has no edges** (this is what lets the client's `registerArt` become a
  no-op). Art nodes carry `id, title, creator (username), medium (name),
  file_path, aspect_ratio, artKind` (map `art.type`:
  `visual_2d→visual, written_form→written, audio→audio`) + `mine` computed
  from the bearer; external nodes carry `id, artist, title, image_path`.
- `GET /inspirations/web` — the whole web: every node touched by ≥1 edge
  (singletons excluded), all clusters, `focusId: ""`.
- `POST /inspirations` `{from_art_id, to_art_id? | to_external_id?}` — 403
  unless the caller owns the `from` piece; idempotent (existing edge → return
  it, not a 409).
- `DELETE /inspirations/{id}` — owner of the `from` piece (contributor
  override optional, mirrors comment moderation).
- `GET /inspirations/search-targets?q=` — the connect pane's combined search:
  club art across **all three mediums** (query the `Art` base table directly —
  this finally covers written/audio without the client fan-out, superseding
  item #3 for this pane) + `external_art` (ILIKE on artist/title). Empty `q`
  → a small recents sample. Return the same node shape as the web routes.
- `POST /external-art` (multipart: `artist`, `title?`, `image`) — mirror
  `upload_event_image` exactly (20MB cap, magic-byte check, HEIC→JPEG, store
  at `/static/external/{id}.{ext}`, drop other-ext sibling).
- `GET /external-art/{id}/image` — member-gated serve route mirroring
  `get_art_thumb` (`main.py:2144`): lazy-generate a 512px thumb at
  `/static/external-thumbs/{id}.jpg`, fall back to the original.
  The node circles are ≤132px, so the thumb is all the UI ever shows.
- **nginx:** block raw `/static/external/` + `/static/external-thumbs/` like
  `/static/thumbs` (the gated route is the only way in). Needs
  `docker restart nginx` on deploy.

**Seed (bake Charlie's authored web into prod):** one-time idempotent script
(`scripts/seed_inspiration_web.py`, run from a laptop against the prod API as
charlie — the images live in the app repo, not on the Pi):
1. `POST /external-art` for the 5 bundled pieces (files:
   `ios-v1/assets/imgs/externals/{hodler-kien-valley,avery-dune-and-sea-ii,porter-plane-tree,manet-the-railway}.jpg`
   + `ios-v1/assets/imgs/klimpt.png` = Gustav Klimt "Litzlberg am Attersee";
   artist/title strings in `inspirationMock.ts` `BUNDLED_EXTERNALS`). Skip any
   (artist, title) that already exists.
2. The 4 curated edges (from `inspirationMock.ts` seed block), resolving club
   pieces by creator+title via `/art/search`:
   charlie "bernal hill"→Hodler, "the beach"→Avery,
   "wippets on the couch"→Porter AND →Manet. `POST /inspirations` is
   idempotent, so re-runs are safe. (Klimt gets no edge — catalog-only.)

**Frontend teardown (Phase 1, OTA after the backend deploys):**
- Rewrite `inspiration.ts` bodies as real fetches (signatures unchanged):
  `getWeb`/`getFullWeb`/`addInspiration`/`removeInspiration`/
  `searchLinkTargets`/`createExternalArt` → the routes above.
  `setInspirationViewer` + `registerArt` become no-ops (backend computes
  `mine` from the bearer; the web route always includes the focus node) —
  keep the exported functions so call sites don't churn.
- External node images become `{ uri: <gated image route>, headers: bearer }`
  — same pattern as `thumbSource` (`client.ts:122`). The
  `image: number | { uri }` type widens to allow headers; that's additive.
- Delete `inspirationMock.ts` + the `fuse.js` usage (check it's not imported
  elsewhere before dropping the dep). Keep the bundled asset images for now
  (they're referenced nowhere else after the mock dies — can drop from the
  bundle in a later cleanup to save OTA weight).
- One-time cleanup on launch: `SecureStore.deleteItemAsync('inspiration_demo_state_v1')`.
  Member-made demo links on other people's devices are lost **by design** —
  only Charlie's authored web was baked, and that's what the seed restores.
- **Ordering is NOT free here** (unlike most items): the OTA deletes the mock,
  so it must ship **after** the Pi pull + nginx restart. Until the OTA, old
  clients keep running the mock harmlessly.

**Work split:** this whole item (backend + seed + FE teardown) is Stream WEB —
see "Work split (2026-07-23)" below.

---

# Work split (2026-07-23) — ALL remaining work, two parallel Claudes

Everything above that is READY just needs the consolidated Pi pull (one
person, one event — see the NEXT PULL block at the top; the new work below
adds a second pull + `docker restart nginx` when it lands). The still-to-BUILD
work is split **by feature** — each stream owns its features end-to-end
(schema → routes → nginx → client → OTA), so nobody waits on the other's
half.

**Stream WEB (Claude 1, this session) — #10 inspiration web, end-to-end:**
- Backend: migration 025, `external_art` + `inspiration` tables,
  `db_ops/inspirations.py`, all routes, nginx block for `/static/external*`,
  throwaway-postgres smoke test.
- Seed script baking Charlie's authored web into prod.
- FE Phase-1 teardown: rewrite `inspiration.ts` bodies as real fetches, no-op
  `registerArt`/`setInspirationViewer`, delete `inspirationMock.ts` + Fuse
  usage, wipe `inspiration_demo_state_v1`, bearer-header external images.
  **OTA only after the Pi deploy** (the mock is deleted, so ordering matters).
- #3 stays skipped — this stream's `search-targets` covers the connect pane
  across all mediums; revisit only if the gallery fan-out feels slow.

**Stream IMG+FIX (Claude 2) — image delivery + the standing fixes,
end-to-end:**
- **Track 3 display derivative**: `generate_display` + eager-gen at upload +
  `GET /art/{art_id}/display` + delete/replace cleanup + nginx block for
  `/static/display`; then the FE wiring — `displayUrl`/`displaySource` in
  `client.ts`, profile `Visual2DPiece` + carousel swap, expo-image `onError` →
  original fallback (fallback makes the FE safe to ship in either order).
  (Track 2 skipped — redundant once Track 3 lands.)
- **#1 stable media-tab order**: `ORDER BY` in `db_get_profile` + drop the
  client-side alphabetical sort in `UserProfile.tsx` after deploy.
- **#2 aspect-ratio backfill**: `lifespan` startup hook + remove the
  now-redundant `RNImage.getSize` effect in `UserProfile.tsx` after deploy.
- **#4 duplicate-email approve**: 409 + orphan `pending_setup` reuse (backend
  only — the iOS alert already surfaces whatever the server returns).
- **Cleanup rider:** retire the superseded Admin.tsx members-tab "save role"
  (role-model inversion note above).

**Collision rules (both streams touch the same hotspot files):**
- Separate branches off `main`; never edit the shared `ios-v1` working tree
  live (a third parallel session may be in it — coordinate before OTAs, the
  EAS channel is shared and OTAs from these trees target runtime 1.0.5).
- `src/api/main.py` + `src/nginx/nginx.conf`: append-only blocks, one per
  stream — merges stay trivial.
- Migration numbers: only WEB needs one (**025**); IMG+FIX ships no DDL. If
  IMG+FIX ends up needing a migration after all, it takes **026+**.
- `ios-v1` file ownership: WEB owns `src/api/inspiration*.ts`; IMG+FIX owns
  `src/api/client.ts`, `UserProfile.tsx`, the carousel, `Admin.tsx`. Neither
  edits the other's files; shared helpers go in your own file, not `client.ts`
  (WEB) / not `inspiration.ts` (IMG+FIX).
- WEB owns this doc's status updates; IMG+FIX appends its own status lines.

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
> Committed on branch `stream-b` (`1ff60b0`), migrations 016–017 used
> (renumbered 017–018 in `40ff670`). **DEPLOYED ✅ 2026-07-24** (merged to main,
> on the Pi; aspect_ratio backfill ran with 0 remaining NULL rows).

**Stream B — prompts, covers & fixes:**
- #9 Weekly-prompt suggestions + admin queue
- #8 Written-piece cover image
- #4 Duplicate-email approval → 409 + orphan handling
- #2 Backfill `aspect_ratio` for old art
- #3 Written-form in `/art/search` (optional / only if the fan-out feels slow)

---

# Image delivery — kill the "linger then snap" on the main art display

> **Stream IMG+FIX status (2026-07-24): Track 3 backend DEPLOYED ✅** (merged to
> main `5e98db8` + `77a1a17`, Pi pulled, nginx restarted; smoke: display route
> 401-gated, raw `/static/display/` 403, `/static/external/` 404 — that last one
> because the deploy also ported Stream WEB's external lockdown into
> `nginx.conf.template`; their blocks were only in the inert legacy
> `nginx.conf`, which the container never reads). **FE OTA published ✅**
> (branch `production`, runtime 1.0.5, update group `98742af9`, commit `0d85cb7`).
> Backend detail: `generate_display`
> + eager gen at both upload callsites, gated `GET /art/{art_id}/display`,
> display unlink on delete/replace/account-delete, nginx `/static/display/`
> block (template only — needs `docker restart nginx` on deploy). 8 new tests in
> `tests/test_display.py`, full suite 30 passed (1 pre-existing unrelated fail).
> FE wired in the shared tree (branch `stream-b-events-obs`): `displayUrl`/
> `displaySource` in `client.ts`, profile `Visual2DPiece` + carousel
> `ZoomablePage` prefer the display with `onError` → original fallback (safe to
> OTA before or after the backend deploys); dropped the now-redundant
> `RNImage.getSize` thumb-measuring effect (aspect backfill is live). Also
> retired Admin.tsx's dead role-management leftovers (`MemberRoleRow` etc. —
> the members tab itself was already gone). `npx tsc --noEmit` clean (known
> Home.tsx Reanimated noise only). **Track 2 skipped** (redundant per spec).
> Handoff items #1 (media-tab ORDER BY), #2 (backfill), #4 (dup-email 409) were
> already implemented + deployed before this stream started — verified, no work
> needed. Awaiting Charlie's go-ahead to commit/merge/deploy + OTA.

**Problem:** the profile art elements + zoom carousel fetch the **full multi-MB
original** straight from the RPi. A soft 512px thumb placeholder lingers for the
whole (slow) download, then the sharp original crossfades in — a big resolution
jump that reads as a snap. Reported by Charlie as his biggest app pet peeve.

**Track 1 (frontend, ALREADY SHIPPED via OTA — no backend work):** carousel now
shows the cached thumb as a placeholder (`ArtCarousel` ZoomablePage) instead of
blank→pop, and the profile + carousel crossfades were slowed 200→450ms so the
change reads as a sharpen. This *softens* the snap but can't remove the linger —
that needs a smaller file, i.e. Tracks 2 & 3 below.

## Track 3 — mid-res "display" derivative (THE real fix; do this one)

A phone can't show more than ~1500px wide, so stop delivering the original for
normal viewing. Generate a ~1600px JPEG (~150–300KB) alongside the 512px thumb;
point the profile + carousel at it. It lands ~50–100× faster than a 20MB
original, so the linger nearly vanishes AND the 512→1600 jump is small. The
original is only fetched on pinch-zoom.

**Backend (`src/api/main.py`) — mirror the thumb machinery exactly:**
```python
DISPLAY_SIZE = 1600  # near THUMB_SIZE (main.py:741)

def display_file(art_id: str) -> Path:
    return STATIC_ROOT / "static" / "display" / f"{art_id}.jpg"

def generate_display(art_id: str, src_abs: Path) -> Path | None:
    """~1600px JPEG for the main viewer — mirrors generate_thumbnail."""
    out = display_file(art_id)
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src_abs) as img:
            img.draft("RGB", (DISPLAY_SIZE, DISPLAY_SIZE))
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((DISPLAY_SIZE, DISPLAY_SIZE * 4), Image.LANCZOS)
            img.save(out, format="JPEG", quality=88, optimize=True)
        return out
    except Exception as e:
        print(f"[display] gen failed for {art_id}: {type(e).__name__}: {e}")
        out.unlink(missing_ok=True)
        return None
```
- **Eager gen at upload:** next to every `generate_thumbnail(...)` callsite
  (`main.py:1000`, and the written-cover `:1134`), add `generate_display(...)`.
- **Serve route** — clone `get_art_thumb` (`main.py:2133`) as
  `GET /art/{art_id}/display`: same member gate, PDF→original, lazy-generate +
  fall back to the original on failure, `Cache-Control: private, max-age=3600`.
- **Cleanup:** where a thumb is unlinked on delete/replace (`main.py:536`,
  `:1132`, `:1143`), also `display_file(aid).unlink(missing_ok=True)`.
- **nginx:** block the raw `/static/display` path like `/static/thumbs` is
  blocked (the gated route is the only way in). Verify in `src/nginx/nginx.conf`.
- **Backfill:** none — the route lazy-generates on first request from the
  original already on disk (same as thumbs).

**Frontend wiring (ships AFTER the route is live, or now WITH the fallback):**
- `src/api/client.ts`: add `displayUrl(artId)` + `displaySource(artId, version)`
  mirroring `thumbUrl`/`thumbSource` (bearer header + version cacheKey).
- Profile `Visual2DPiece` (`UserProfile.tsx`): `source={displaySource(...)}`
  instead of `imageSource(piece.file_path)`; keep the thumb placeholder.
- Carousel: use `displaySource` as the page image; optionally swap to the
  original when that page is pinch-zoomed (maximumZoomScale 4) so deep zoom stays
  crisp. v1 can just use the display everywhere.
- **Graceful fallback:** expo-image `onError` → swap `source` to the original
  (`imageSource`). Makes the FE safe to ship before the backend deploys and on
  any pre-route backend (same spirit as `thumbSource`'s 404 handling).

**Cost:** ~200KB extra per piece on disk (negligible); bandwidth *drops* 50–100×
for normal viewing.

## Track 2 — bigger thumbnail (cheap standalone win, optional if doing Track 3)

One-liner: `THUMB_SIZE = 512` → `768` (`main.py:741`). The placeholder itself is
sharper, so the lingering state isn't ugly and the eventual snap is subtle — even
without Track 3.
- **Regenerate existing thumbs:** on-disk thumbs are already 512 and won't
  auto-regen. After deploy, `rm -rf <STATIC_ROOT>/static/thumbs/*` — the thumb
  route regenerates each at 768 on next request. (Or a startup pass that regens
  thumbs whose height/width != THUMB_SIZE.)
- **Frontend:** none — same URL, just larger bytes.
- **Tradeoff:** the same thumb feeds the grid tiles, so 768 makes the grid a
  touch heavier. Recommend 768 (not 1024) to keep the grid light. **If you do
  Track 3, Track 2 is largely redundant** — the display lands fast enough that
  the 512 placeholder's brief blur is fine. Do Track 3 first; Track 2 is the
  fallback if Track 3 slips.

**Deploy order:** Track 3 backend → deploy → OTA the FE wiring (or ship the FE
first with the `onError` fallback so order doesn't matter).
