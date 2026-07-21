# Pinch-to-zoom grid + feed mode (search tab)

**Date:** 2026-07-21
**Status:** approved

## Problem

The density slider under the search bar (`DensitySlider`, values 1–4) has three
problems: nobody discovers it (a bare track doesn't read as a control), the
intermediate 2/3-column stops go unused (people only want the extremes), and
the 1-per-row view undersells itself — square-cropped tiles with no context,
plus it's a plain column-count change rather than a real browsing mode.

## Decision

Replace the slider with a **pinch gesture** that toggles between exactly two
modes, and make the 1-per-row view a proper **feed**.

### Gesture

- Pinch anywhere on the art or people grid (react-native-gesture-handler
  `Pinch`, composed with `Gesture.Simultaneous` so list scroll still works).
- Spread fingers (scale > 1 at release) → **feed** (1 per row).
  Pinch together (scale < 1) → **gallery** (4-up target).
- During the gesture the grid scales slightly (~0.95–1.05 transform) for live
  feedback; on release it snaps to the implied mode using the existing
  dim-crossfade + FlatList remount machinery (`renderedColumns`).
- The count-based formula (`columnsFor`) still caps gallery columns for small
  result sets. Feed is always 1.
- `DensitySlider` component and its `sliderRow` are deleted; the search bar
  area shrinks accordingly.
- Web dev preview: `ctrl+wheel` (browser pinch encoding) toggles the same way.

### Feed card (art tab only)

- Art renders at **true aspect ratio**: `height = cardWidth / aspect_ratio`,
  falling back to square when `aspect_ratio` is null. Written-form pieces keep
  their existing paper-page card.
- Caption strip below the art:
  - **title** — serif (`Fonts.serif`)
  - **creator · medium** — mono, smaller, muted
  - **comment button** (right-aligned) — opens the existing `ArtComments`
    sheet in place. If the search result row lacks the piece fields the sheet
    needs (`comments_enabled`, etc.), fetch the piece on tap before opening.
- Tapping the art itself navigates to the piece exactly as today.
- Gallery mode is unchanged (square tiles, no captions).
- People tab: pinch toggles the same two modes; cards keep their current look.

### Discovery

- First visit to the search grid shows a small hand-drawn "pinch to zoom"
  hint near the bottom; it fades after ~4 s.
- Never shown again after the user's first successful pinch (or after it has
  been shown once — flag `pinch_hint_seen` in SecureStore, which the web
  build satisfies via the localStorage shim).

### State

- `SearchTabs`: `columns: number` state → `mode: 'gallery' | 'feed'`, passed
  to both grids. Grids derive `targetColumns` from
  `mode === 'feed' ? 1 : columnsFor(filtered.length)`.
- The initial-load spinner + column-snap behavior (added 2026-07-21) and the
  `windowSize`/`cachePolicy` scroll fixes are kept.

## Out of scope

- Comments on written-form pieces (ArtComments is visual-2d only today).
- Any backend change — everything here is client-side.
- Richer social-feed chrome (profile pics, keyword chips) — revisit later.
