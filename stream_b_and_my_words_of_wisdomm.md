# Stream B — handoff + words of wisdom

Written 2026-07-14 for the next Claude picking up **Stream B**. Read this top to
bottom before touching anything. The repo is edited by **two Claude sessions at
once** — most of the wisdom below is about not clobbering the other one.

---

## 0. TL;DR of the current moment

- **Goal in force:** "complete as much of Stream B as possible." A session Stop
  hook enforces it — don't stop until Stream B is meaningfully advanced.
- **Stream B = you (this session).** Stream A (contributor role, announcements,
  docs) = the *other* Claude, working in its own worktree. Don't build Stream A.
- **I just made one uncommitted change** (Home bouncing balls, below). It
  references a not-yet-existing `Events` route, so **the app won't compile/run
  clean until you build the Events screen + register the route.** That's the
  first Stream B task and it's already half-motivated by the Home change.
- **Nothing is committed / pushed / deployed by me this session.** Per Charlie's
  standing rule, get an explicit per-action go-ahead before any git commit /
  push / migration / EAS update. See §6.

---

## 1. What I changed (uncommitted, in the MAIN working tree)

**File: `ios-v1/src/screens/Home.tsx`** — Charlie asked to "hide the fidget
spinner for now and add a second bouncing ball labeled 'event' to bounce around
with the weekly-prompt ball."

Done:
- Added `const SHOW_FIDGET = false;` flag near the top (with `SHOW_INTRO` /
  `SHOW_WEEKLY_PROMPT`). Flip to `true` to restore the spinning diamond + its
  `∗`/`○` toggle. The `SpinningPromptDiamond` component is untouched and intact.
- Refactored the old single `BouncingPromptBall` into a reusable **`Ball`**
  component (owns its own pos/vel, takes `label`, `sublabel`, `accent`,
  `onOpen?`, shared `W`/`H`, `initFracX/Y`, `initVX/Y`) hosted inside a new
  **`BounceArena`** that measures the play area once and renders TWO balls:
  - week's-prompt ball (red `#E30022`, opens `WeeklyPromptDetail`).
  - **event ball** (blue `#1E73BE`, `onOpen={() => navigation.navigate('Events')}`).
- Balls now get an **initial velocity** so they're bouncing on load (the old one
  started at rest). Slingshot + wall-bounce physics is otherwise unchanged.
- Gated the mode toggle and the fidget render behind `SHOW_FIDGET` via derived
  `showBounce` / `showFidget` booleans. `mode` state machinery is left in place.

**The one loose end:** `navigation.navigate('Events')` — there is no `Events`
route yet. `HomeStackParamList` (`ios-v1/src/navigation/types.ts`) and
`HomeStack.tsx` need an `Events: undefined` entry pointing at the Events screen
you build. Until then it's a TS error + runtime "no route" crash if you tap the
event ball. **Build Events first and this closes itself.**

Balls don't collide with each other (they pass through) — intentional, keeps it
simple. If Charlie wants ball-to-ball collision later, that's a physics add in
`BounceArena` (needs both balls' pos/vel in one frame callback).

---

## 2. Stream B scope (what you owe)

From `PC_IDEAS_SPLIT.md` (repo root — the authoritative brief). Four items:

| # | Feature | Nature | Migration |
|---|---------|--------|-----------|
| 4 | **Events surface** — list / detail / create-edit / invites | **FE only** — backend already live | — |
| 5 | **Usage logging: behavioral trail** — logins + in-app navigation (screen focus) | new table + ingest endpoint + client nav listener | **022** |
| 6 | **Usage logging: device/perf telemetry** — crashes, memory pressure, perf | *separate* table + ingest | **023** |
| 7 | **Contributor usage panel** — reads #5 + #6 | FE + read endpoints, contributor-gated | **024** |

**Charlie's decisions (baked in):**
- Contributor role = **content + moderation** (owned by Stream A; you just
  *consume* it via the `get_contributor_member` auth dep — already in
  `src/api/main.py:302`).
- "Memory usage logging" = **two separate features** (#5 behavioral trail AND #6
  device/perf telemetry). Separate tables, separate ingest.
- **#7 panel = two items inside a contributor's Settings screen:**
  **"infra stats"** and **"user stats".** Charlie said use your **best judgement
  on the design** — "consistency with current aesthetic is good but not 100%
  crucial, we can refine later." So: ship something functional and roughly
  on-brand; don't agonize over pixels.

Suggested order (highest value + already unblocked first): **#4 → #5 → #7 → #6.**
(#4 is pure FE over a live backend = fastest win. #7's "user stats" leans on #5,
so do #5 before #7. #6 telemetry has the fuzziest spec — do it last.)

---

## 3. Technical map — everything you need to build it

### Events backend (ALREADY LIVE — do not rebuild)
10 routes in `src/api/main.py:2786–2959`, all gated on `get_current_member`:
- `POST /events` (EventIn) → EventOut, 201
- `GET /events` → visible events (public + ones you host/are invited to)
- `GET /events/{id}` (404 for private you can't see — deliberately doesn't leak)
- `PATCH /events/{id}` (EventUpdate, host-only)
- `DELETE /events/{id}` (host-only)
- `POST/DELETE /events/{id}/hosts[/{username}]` (EventMembersIn, host-only)
- `POST/DELETE /events/{id}/invites[/{username}]` (host-only)
- `POST /events/{id}/image` (multipart `file`, host-only, 20 MB cap, HEIC→JPEG)

**EventOut shape** (`src/api/models.py:568`, serializer `_event_out` at
`main.py:2750`):
```
id, title, description, event_date (date), event_time (time|null),
image_path (str|null), color (str|null), is_public (bool),
creator_username, hosts (str[]), invited (str[]|null — only for hosts),
can_edit (bool), created_at
```
**EventIn:** `title, description?, event_date (required), event_time?,
is_public=false, color?, hosts: str[]=[]`. **EventUpdate:** all optional.
`db_ops` live in `src/db/db_ops/events.py`. The creator is auto-added as a host.

### iOS API client conventions
- `ios-v1/src/api/index.ts` re-exports `./types` and defines all endpoint
  functions using `request(...)` from `./client`. Add `event_*` and `usage_*`
  functions here. Add their TS interfaces to `ios-v1/src/api/types.ts`
  (`EventOut`, `EventIn`, etc. — mirror the pydantic shapes; there's already a
  `ParticipantOut` with `{username, firstname, lastname, role}`).
- Image upload: mirror an existing multipart upload (e.g. profile pic / art
  upload) — `request` supports FormData; grep `FormData` in `api/index.ts`.
- Auth/token: functions take a `token` arg; `request` attaches the bearer.

### Navigation
- **Stacks**: `ios-v1/src/navigation/` — `HomeStack.tsx` (+ `types.ts`
  `HomeStackParamList`) is where the Events flow belongs (Home links to it).
  Register `Events`, `EventDetail: { eventId }`, `EventEdit: { eventId? }` there.
- **Settings screen is on the RootStack**, not a tab:
  `ios-v1/src/navigation/index.tsx:193` (`<RootStack.Screen name="Settings">`),
  imported line 24. `Settings.tsx` is currently minimal (delete acc / admin /
  logout). Add the two contributor items here.

### Contributor gating on the client
- `useAuth()` exposes **`currentRole`** (`ios-v1/src/context/AuthContext.tsx`) —
  a string persisted in SecureStore under key `role`. Gate the two Settings
  items with `currentRole === 'contributor' || currentRole === 'admin'`
  (admin implies contributor). `Profile.role` also carries it from the backend.

### Contributor gating on the backend
- Use `Depends(get_contributor_member)` (`main.py:302`) for the usage-panel read
  endpoints and any contributor-only writes. Ingest endpoints (#5/#6) should be
  plain `get_current_member` (every logged-in client emits telemetry).

### Backend patterns you must follow (from last round, they work)
- **New feature → new `src/db/db_ops/<feature>.py`.** Never share a db_ops file
  with Stream A. Suggested: `usage.py` (behavioral) and `telemetry.py` (device).
- **New tables**: define the SQLAlchemy model in `src/db/models.py`. `create_all`
  at startup makes new tables automatically — you do NOT need a migration for a
  brand-new table, only for altering an existing one.
- **New columns on existing tables**: add an idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to `run_migrations()` in
  `src/db/db_manager.py`. The numbered `.sql` files in `src/db/migrations/` are
  **paper-trail only** — the real runtime migration is that Python function.
  Your paper-trail numbers are **022, 023, 024** (main is at 018–019).
- Pydantic request/response models go in `src/api/models.py`. Routes in
  `src/api/main.py` (append near the end / near the events block).

---

## 4. Design notes for the two Settings items (#7)

Charlie: functional first, refine later. Rough plan that fits the app's brutalist
cream/black aesthetic (`Colors`, `Fonts` from `constants/theme`):

- Two `Pressable` rows in `Settings.tsx` (contributor-gated), each pushing to a
  simple stats screen — OR expand-in-place panels. Push screens are cleaner.
- **"infra stats"** ← reads #6 (device/perf telemetry): recent crashes, memory-
  pressure events, maybe app-version spread. Aggregate server-side.
- **"user stats"** ← reads #5 (behavioral trail): logins per day, active users,
  which screens get traffic. A per-day / per-account rollup endpoint gated on
  `get_contributor_member`.
- Keep it read-only tables/lists; no charts needed for v1.

Behavioral trail (#5) client emitter: a **navigation state listener** (React
Navigation `navigationRef.addListener('state', ...)` or a screen-focus effect)
that POSTs `{screen, at}` — debounce/batch so you don't spam the API on every
frame. Login events: emit on successful login in `AuthContext.login`.

---

## 5. Coordination — the other Claude is editing the same repo RIGHT NOW

Stream A (other session) is actively editing **shared hotspot files**. Touch
these carefully and expect to serialize/merge:
`src/db/models.py`, `src/api/main.py`, `src/api/models.py`,
`ios-v1/src/navigation/index.tsx`, `ios-v1/src/screens/Admin.tsx`,
`ios-v1/src/api/index.ts`, `ios-v1/src/api/types.ts`.

Rules:
- **Localize your edits** — append new routes/models/functions rather than
  rewriting existing blocks. Smaller diff surface = fewer merge conflicts.
- Put the contributor panel in **`Settings.tsx`**, NOT `Admin.tsx` — the other
  Claude added a members/role tab to Admin.tsx; stay out of it.
- Migration numbers are pre-split so the paper-trail files never collide:
  Stream A = 019–021, **Stream B = 022–024**.
- Consider working in the dedicated worktree at
  `.claude/worktrees/stream-b` (branch `stream-b`) if you want isolation from the
  main tree — but note the Home.tsx change above lives in the MAIN tree, so if
  you build Events in a worktree the event-ball wiring won't resolve until both
  merge. Simplest may be to keep going in the main tree and let Charlie sequence
  the merges. Your call.
- Stream A landed the **contributor role foundation** already (VALID_ROLES has
  `contributor`, `get_contributor_member` exists, `GET /admin/members` added,
  Admin members tab). So you are **fully unblocked** — gate on contributor now.

---

## 6. Words of wisdom (hard-won, from memory + last round)

- **Git needs explicit approval.** NEVER commit / push / branch / merge without a
  direct per-action go-ahead from Charlie — even in auto-approve mode. Ask.
- **No `Co-Authored-By: Claude` trailer** on commits in this project.
- **Never commit `ios-v1/.env.bak.prod`** (it's in the tree, untracked; leave it).
- **Deploy flow** (only when authorized): commit → `git push origin main` →
  `ssh quentin@192.168.86.92 'cd ~/painting-club && git pull --ff-only'`. The
  `api` container bind-mounts `src/` with `uvicorn --reload`, so a pull auto-
  reloads; startup runs `create_all` + idempotent `run_migrations()`. Pi IP is
  **192.168.86.92** (NOT .0.192 / .0.127 — those time out). Postgres container
  `pg-db`, user `painting-admin`, db `painting-club`.
- **Test against the Pi, not local docker** (per Charlie's setup).
- **Verify backend before deploy** with the isolated rig: throwaway
  `docker run postgres:16`, run uvicorn from a venv against it, seed with
  `docker exec -i <pg> psql` (the `-i` matters — piping without it silently
  inserts 0 rows), smoke-test routes with python `urllib.request`. Set
  `JWT_SECRET=<anything>` in the uvicorn env or login 500s.
- **Route-ordering gotcha**: FastAPI matches in definition order. A static path
  like `/members/media-order` will be captured by an earlier `/members/media/{x}`
  if you're not careful — last round a `/members/media/order` got eaten by
  `/members/media/{medium}` (422). Name usage routes so they can't be shadowed.
- **Shared EAS channel**: a parallel session publishes the SAME production OTA
  channel from the full working tree. If you publish an OTA from a clean/isolated
  worktree it will REVERT the other session's live WIP bundle. If you must OTA,
  publish the full working tree, or use `eas update:republish` to undo damage.
  Best: don't OTA without Charlie's say-so and coordination.
- **Dual-runtime OTA** (if you ever ship one): 1.0.4 (build #9, real native
  modules, clean metro.config) + 1.0.3 (build #8, needs the SHIMS block aliasing
  `expo-audio`/`expo-linear-gradient`/`expo-document-picker`/`react-native-webview`
  to JS stubs; verify the `.hbc` has 0 refs via `strings *.hbc | grep -c`).
- **expo-audio peer override**: ios-v1 needs npm `overrides` pinning
  expo-asset/expo-constants or the native build breaks with "Cannot find native
  module 'ExpoAsset'".
- **Don't add helper/instructional text to user-facing UI** unless Charlie
  explicitly asks. Keep copy terse and lowercase — match the existing voice
  ("week's prompt", "about the app", "u sure?").
- **Typecheck as you go**: `cd ios-v1 && npx tsc --noEmit` for the app; the
  backend has no type-checker but keep it import-clean.

---

## 7. Status checklist

- [x] Home: hide fidget + add bouncing "event" ball (uncommitted, main tree)
- [x] **#4 Events surface FE** — `Events`/`EventDetail`/`EventEdit` screens +
      routes in HomeStack + types; `event_*` api client (`api/index.ts`) + TS
      types (`api/types.ts`). Detail hosts guest management (invite/co-host add
      + remove via member picker). Home event-ball wiring now resolves.
- [x] **#5 Behavioral usage trail** — `UsageEvent` model (create_all builds it),
      `db_ops/usage.py`, `POST /usage` ingest (`get_current_member`),
      `GET /usage/summary` (contributor). Client: `api/observability.ts`
      emitter, nav-state listener in `App.tsx`, login emit in `AuthContext`.
      Paper trail `migrations/022_usage_events.sql`.
- [x] **#7 Contributor panel** — `UserStats.tsx` + `InfraStats.tsx` screens on
      RootStack, two contributor-gated items in `Settings.tsx`, read via
      `GET /usage/summary` + `GET /telemetry/summary` (both `get_contributor_member`).
- [x] **#6 Device/perf telemetry** — `DeviceEvent` model, `db_ops/telemetry.py`,
      `POST /telemetry` ingest + `GET /telemetry/summary`. Client: memory-warning
      listener + JS crash handler in `observability.ts` (`initDeviceTelemetry()`
      from `App.tsx`). Paper trail `migrations/023_device_events.sql`.
      NOTE: crash capture is best-effort (async flush may lose an in-flight
      request on a hard crash); Sentry stays the source of truth. No `perf`
      client emitter yet — the kind is accepted server-side if we add sampling.

**Verification:** ios `tsc --noEmit` clean (only 2 pre-existing `SharedValue`
errors in Home.tsx, unrelated). Backend imports (108 routes); new routes are
`POST /usage`, `GET /usage/summary`, `POST /telemetry`, `GET /telemetry/summary`
(static-path summaries can't be shadowed). Ran the isolated-rig backend test
against a throwaway postgres:16 — **14/14 checks green** (create_all builds both
tables, ingest kind-filtering, both rollup summaries, 14-day window filter).

Nothing committed/pushed/deployed. Hold for Charlie's go-ahead on each git/deploy
/OTA action. Backend (`src/**`) must reach the Pi for the panel to read real
data — see PENDING_BACKEND_CHANGES.md.
