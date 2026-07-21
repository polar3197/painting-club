# Pinch-to-zoom grid + feed mode (search tab)

**Date:** 2026-07-21
**Status:** approved

## Problem

The density slider under the search bar (`DensitySlider`, values 1–4) has three
problems: nobody discovers it (a bare track doesn't read as a control), the
intermediate 2/3-column stops go unused (people only want the extremes), and
the 1-per-row view undersells itself — square-cropped tiles with no context,
plus it's a plain column-count change rather than a real browsing mode.

## Decision (as built — revised during implementation with Charlie)

Replace the slider with a **pinch gesture** that steps through every density
(4 → 3 → 2 → 1), and make the 1-per-row view a proper **feed** whose cards
mirror the profile page's art elements.

### Gesture

- Pinch anywhere on the art or people grid (react-native-gesture-handler
  `Pinch`). Spread = fewer, bigger cards; pinch = denser. One column step per
  ~1.35× of scale (log-mapped), committed **live** during the gesture but
  rate-limited to ~350 ms per step so each crossfade finishes.
- The grid nudges (~±8 % scale transform) under the fingers for feedback and
  springs back on release.
- Column swaps animate only via the grids' own dim-crossfade + FlatList
  remount (`renderedColumns`); no LayoutAnimation on top (double-animating
  flashed).
- The count-based formula (`columnsFor`, shared in `src/constants/grid.ts`)
  still caps columns for small result sets.
- `DensitySlider` is deleted; the search bar area shrinks accordingly.
- Web dev preview: `ctrl+wheel` (browser pinch encoding) steps the same way.

### Feed card (art tab, 1 per row)

Modeled on the profile page's art element (`UserProfile` `Visual2DPiece`):

- Bordered card (`Colors.artCardBg`), art in a 2px-bordered frame at **true
  aspect ratio** (`aspect_ratio`, fallback square), rendered from the 512px
  thumb — a feed can't afford profile-page full-res bandwidth.
- Details: **title** (serif, lg) + **date badge** (mono, bordered, right),
  **creator · medium** byline (mono, muted), then location and song rows with
  the existing inked icons.
- Footer: **comment bubble button** (Charlie's hand-drawn speech bubble,
  `assets/imgs/comment-bubble.png`) opening the existing `ArtComments` sheet
  in place — the slim search row lacks `comments_enabled`, so the full piece
  is fetched on tap (`get_members_visual_2d`) before opening — plus the
  `BookmarkButton` pinned right.
- Written-form pieces keep the paper-page body inside the same card frame,
  details included, no comment button (ArtComments is visual-2d only).
- Tapping the art itself navigates to the piece exactly as today.
- Gallery densities (2–4 columns) are unchanged: square tiles, no captions.
- People tab: pinch steps the same densities; cards keep their current look.

### Discovery

- First visit to the search grid shows a small hand-drawn "pinch to zoom"
  hint near the bottom; it fades after ~4 s.
- Never shown again after the user's first successful pinch (or after it has
  been shown once — flag `pinch_hint_seen` in SecureStore, which the web
  build satisfies via the localStorage shim).

### State

- `SearchTabs` keeps `columns: number` (1..4), now pinch-driven; grids derive
  `targetColumns = Math.min(columns, columnsFor(filtered.length))`.
- The initial-load spinner + column-snap behavior (added 2026-07-21) and the
  `windowSize`/`cachePolicy` scroll fixes are kept. On web, grid images set
  `transition={0}` — expo-image's cross-dissolve strands memory-cached images
  at opacity 0 after a column-swap remount.

## Out of scope

- Comments on written-form pieces (ArtComments is visual-2d only today).
- Any backend change — everything here is client-side.
- Richer social-feed chrome (profile pics, keyword chips) — revisit later.
