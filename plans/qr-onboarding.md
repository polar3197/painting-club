# QR Onboarding & Seamless App Handoff — Plan & Tracker

**Last updated:** 2026-08-30
**Owner:** Charlie
**Status:** Web `/join` + Phase 2 polish **committed on main** · **blocked on RPi access to deploy**

Goal in one line: put a QR code on flyers around SF that drops a stranger into a
clean "request an account" experience — and, if they already have the iOS app,
opens *the app* instead of the browser. All of it feeding the existing
admin-review flow.

Status legend: ✅ done · 🟡 in progress / built-not-deployed · ⬜ not started · ⛔ blocked

---

## 1. Vision & Goals

1. **Flyer → QR → sign up.** A printed QR around SF resolves to a single-purpose
   request-account page. No hunting through a login screen first.
2. **Seamless.** The landing feels like one intentional screen, not a dialog
   bolted over the login. Mobile-first (it's scanned on phones).
3. **App-aware.** If the scanner already has the Painting Club iOS app installed,
   the QR opens the app directly to the request/join screen (iOS Universal Link).
   If not, it gracefully falls back to the web page — which also offers an
   App Store download.
4. **Review preserved.** Every submission still lands in the admin review queue
   (`POST /apply` → `/admin/applications`). No open self-signup. (Per Charlie.)

Non-goals (for now): open/instant account creation; Android deep links
(mirror later); email delivery of setup codes (still manual via admin panel).

---

## 2. Findings (environment & infra)

### Dev machine (post-wipe MacBook)
- Mac was **fully wiped for work**; this repo + a fresh SSH key are all that's local.
- Installed this session: **Tailscale** (`tailscale-app` cask), **Node 26.7** (brew),
  **qrencode** (brew), and the UI's npm deps.
- `~/.ssh/id_ed25519` is **newly generated today** — the old private key is gone
  (no Time Machine, no iCloud copy, no backup).

### Tailscale / RPi — ✅ network up, ⛔ SSH blocked
- Tailscale is connected. This Mac = `charlies-macbook-pro-1` (100.73.187.51).
- The Pi (`quentin`, **100.114.160.63**) is **online and reachable** at the
  network layer; its host key is now trusted in `known_hosts`.
- **Blocker:** the Pi accepts **publickey auth only** (password auth disabled),
  and this wiped Mac's *new* key is not in the Pi's `~/.ssh/authorized_keys`.
  Tailscale SSH is **not** enabled on the Pi either (can't bypass that way).
- The Pi is **off-site**, so the one-time fix has to wait until there's physical
  or console access. See Roadblocks.

### iOS app — ✅ live, Expo/RN
- **Expo (SDK 54) / React Native**, not native Swift. `expo-linking ~8.0.12` and
  `@react-navigation/native ^7` are already dependencies.
- **Already on the App Store**: `ascAppId 6762710261`, bundle
  `com.paintingclub.app`. App Store URL: `https://apps.apple.com/app/id6762710261`.
- Ships JS via **Expo OTA updates** (`expo-updates`, channel `production`).
  ⚠️ Entitlement changes (Associated Domains) **cannot** ride OTA — they need a
  native rebuild + App Store submission.
- The app **already has** a request-access surface: `src/screens/NotMember.tsx`
  and an `/apply` API call (`ios-v1/src/api/index.ts:533`). Navigation is a
  `RootStack` in `ios-v1/src/navigation/index.tsx`; `NavigationContainer` in
  `ios-v1/App.tsx` has **no `linking` config yet**.

### Web app & domain
- Public domain **`paintingclub.art`** is live, HTTPS 200, fronted by
  **Cloudflare** → Pi. `www` is not configured.
- Production is served straight from **Vite dev mode** behind nginx
  (`/@vite/client` in the returned HTML), proxied by nginx (`server_name localhost`,
  listen :80; Cloudflare terminates TLS).
- **No real AASA file exists.** `https://paintingclub.art/.well-known/apple-app-site-association`
  returns 200 but it's just the SPA `index.html` (SPA catch-all), not JSON. So
  Universal Links are **not** set up.
- Existing web onboarding: landing page (`/landing-page`) → "not a member?" →
  "request account" → `ApplicationDialog` → `POST /apply`. The backend `/apply`
  endpoint is **public** (no auth) and feeds `/admin/applications`.

---

## 3. Roadblocks

| # | Roadblock | Severity | Unblock |
|---|-----------|----------|---------|
| R1 | **New SSH key not authorized on the Pi.** Can't deploy or run live smoke tests. | ⛔ Blocks all deploys | One-time: at the Pi (HDMI+kbd or serial console), append this Mac's pubkey to `~/.ssh/authorized_keys`. While there, run `sudo tailscale up --ssh` so a future wipe can't lock us out again. Pi is **off-site** → postponed. |
| R2 | **All web changes need the Pi to go live.** Building is fine offline; shipping is not. | ⛔ (gated by R1) | Same as R1. Everything below is staged for a one-`git pull` deploy. |
| R3 | **Universal Links need Apple Team ID + a native release.** | 🟡 later | Retrieve Team ID (`TEAMID.com.paintingclub.app` for AASA); EAS build + App Store submit; ~1–2 day review. |
| R4 | **Cloudflare in front of the AASA path.** Cloudflare could cache/transform `.well-known`. | 🟡 later | After deploy, verify AASA returns raw JSON w/ `Content-Type: application/json` and no redirect through Cloudflare; add a cache/transform bypass rule if needed. |
| R5 | **Prod runs Vite dev server, not a production build.** Fine functionally; worth noting for perf/SEO of a public flyer URL. | 🟢 minor | Optional later: serve `vite build` output. Out of scope for this plan. |

**One-time Pi authorize (paste at the Pi console):**
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINXlqdD92xX7s/TLS/UaR6wr7RCzXgrpJ9vN1lwuFlhP polar1738@Charlies-MacBook-Pro' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
# optional, future-proof:
sudo tailscale up --ssh
```

---

## 4. Current state of work (this session)

**Built & verified locally (clean `vite build`, `/join` serves 200) — 🟡 not deployed:**
- New route **`/join`** → a **standalone full page** (not a dialog over login).
- Extracted the request-account form into a shared component so the dialog and
  the page never drift.

Files:
- `src/ui/src/components/Utils/ApplicationForm.tsx` — **new**, shared form + submit.
- `src/ui/src/components/Pages/Join.tsx` — **new**, full-page flyer landing
  (header, tagline, form, "Get the app" App Store button, "log in" link).
- `src/ui/src/styles/join.css` — **new**, mobile-first, keyboard-safe.
- `src/ui/src/components/Utils/ApplicationDialog.tsx` — slimmed to wrap
  `ApplicationForm` (landing page + in-app `NotMember` unchanged).
- `src/ui/src/App.tsx` — `/join` route + import.
- Reverted the temporary "dialog-popup" hack in `LandingPage`/`Login`.

Committed on `main` (2026-08-28) together with the Phase 2 polish below.

Local preview used a LAN QR (`http://192.168.1.11:5173/join`) via the Vite dev
server; that's a preview only. The real flyer URL is `https://paintingclub.art/join`.

---

## 5. The Plan

### Phase 0 — Unblock the Pi ⛔ (gates everything)
- ⬜ Get physical/console access to the off-site Pi; run the R1 authorize snippet.
- ⬜ Confirm `ssh quentin@100.114.160.63` works from this Mac.
- ⬜ (Recommended) enable Tailscale SSH so key loss never blocks again.

### Phase 1 — Ship the web `/join` page 🟡 built, ⛔ deploy-blocked
- ✅ Build the standalone full-page `/join` (done this session).
- ✅ Committed (on `main`, per Charlie — no feature branch).
- ⬜ Deploy: on the Pi `cd ~/painting-club && git pull` (frontend hot-reloads
  from the Vite bind mount; **no nginx restart** needed for a pure frontend change).
- ⬜ Smoke test `https://paintingclub.art/join` on a real phone: form renders,
  submit lands a row in `/admin/applications`.
- ⬜ Generate the **production** flyer QR encoding `https://paintingclub.art/join`.

### Phase 2 — Make the web landing feel seamless ⬜
Enhancements so the QR handoff reads as one intentional screen:
- ✅ **Smart App Banner** — added `<meta name="apple-itunes-app" content="app-id=6762710261, app-argument=https://paintingclub.art/join">` to `src/ui/index.html`. On iOS Safari this shows Apple's native "Open in app / Get" banner even before Universal Links exist — cheapest win, no app release needed.
- ✅ **App-aware CTA** — `/join` detects iOS (incl. iPadOS-as-Mac) and promotes "Get the app" above the form; the form stays as the always-available path.
- ⬜ **Prefill / attribution (optional)** — support `/join?src=flyer-mission` etc. to track which flyers convert (pass through to `/apply` as a `source` field; small backend + migration — separate mini-plan).
- ✅ **Polish** — real `<form>` (Enter submits, focusable submit button, email/autocomplete hints, 16px inputs so iOS doesn't auto-zoom), submitting state, confirmation copy + back-to-login. Branded background: left as the plain card for now.

### Phase 3 — Universal Link → open the iOS app ⬜ (needs Team ID + App Store release)
Same QR (`https://paintingclub.art/join`); opens the app if installed, else web.

**3a. Host the AASA file (nginx / Pi):**
- ⬜ Add an nginx `location = /.well-known/apple-app-site-association` block that
  serves this JSON with `Content-Type: application/json`, no redirect:
  ```json
  { "applinks": { "apps": [], "details": [
    { "appID": "TEAMID.com.paintingclub.app", "paths": ["/join", "/join/*"] }
  ] } }
  ```
  (Replace `TEAMID` with the Apple Developer Team ID — **R3**.) Requires an
  **nginx restart** on deploy (config change, not hot-reloaded).
- ⬜ Verify through Cloudflare it returns raw JSON, 200, no transform (**R4**).

**3b. App config (Expo):**
- ⬜ `ios-v1/app.json` → add
  `"ios": { "associatedDomains": ["applinks:paintingclub.art"] }`.
- ⬜ (Optional) add a custom `"scheme": "paintingclub"` for a fallback deep link.

**3c. App navigation (React Navigation linking):**
- ⬜ Add a `linking` config to `NavigationContainer` in `ios-v1/App.tsx`:
  `prefixes: ['https://paintingclub.art', 'paintingclub://']`, mapping `join`
  → the request-access screen (surface `NotMember`/apply as a routable screen).
- ⬜ Handle the cold-start + warm-start cases (Expo `Linking.getInitialURL` /
  the container's built-in handling).

**3d. Release:**
- ⬜ EAS build (`eas build -p ios`) + submit (`eas submit -p ios`, `ascAppId`
  already set). Bump `ios.buildNumber`.
- ⬜ Apple review (~1–2 days), then the Universal Link is live for updated installs.

**3e. Android (later, mirror):** `intentFilters` + `assetlinks.json` at
`/.well-known/assetlinks.json`. Out of scope for v1.

---

## 6. Testing / verification checklist
- ⬜ Web: `https://paintingclub.art/join` renders full page on iOS Safari + Android Chrome.
- ⬜ Web: submit → appears in `/admin/applications`; approve → setup-code path works end to end.
- ⬜ Banner: Smart App Banner appears on iOS Safari.
- ⬜ Universal Link (app installed): scanning the QR opens the app to the join screen.
- ⬜ Universal Link (app *not* installed): scanning falls back to `/join` web page.
- ⬜ AASA: `curl -I https://paintingclub.art/.well-known/apple-app-site-association`
  → 200, `application/json`, no redirect.

---

## 7. Open questions / values needed
- **Apple Team ID** for the AASA `appID` (`TEAMID.com.paintingclub.app`). From the
  Apple Developer account / `eas credentials`.
- **Flyer URL shape:** bare `https://paintingclub.art/join`, or a short/attributed
  variant per flyer (`?src=`)? Affects Phase 2 attribution.
- **Cloudflare rules:** any existing Page Rules / cache / Transform that could
  touch `/.well-known/*` or `/join`?
- **Prod build vs dev server (R5):** leave as-is, or serve a production build for
  the public flyer URL?

---

## 8. Quick reference
- Pi (Tailscale): `ssh quentin@100.114.160.63` — **once R1 is fixed**.
- Deploy web-only change: `cd ~/painting-club && git pull` on the Pi (no nginx restart).
- Deploy that touches nginx (Phase 3a): `git pull && docker restart nginx`.
- Flyer QR target (prod): `https://paintingclub.art/join`.
- App Store: `https://apps.apple.com/app/id6762710261` · bundle `com.paintingclub.app`.
- This Mac's SSH pubkey (needs to reach the Pi's authorized_keys):
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINXlqdD92xX7s/TLS/UaR6wr7RCzXgrpJ9vN1lwuFlhP polar1738@Charlies-MacBook-Pro`


---

## 9. 2026-08-30 — Browser-first QR fast path (SHIPPED; supersedes parts of Phases 2–3)

Design agreed between Charlie, the iOS Claude and the web Claude: the QR
creates the account **in the browser**, which deletes the deferred-deep-link
problem — by the time the app matters, the person already has a username +
password and the app's existing login handles them (`must_setup` is false
after browser setup). No Branch/App Clip/paste-code, no App Store rebuild.
Universal Links remain a someday nice-to-have for already-installed re-scans.

Shipped (migration 029 + backend + web, deployed):
- `signup_invite` table: rotatable/expiring/max-use tokens; members created
  through one carry `signup_invite_id` for after-the-fact review.
- `POST /join/redeem {token, firstname, lastname, email}` → setup token
  (410 when revoked/expired/used up; 409 when the email owns a completed
  account; orphan pending-setup emails are reused like the approve path).
- Admin → **invites** tab: mint (label / expiry days / max uses), printable
  QR per token, use counts + who joined, copy link, revoke.
- `/join?i=<token>`: one combined form (name, email, username, password) →
  redeem + setup-account behind one submit → logged in → success screen
  offering the App Store link or continue-in-browser. Dead token falls back
  to the normal application form with a notice. `/join` without a token is
  unchanged (admin-review application flow).

iOS: nothing required (existing login covers QR-joined members). Optional
one-line "new here? sign up at paintingclub.art" on the app's entry screen —
ping the iOS Claude to OTA it.

Flyer QR now encodes `https://paintingclub.art/join?i=<token>` — mint the
token in Admin → invites and print the QR straight from that panel.
