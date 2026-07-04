# Share Extension — "send to Painting Club" from Notes / Voice Memos / anywhere (build 1.0.5)

**Goal:** Painting Club appears in the iOS share sheet. Sharing a note (Notes),
a recording (Voice Memos), a PDF (Google Docs "send a copy"), or any audio/text
file drops the user straight into the app's share flow with the content
preloaded — no copy-paste, no Save-to-Files round-trip.

**Why a native build:** a share extension is a separate iOS app-extension
target. It cannot ship OTA. This is THE headline feature for the 1.0.5 binary.

**Status: planned, not started.** (Written 2026-07-03. As of now: 1.0.4/build #9
is on TestFlight/App Store review; audio + written-form + in-app recording all
work; paste-text is the Notes bridge.)

---

## Library

[`expo-share-intent`](https://github.com/achorein/expo-share-intent) — config
plugin, actively maintained, **Expo SDK 54 supported (v5+)**. Receives text,
URLs, images, videos, audio and files on iOS + Android.

- No Expo Go: needs the dev client / native build (we're already there).
- Alternative if we ever want custom share-sheet UI: `expo-share-extension`
  (MaxAst). Not needed for v1 — default "open the app with the payload" is
  exactly our UX.

## Setup steps

1. `npx expo install expo-share-intent`
2. `app.json` plugins:
   ```json
   ["expo-share-intent", {
     "iosActivationRules": {
       "NSExtensionActivationSupportsText": true,
       "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
       "NSExtensionActivationSupportsFileWithMaxCount": 1
     },
     "iosAppGroupIdentifier": "group.com.paintingclub.app"
   }]
   ```
   - Text rule → Notes share sheet offers us. File rule → Voice Memos + Files
     + Google Docs PDFs offer us. (Audio arrives as a file.)
3. **App Group** `group.com.paintingclub.app` — the plugin adds the
   entitlement; EAS creates/needs the App Group on the Apple Developer portal
   (attached to the bundle id). `eas build` regenerates the provisioning
   profile — say yes when it asks to add the capability, or pre-create in the
   portal. The extension hands files to the main app through this group
   container.
4. Version bump `1.0.4 → 1.0.5` in app.json (runtime isolation: 1.0.4 users
   keep their OTAs; no shims involved — 1.0.4+ builds have all native modules).
5. `eas build --profile production -p ios` → `eas submit` (ASC key already on
   EAS servers; agreements were signed 2026-07-01).

## App-side wiring (OTA-able afterwards, but ship it in the same build)

`useShareIntent()` hook (from expo-share-intent) at the navigation root
(`App.tsx` or a small hook in `RootNavigator`):

```ts
const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
```

On `hasShareIntent`, route by payload into the existing **AddArt** share flow
(it's a tab; navigate + pass params, mirroring the existing
`navigate('Add', { medium })` preseed pattern):

| payload | route | preload |
|---|---|---|
| `shareIntent.text` (Notes, Safari selection) | AddArt → written medium picker (or default "writing") | `pastedText = text`, writeMode='text' |
| file with audio ext/UTI (.m4a/.mp3/.wav/.aac) | AddArt → audio medium picker (or "song") | `pickedFile = {uri,name,type}` → existing pre-listen + duration capture takes over |
| file .pdf/.txt/.docx/.md | AddArt → written | `pickedFile`, writeMode='file' |
| image file | AddArt → visual flow | `pickedFile` |

Implementation notes:
- AddArt currently resets state on focus (`useFocusEffect`) — the share-intent
  preload must survive that: pass payload via route params and consume them in
  the same reset callback (same pattern as the existing `medium` param).
- If the user isn't logged in, stash the intent until after login (AuthContext
  gate), then continue.
- `resetShareIntent()` after consuming, so re-focusing the tab doesn't
  re-trigger.
- Medium choice: don't guess too hard — land on the medium picker step with
  the file already attached, let the user pick song/music vs writing/poetry.
  (detailsReady logic already handles the rest.)

## Testing checklist

- [ ] Notes → share note → PC opens with text in paste box
- [ ] Voice Memos → share recording → PC opens with audio attached → pre-listen shows waveform/duration
- [ ] Google Docs → share → "Send a copy" → PDF → PC opens with file attached → posts → renders in-app (WKWebView PDF viewer already shipped)
- [ ] Files app → share any .txt/.pdf/.m4a → same
- [ ] Cold start vs already-running app (intent must work in both)
- [ ] Logged-out → login → intent continues
- [ ] Regular (non-share) launches unaffected

## Gotchas (from research)

- EAS credentials: the extension target needs its own provisioning — EAS
  handles it but may prompt; `eas credentials` if it doesn't.
- The share extension inherits a small memory limit (~120MB) — fine, it only
  copies the file to the group container and opens the app.
- Android comes free with the same plugin (whenever an Android build happens).
- Sentry + share-intent config plugins both touch the Xcode project — build
  once locally (`expo prebuild --clean` + `expo run:ios`) before burning an
  EAS build to shake out plugin conflicts.
- REMINDER: `metro.config.js` must have NO build-#8 shims at build time (the
  1.0.5 binary compiles real modules) — same rule as the 1.0.4 build.

## Effort estimate

~1 session: install + config + prebuild sanity (1–2h), app-side intent routing
(1–2h), EAS build + TestFlight (~1h wall clock), device testing. Apple review
adds the usual day-ish for the store release.
