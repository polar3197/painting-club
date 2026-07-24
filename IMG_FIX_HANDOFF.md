# Stream IMG+FIX — handoff

You are Claude 2 of a two-Claude split of the remaining work in
`PENDING_BACKEND_CHANGES.md` (repo root — read it first; this doc is
orientation + working agreements, the full specs live there). The split is
**by feature, end-to-end**: you own your features' backend, nginx, client
wiring, and OTA. The other stream (Stream WEB, a parallel Claude session) owns
#10 "inspiration web" end-to-end and does NOT touch your files.

## Your scope

All specs are in `PENDING_BACKEND_CHANGES.md` under these headings:

1. **"Image delivery — kill the linger then snap" → Track 3** (the big one).
   Mid-res ~1600px "display" derivative: `generate_display` mirroring the
   thumb machinery, eager-gen at both upload callsites, gated
   `GET /art/{art_id}/display` route cloned from `get_art_thumb`, unlink on
   delete/replace, nginx block for raw `/static/display`. Then the FE wiring:
   `displayUrl`/`displaySource` in `ios-v1/src/api/client.ts` (mirror
   `thumbSource`, ~line 122), swap the profile `Visual2DPiece`
   (`UserProfile.tsx`) and the zoom carousel to it, expo-image `onError` →
   fall back to the original so the OTA is safe to ship before OR after the
   backend deploys. **Track 2 (768px thumbs) is skipped** — redundant once
   Track 3 lands.
2. **"## 1. Stable media-tab order"** — one-line `ORDER BY Media.name` in
   `db_get_profile` (`src/db/db_ops/profile.py`). After it deploys, drop the
   client-side alphabetical sort in `ios-v1/src/screens/UserProfile.tsx`.
3. **"## 2. Backfill aspect_ratio"** — idempotent startup backfill called from
   the `lifespan` hook in `src/api/main.py` (full code is in the spec;
   `abs_path` + `_compute_aspect_ratio` already exist there — match the
   session-maker name used by other startup DB work). After deploy, optionally
   remove the `RNImage.getSize` thumb-measuring effect in `Visual2DPiece`.
4. **"## 4. Duplicate-email approval"** — duplicate-email check in
   `db_approve_application` (`src/db/db_ops/applications.py`) → clear
   `ValueError`, mapped to **409** in `update_application_status`
   (`src/api/main.py` ~1794, which today only maps ValueError→404 — split it
   like `resolve_media_request` does). Then the better half: if the existing
   member is an untouched `pending_setup` orphan, reuse it (fresh temp
   password + expiry) so re-applications just work. Backend only — the iOS
   admin alert already surfaces whatever detail the server returns.
5. **Cleanup rider:** retire the Admin.tsx members-tab "save role" control —
   it 403s for pure admins since the role-model inversion (see the "ROLE MODEL
   INVERTED" note in the pending doc); superseded by the contributor
   "user roles" page under Settings.

Suggested order: #1 → #2 → #4 (small, independent wins) → Track 3 backend →
Track 3 FE + the client cleanups as one OTA.

## Working agreements (collision rules — do not skip)

- **Branch off `main`** on your own branch (suggest `stream-imgfix`), ideally
  in a **git worktree** — a third parallel session may be editing the main
  `ios-v1/` working tree live. Never `git checkout`/discard files in the
  shared tree.
- **NEVER commit, push, or branch without Charlie's explicit per-action
  go-ahead**, and no `Co-Authored-By: Claude` trailer on commits.
- `src/api/main.py` and `src/nginx/nginx.conf` are shared hotspots with
  Stream WEB: keep your additions in **append-only blocks** so merges stay
  trivial.
- **Migration numbers:** you ship no DDL. If something unexpectedly needs a
  migration, yours start at **026** (025 is reserved for Stream WEB).
- **`ios-v1` file ownership:** yours are `src/api/client.ts`,
  `src/screens/UserProfile.tsx`, the art carousel component, and
  `src/screens/Admin.tsx`. Stream WEB owns `src/api/inspiration.ts` +
  `inspirationMock.ts` — don't touch those, and don't put shared helpers in
  their files.
- **No instructional/helper text in user-facing UI** — Charlie's standing
  rule.
- Status updates: append your own status lines to `PENDING_BACKEND_CHANGES.md`
  (Stream WEB owns the doc's overall structure).

## Verification & deploy

- **Backend:** smoke-test against a **throwaway `postgres:16` + local
  uvicorn** (the pattern every prior stream used — never against prod).
  `pytest tests/` for the existing suite.
- **Frontend:** `cd ios-v1 && npx tsc --noEmit` must be clean (2 pre-existing
  `Reanimated.SharedValue` errors in Home's bounce-ball WIP are known noise).
  For on-sim verification use the `ios-v1:verify` skill / the isolated
  second-simulator rig — don't click the primary sim if a parallel session is
  active.
- **Deploy is NOT yours to run unprompted:** prod is a Raspberry Pi on
  Charlie's home LAN (`quentin@…` — the address differs between notes, ask
  Charlie; the pending doc's NEXT PULL block has the ritual). The api
  container bind-mounts `src/` and hot-reloads on `git pull`; **your nginx
  change additionally needs `docker restart nginx`**. Coordinate with
  Stream WEB so both nginx blocks ride one pull + one restart.
- **OTA:** the EAS `production` channel is shared across sessions and OTAs
  from the main tree target **runtime 1.0.5** — coordinate with Charlie
  before publishing (`eas update:republish` is the undo).
- Deploy-order safety is per-item: Track 3 FE is order-free (onError
  fallback); the #1/#2 client cleanups only ship AFTER the backend pull.
