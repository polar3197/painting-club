# Written form: short form vs long form

*Date: 2026-07-30 · Scope: backend + iOS (`ios-v1`). Web app follows later.*

## Goal

Split written media into **short form** (poetry, thoughts) and **long form**
(short stories, novels, essays). Short-form pieces read in a **vertically
scrolling** reader that preserves line breaks exactly; long-form pieces keep the
existing paged book-style reader. The distinction is a property of the medium
(tab), not of individual pieces.

## Decisions made (with Charlie)

1. **Classification lives on the medium**, not per piece.
2. **Two formats**: `short` and `long` — no separate poetry-vs-thoughts styling.
3. **Tab layout unchanged**: same snippet/cover cards; only the opened reader
   differs.
4. **Existing prod tabs are backfilled by name** (poem/poetry/thought/haiku →
   short; all other written tabs → long), with a switch to fix wrong guesses.
5. **Format is shared per medium** (media rows are global, get-or-created by
   name — everyone's "poetry" tab is one row). Because nobody owns a shared
   medium, the fix-it switch is **contributor-only**.
6. Backend deploys first over SSH to the Pi; the iOS OTA follows. No client-side
   name heuristic needed.

## Backend

### Schema (migration 026 — confirm the number is still free at implementation)

- `media.written_format VARCHAR(10) NULL` — `'short'` | `'long'`; NULL on
  non-written media and on unknown/legacy state (client treats NULL as long).
- `media_request.requested_format VARCHAR(10) NULL` — what the requester picked;
  NULL for non-written requests and legacy rows.
- Idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for both in
  `run_migrations()` (`src/db/db_manager.py`), plus paper-trail
  `src/db/migrations/026_written_format.sql`.
- **Backfill, in the same migration block, idempotent (touches only NULLs):**
  ```sql
  UPDATE media SET written_format = 'short'
   WHERE type = 'written_form' AND written_format IS NULL
     AND name ~* '(poem|poetry|thought|haiku)';
  UPDATE media SET written_format = 'long'
   WHERE type = 'written_form' AND written_format IS NULL;
  ```
  Ordering note: the 'long' sweep must run after the 'short' sweep and only in
  the same startup pass, so a fresh medium created later with an explicit format
  is never touched (it's never NULL).

### API

- `GET /media` (and any other place `Media` serializes to the client's
  `MediaType`): add `written_format`.
- `POST /media/request` (submit): accept optional `requested_format`
  (validated: `short`/`long`, only meaningful with `requested_type ==
  'written_form'`); store on the request row. Admin request listing returns it.
- Approval path (`resolve_media_request` → `db_create_media`): pass the format
  through; `db_create_media` gains a `written_format` param and stamps it the
  same way it stamps `type` — set when NULL, never overwrite an existing value.
- **New** `PATCH /media/{name}/format` `{ "written_format": "short" | "long" }`
  — gated by `get_contributor_member`; 404 unknown medium, 422 if the medium is
  not `type == 'written_form'`.
- No nginx change (api-only; the api container hot-reloads on `git pull`).

### Tests

Extend the throwaway-postgres suite (`tests/`): backfill idempotence (second
run is a no-op; explicit formats survive), request→approval passthrough,
PATCH gating (member 403, contributor 200), non-written medium rejected.

## iOS (`ios-v1`)

### Types & API client

- `MediaType.written_format?: 'short' | 'long' | null` (`src/api/types.ts`).
- `submit_media_request` payload gains optional `requested_format`.
- New `set_media_format(medium, format, token)` → the PATCH route.

### Creating tabs — `AddMediaDialog.tsx`

`TYPE_OPTIONS` replaces the single "written form" entry with two:
**written (short form)** and **written (long form)** — both submit
`requested_type: 'written_form'` plus the matching `requested_format`.
Admin approval UI (`Admin.tsx` media-requests tab): display the requested
format; the legacy fallback type picker (type-less old requests) gains the same
two written entries.

### Contributor format switch

In `AddMediaDialog`'s media list rows: for written media, contributors (and
only contributors — gate on the existing role from auth context) see a small
`short form` / `long form` toggle that calls `set_media_format` and updates
local state. No helper text (per Charlie's standing preference).

### Reader — `WrittenFormZoomIn.tsx`

New prop `format?: 'short' | 'long'` (default `'long'`, so absent data
degrades to today's behavior).

- **`long` (unchanged):** current WebView CSS-column paged reader, horizontal
  swipe, page indicator, font slider.
- **`short` (new):** for text files (`txt`/`md`), replace the WebView with a
  native `ScrollView` + `Text`:
  - text already arrives as a string via `useWrittenFormTextState` — no HTML,
    no WebView;
  - serif font matching the paged reader (Georgia equivalent via
    `Fonts.serif`), line height ~1.5, `fontSize` driven directly by the
    existing slider state (slider stays; page indicator dropped);
  - line breaks preserved exactly (native `Text` never hyphenates or
    justifies) — poetry-safe;
  - vertical scroll, indicator hidden, same header/title/close chrome.
- **PDFs**: unchanged in both formats (WKWebView renders them natively;
  vertical scroll is its default).

### Threading the format

The reader only opens from profile contexts, and `UserProfile.tsx` already
fetches `get_media()` into `allMedia` — so:

`UserProfile` computes the active written tab's format from `allMedia` →
passes `format` to `WrittenFormPiece` and `SeriesZoomIn` → both forward it to
`WrittenFormZoomIn`. Gallery and bookmark cards navigate to the profile rather
than opening the reader, so no other payload changes anywhere.

## Rollout

1. Backend: commit → push → `ssh quentin@100.114.160.63`, `git pull` in
   `~/painting-club` (api hot-reloads; startup runs the idempotent migration +
   backfill). Verify: `GET /media` shows `written_format`, prod written tabs
   correctly split, PATCH gated.
2. Record the deploy in `PENDING_BACKEND_CHANGES.md` (status entry, per
   standing practice).
3. iOS: `npx tsc --noEmit`, verify on the isolated sim rig, then OTA.
   ⚠️ OTA caveats from memory: updates from this tree target **runtime 1.0.5**,
   and the EAS `production` channel is shared with a parallel session —
   coordinate before publishing.
4. Either order is safe for clients: old app + new backend ignores the new
   field; new app + old backend sees no `written_format` and defaults to long
   form.

## Out of scope

- Web app (`src/ui`) reader split — follow-up once iOS ships.
- Distinct poetry-vs-thoughts styling (collapsed into one short-form
  treatment by decision 2).
- Per-piece format overrides.
