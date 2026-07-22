# Inspiration Web

**Date:** 2026-07-21
**Status:** approved (FE demo phase first — no backend access until Charlie
is back on the Pi's network)

## What it is

Members tie their art to the pieces that inspired it — club art or outside
art (famous or otherwise) — and explore those ties as a hand-drawn web:
a pannable, zoomable canvas of artwork nodes joined by ink threads.

## Decisions (from brainstorming)

- **Piece-centered web.** Every art card gets a hand-drawn web icon (traced
  from Charlie's drawing → `assets/imgs/web.png`) that opens the web
  centered on that piece. No global constellation in v1; the web expands
  outward hop by hop.
- **Linking lives inside the web.** Tap a node to focus it (re-center,
  caption, its threads). On your OWN focused node: a small "add
  inspiration +" button opens the picker; or long-press your node —
  haptic tick — and a small center-screen **two-pane toggle** appears:
  **connect** (search) | **create** (external art form).
- **Owner-only edges.** You declare what inspired *your* pieces, and only
  you can delete those threads. "This piece inspired…" (inbound) renders
  automatically from the reverse direction; it is never stored separately.
- **External art is a shared club catalog, search-first.** The connect
  pane searches club art AND existing external entries together; creating
  a new external piece (artist name required, image required, title
  optional) adds it to the catalog for everyone to link against. One
  *Starry Night* node with many threads, not five duplicates.

## Canvas technology

RN views + reanimated + `d3-force` (pure JS layout) — nodes are
`expo-image` thumbs in absolutely positioned views, edges are a thin
rotated-view ink layer, pan/zoom via the gesture patterns already shipped
in the feed. **Pure JS ⇒ ships OTA.** (react-native-skia rejected for v1:
new native module = no OTA; WebView+d3 rejected: non-native feel.)
Club-scale neighborhoods (10–50 visible nodes) are trivial for this stack.

## Phase 0 — FE demo (buildable now, no backend)

Everything the user touches, driven by a mock data layer:

- `src/api/inspiration.ts` exposes the REAL intended interface
  (`getWeb(artId, depth)`, `addInspiration`, `removeInspiration`,
  `searchLinkTargets(q)`, `createExternalArt`) backed by
  `src/api/inspirationMock.ts` — an in-memory graph seeded from the
  member's actual loaded art (real thumbs) plus a few fabricated external
  nodes (e.g. a Van Gogh, a Hokusai with bundled placeholder images).
  Mutations update the in-memory graph so the demo feels persistent
  within a session.
- Web icon on the feed card footer + profile art element → `WebScreen`.
- `WebScreen`: d3-force layout of the 2-hop neighborhood, focused node
  large with title/creator caption, pan + pinch-zoom canvas, tap node to
  re-focus (lazy-loads that node's neighborhood from the data layer),
  arrowheads inspiration → inspired.
- Linking: focused-own-node "+" button and long-press (haptic) both open
  the two-pane connect/create toggle. Delete affordance on your own
  threads from the focused caption.
- Hint/polish kept minimal; the demo's job is to prove the feel.

## Phase 1 — real backend (when back on the Pi's network)

- Migration 018: `external_art` (id, artist_name, title nullable,
  file_path, added_by, created_at) and `inspiration` (id, from_art_id,
  exactly one of to_art_id/to_external_id, created_by, created_at,
  UNIQUE(from, to)). Server enforces from_art_id ownership.
- Endpoints: `GET /art/{id}/web?depth=2` (subgraph: nodes + edges,
  hop-tagged), `POST /inspirations`, `DELETE /inspirations/{id}`,
  `GET /external-art?q=`, `POST /external-art` (multipart, same static
  pipeline as art uploads).
- Swap `inspirationMock` for real fetches behind the unchanged
  `inspiration.ts` interface. No UI rework.

## Phase 2 — polish (later)

Clustering for 20+-thread nodes, level-of-detail (thumbs fade to dots when
zoomed far out), possible birds-eye "whole club" entry.

## Out of scope

- Suggesting edges on others' pieces, wiki-editing, approval flows.
- External-art-to-external-art edges (external nodes are targets only).
- Written-form pieces as web entry points (they can still BE inspirations
  and appear as nodes; v1 entry icon is on visual pieces everywhere, and
  written cards may add it later).
- Copyright review of uploaded famous art — club-internal, artist-credited
  citations; revisit only if the club opens up.
