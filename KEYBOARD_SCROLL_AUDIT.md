# Keyboard-scroll audit — ios-v1

**Bug class:** text inputs that get hidden behind the on-screen keyboard with no way to
scroll them into view.

**Reference fix (already applied to `EditProfile.tsx`):** drop the flaky
`KeyboardAvoidingView behavior="padding"` wrapper, add
`automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}` to the form ScrollView, set
`keyboardDismissMode="interactive"` (instead of `"on-drag"`, which dismisses the keyboard
the instant you drag to scroll), and give the ScrollView `flex: 1`.

Scope: swept all 23 files that reference `TextInput`. Each verdict below was produced by a
per-file read; the four 🔴 rows were additionally spot-verified against source.

---

## 🔴 Broken — a field can be stranded under the keyboard (✅ ALL FOUR FIXED)

> Status: #1–#4 fixed (working tree, uncommitted). Typechecks clean.
> AddArt tradeoff: the fixed footer nav (back/next/share) now sits behind the
> keyboard while a field is focused — dismiss the keyboard (swipe down) to tap it.

| # | File | Input(s) that get covered | Why | Fix | Effort |
|---|------|---------------------------|-----|-----|--------|
| 1 | `src/screens/AddArt.tsx` | Painting `width`/`height`, written `series`, audio `album` (bottom form rows) | Exact EditProfile double-bug: `KeyboardAvoidingView` padding + `keyboardDismissMode="on-drag"` on the stage-2 form scroll; tall content (200px dropbox + 8 painting rows) overflows and the focused low field can't be scrolled up while the keyboard is open | Apply the EditProfile pattern to the stage-2 ScrollView (drop KAV, `automaticallyAdjustKeyboardInsets`, `interactive`, ensure `flex:1`) | Medium |
| 2 | `src/components/AddMediaDialog.tsx` | `requestName` ("propose a media form") | Input lives in a **fixed footer** *outside* the panel ScrollViews, at the bottom of a centered 520px dialog, with no KAV → keyboard covers it on essentially every screen size; user types blind | Wrap the dialog in a `KeyboardAvoidingView behavior="padding"` (lifts the whole sheet), or move the request row into a keyboard-aware scroll | Low |
| 3 | `src/components/DeleteAccountDialog.tsx` | type-your-username confirm field | Centered dialog with **zero** keyboard handling; the confirm input and the "delete forever" button sit in the dialog's lower half → keyboard covers both on SE-class screens | Wrap in `KeyboardAvoidingView behavior="padding"` (compact single-input dialog, same shape as ReportDialog which is fine) | Low |
| 4 | `src/screens/Admin.tsx` | media-request rename field (`rowEditInput`, shown on "approve") | Inline reveal input inside the page ScrollView, which has **no** keyboard props; when the row is low and content is short, nothing scrolls it above the keyboard | Add `automaticallyAdjustKeyboardInsets` + `keyboardDismissMode="interactive"` to the top-level ScrollView (already `flex:1`) | Low |

## 🟡 At-risk — works in the common case, fragile on small screens (optional)

| # | File | Note | Suggested tweak |
|---|------|------|-----------------|
| 5 | `src/components/AddArtDialog.tsx` | Edit/create bottom sheet. Manual lift-and-cap (`paddingBottom: kbHeight` + `panelMaxHeight`) already keeps the sheet above the keyboard, but `on-drag` + no insets makes lower fields cramped/awkward on short devices | Change `keyboardDismissMode="on-drag"` → `"interactive"` (~line 615); optionally add `automaticallyAdjustKeyboardInsets` to `scrollArea`. Keep the existing lift — don't add a KAV on top |
| 6 | `src/components/ApplicationDialog.tsx` | 7-field membership form (incl. multiline `reason`) in a centered modal with KAV padding + scroll but no auto-insets. Lower fields aren't auto-revealed; a manual-scroll escape hatch exists (dismiss mode is `none`) | Apply EditProfile pattern to its ScrollView |
| 7 | `src/screens/SetupAccount.tsx` | 3 inputs high in an 85%-height scroll card; leans entirely on KAV padding. Buttons only reachable by manual scroll | Add `automaticallyAdjustKeyboardInsets` + `interactive` to the card ScrollView; KAV can go |
| 8 | `src/screens/LandingPage.tsx` | Main login is fine. The two **centered modals** ("secret code", "forgot password") — each an `autoFocus` single input — have **no** keyboard handling; at-risk on small screens / landscape / large text | Wrap each modal's panel in a KAV, or top-anchor the panel instead of vertical-centering |
| 9 | `src/components/Dropdown.tsx` | Reusable field whose suggestion list opens **downward**; if a parent places it low in a form, the field + its 200px list sit behind the keyboard with no self-recovery | No change if every consumer is in a keyboard-aware scroll; otherwise flip the list to open upward when low on screen. Verify consumers (AddArtDialog "move to", forms) |

## 🟢 Fine — no fix needed

- `src/screens/RequestFeature.tsx` — bottom-anchored sheet + KAV padding (canonical correct composer pattern).
- `src/components/ReportDialog.tsx` — compact single-input centered dialog; KAV padding lifts it cleanly.
- `src/screens/ConversationThread.tsx` — chat composer rides the keyboard via KAV padding on the bottom bar.
- `src/screens/Messages.tsx` — group-name field at the top of a ≤60% bottom sheet; clears the keyboard.
- `src/components/ArtComments.tsx` — composer rides the keyboard; image section deliberately collapses to make room.
- `src/screens/SearchTabs.tsx` — bespoke, correct: search bar is translated to rest exactly on top of the keyboard.
- `src/screens/People.tsx`, `src/screens/ArtGallery.tsx` — results grids, no inputs; `on-drag` dismiss is intentional there.
- `src/components/AlbumTile.tsx`, `src/components/PaintingSeriesRow.tsx` — rename fields pinned at the very top of the screen; keyboard can't reach them.
- `src/components/PaintingForm.tsx`, `AudioForm.tsx`, `WrittenFormForm.tsx` — passive field rows with no keyboard logic of their own; **fixed automatically when their host `AddArt.tsx` is fixed** (#1).

---

## Suggested order if you decide to fix

1. **#1 AddArt.tsx** — highest impact (core create flow; also resolves the three `*Form.tsx` children). Same fix you just did in EditProfile.
2. **#2 AddMediaDialog, #3 DeleteAccountDialog, #4 Admin** — each a low-effort, self-contained fix for a genuinely stranded field.
3. **#5 AddArtDialog** — one-line `on-drag`→`interactive` improvement.
4. **#6–#9** — polish/hardening; do if/when touching those screens.
