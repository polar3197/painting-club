# Webapp ↔ iOS Parity Plan & Progress

*Paused 2026-07-05 — Charlie is away from home, so nothing can deploy to the Pi
(the webapp only runs there). All work below is local, uncommitted, in `src/ui`.
The backend needed ZERO changes — every endpoint used here is already live on
the Pi from earlier sessions.*

## Goal

Bring as much iOS-app functionality as possible to the React webapp with
minimal change to the webapp's existing style/layout (plain per-feature CSS,
serif fonts, 1px black borders, gold `rgb(238,190,100)` accents).

## Design decisions (confirmed with Charlie)

- **Messages**: two-pane desktop layout (list left, thread right), collapses to
  list→thread under 640px. Route `/messages`. Also in the sidebar with a red
  unread dot.
- **Navigation**: sidebar minimized to mirror iOS tabs — **home (title), Me,
  Stuff, Share, Messages**. Removed People/Art/Admin/Docs/Logout:
  - People + Art → combined under `/stuff` (iOS "stuff" tab; old `/members`
    and `/art` routes still work for deep links).
  - Admin / logout / delete-acc → settings gear (⚙) on your own profile
    (iOS Settings screen as a ContextPopup menu).
  - Docs → "about the app" link on Home (→ `/ethos`), like iOS.
  - Feature requests → "request something for the app" link on Home.
- **Comments received**: toggle on the bio/artist-statement card flipping it to
  the paginated list (closest web analog of the iOS swipeable bio carousel).
  *(Not built yet — task 7.)*

## DONE (compile-verified via `npm run build`; NOT yet tested in a browser)

1. **Secret-code login flow** — `Login.tsx` non-member panel gained
   "secret code?" → code input → `redeem_setup_code` → stores token →
   `/setup`. `api.ts` `request()` 401-handler now skips
   `/members/redeem-setup-code` (bad code ≠ session expiry).
2. **API port** (`src/ui/src/api.ts`, appended at bottom + series fields on
   Visual2D types): conversations (9 fns), member directory, unread count,
   feature requests (4 fns), audio CRUD (AudioIn/Out/UpdatePayload),
   comments-received page, refresh_token, forgot_password, accept_terms,
   get_password_resets. `Visual2DIn/Out/UpdatePayload` gained
   `series_name`/`series_id`/`order_index`/`clear_series` + FormData appends.
3. **`/messages` page** — `components/Pages/Messages.tsx` + `styles/messages.css`.
   Inbox: 1:1/groups tabs, previews, unread badges, 6s poll (visibility-gated).
   Thread: 4s first-page poll merged by id, scroll-up cursor pagination with
   scroll-position preservation, gold unseen bubbles vs `previous_read_at`
   (captured on FIRST fetch only), day separators (today/yesterday/date),
   sender labels in groups only (tap → profile), Enter-to-send (failed send
   restores draft), group invite sheet + leave (ConfirmDialog). Compose sheet:
   directory-fed, single-tap DM / multi-select + title group. Deep link
   `/messages?c=<conversationId>`.
4. **Profile mail buttons** — `UserProfile/UserInfo.tsx`: owner gets ✉ with
   red dot (15s `get_unread_count` poll) → `/messages`; visitors get ✉ →
   `open_dm` → `/messages?c=<id>` (hidden when blocked/logged out).
5. **`/requests` feature board** — `Pages/RequestFeature.tsx` +
   `styles/requests.css`: optimistic vote math (retract/switch), click-to-expand
   clamped titles, admin-only @requester, inline create form, owner/admin ×
   delete with ConfirmDialog. Home button links to it.
6. **Sidebar reorg** — `Pages/Sidebar.tsx` rewritten (home/Me/Stuff/Share/
   Messages + unread dot, 15s poll). New `Pages/Stuff.tsx` (+`stuff.css`):
   people/art tab switcher reusing the existing People and ArtGallery
   components. New `Pages/Share.tsx` (+`share.css`): fetches own media, medium
   grid → existing AddArtDialog; create handlers call
   `add_new_visual_2d`/`add_new_written_form` then land on the profile at that
   medium. Settings gear menu in `UserInfo.tsx` (admin route, logout confirm,
   DeleteAccountDialog for non-admins). Home gained "about the app".
7. **Routes** — `App.tsx`: `/messages`, `/requests`, `/stuff`, `/share`
   registered ABOVE the `/:username` catch-all (order matters!).

## TODO (session task list ids in parens)

- **(5) Audio medium on web**: `AudioPiece` tile with native `<audio>` styled
  like the app's player bars (shared "one playing at a time" ref);
  `AudioForm` (title/date/album) branch in `AddArtDialog` (`type === "audio"`
  from `get_media`); `<input type=file accept="audio/*">` + duration capture
  (load into an `Audio` element, read `.duration`); render audio media in
  profile `UserProfile/Art.tsx` (currently visual_2d + written_form only) and
  Portfolio; edit/delete parity (`update_audio`/`remove_audio`). Share page
  picks it up automatically once AddArtDialog branches.
- **(6) Collections parity**: series field in `Utils/PaintingForm.tsx`
  (WrittenFormForm already has one); AddArtDialog visual create/update to send
  `series_name`/`clear_series` (written path already does); group visual-2d +
  audio pieces by `series_id` reusing the writing machinery (CollectionRow /
  CollectionZoomIn / CollectionPanel in `UserProfile/`); multi-image upload
  (`<input multiple>`, cap 12, numbered titles, fan-out one create per file).
- **(7) Small parity items**: "forgot password?" on Login (fire-and-forget
  `forgot_password`, dialog seeded with typed username); password-resets
  section atop Admin applications tab (`get_password_resets` — username/email/
  code); comments-received toggle on own bio card (cursor-paginated, gold
  unseen vs `previous_view_at`, tap → art piece); `refresh_token` on app load
  (AuthContext effect: swap stored token for fresh 30-day one); terms gate at
  login (`profile.terms_accepted_at == null` → terms modal → `accept_terms` —
  note: web `Profile` type needs `terms_accepted_at` added).
- **(8) Verification**: `index.html` references `/src/main.jsx` but entry is
  `main.tsx` — build works, but confirm dev server does too; ESLint config is
  pre-broken for TypeScript (parsing errors repo-wide, predates this work);
  **manual browser testing of everything above** — none of it has run in a
  browser yet, only compiled.
- Optional/parked: render members' `profile_colors` on web profiles (data
  already in `Profile`); voice recording via MediaRecorder; past-prompts list.

## How to resume + ship

1. Local test without the Pi: `cd src/ui && npm install && npm run dev`, with a
   vite proxy for `/api` → `https://paintingclub.art/api` (check
   `vite.config.ts` — currently nginx does the proxying in docker, so dev may
   need a `server.proxy` entry).
2. When home: commit (NO Claude co-author line; ask Charlie before any git
   action), push, `ssh quentin@<pi>` (address changes with network; last known
   192.168.86.92), `cd ~/painting-club && git pull`. Frontend container serves
   vite dev with bind-mounted src, so a pull hot-reloads; if not, restart the
   frontend container.
3. No DB/API changes are needed for anything in this plan.
