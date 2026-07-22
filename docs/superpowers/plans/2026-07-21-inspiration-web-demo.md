# Inspiration Web — Phase 0 FE Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, mock-backed inspiration web demo: web icon on art cards opens a pannable/zoomable hand-drawn graph centered on that piece, with in-web linking (connect/create) for the viewer's own pieces.

**Architecture:** `src/api/inspiration.ts` is the permanent interface; `src/api/inspirationMock.ts` implements it in memory, seeded from real loaded art + a bundled Klimt external node (Phase 1 swaps the mock for fetches — no UI change). `WebScreen` computes a static `d3-force` layout and renders nodes as positioned `expo-image` thumbs with a rotated-view thread layer, inside a pan+pinch reanimated canvas. Linking UI (focused-node "+", long-press + haptic → two-pane connect/create dialog) mutates the mock so the demo feels persistent per session.

**Tech Stack:** d3-force (pure JS, new dep), react-native-gesture-handler + reanimated (existing patterns), expo-image, expo-haptics, expo-image-picker (existing deps).

## Global Constraints

- FE only — NO backend/src/api-server changes (Pi unreachable). All data through `src/api/inspiration.ts`.
- No test infra in ios-v1: verify each task with `cd ios-v1 && npx tsc --noEmit` (7 pre-existing Home.tsx errors are the baseline) + the running web preview (http://localhost:8081; ctrl+wheel = pinch).
- Branch `stream-b-events-obs`; commit per task; icon assets are black-line-on-transparency PNGs in `ios-v1/assets/imgs/`.
- Pure-JS deps only (OTA constraint) — d3-force qualifies; nothing native.

---

### Task 1: Web icon asset

**Files:**
- Create: `ios-v1/assets/imgs/web.png` (via scratchpad PIL script, venv already at scratchpad/venv)

**Interfaces:**
- Produces: `require('../../assets/imgs/web.png')` used by Task 3's entry buttons.

- [ ] **Step 1:** Write + run a PIL trace of Charlie's web drawing (five outward spokes from a center, joined by four inward-curving arcs between spoke tips — a spiderweb star). 512×512 transparent canvas, ~14px near-black strokes, wobble welcome.

```python
# scratchpad/draw_web.py
from PIL import Image, ImageDraw, ImageFilter
import math
S = 512; img = Image.new('RGBA', (S, S), (0,0,0,0)); d = ImageDraw.Draw(img)
BLACK = (10,10,10,255); W = 13; cx, cy = S/2, S/2 + 10
tips = []
for k in range(5):
    a = -math.pi/2 + k * 2*math.pi/5
    tips.append((cx + 235*math.cos(a), cy + 235*math.sin(a)))
    d.line([(cx, cy), tips[-1]], fill=BLACK, width=W)
for k in range(5):
    p1, p2 = tips[k], tips[(k+1) % 5]
    mx, my = (p1[0]+p2[0])/2, (p1[1]+p2[1])/2
    # bow the connecting strand inward toward the center
    bx, by = mx + (cx-mx)*0.45, my + (cy-my)*0.45
    pts = []
    for t in [i/24 for i in range(25)]:
        x = (1-t)**2*p1[0] + 2*(1-t)*t*bx + t**2*p2[0]
        y = (1-t)**2*p1[1] + 2*(1-t)*t*by + t**2*p2[1]
        pts.append((x, y))
    d.line(pts, fill=BLACK, width=W, joint='curve')
img = img.filter(ImageFilter.MaxFilter(3))
img.save('/Users/ccooper/painting-club/ios-v1/assets/imgs/web.png'); print('saved')
```

- [ ] **Step 2:** Read the PNG back visually; adjust curve bow/stroke until it matches the drawing's feel.
- [ ] **Step 3:** Commit — `git commit -m "Web icon asset (traced from Charlie's drawing)"`

---

### Task 2: Data layer — interface + mock

**Files:**
- Create: `ios-v1/src/api/inspiration.ts`
- Create: `ios-v1/src/api/inspirationMock.ts`
- Modify: `ios-v1/package.json` (add `d3-force`, `@types/d3-force`)

**Interfaces:**
- Consumes: `search_art`, `ArtResult`, `thumbSource` from `../api`.
- Produces (Phase-1-stable):

```ts
export type WebNodeArt = {
  kind: 'art'; id: string; title: string; creator: string; medium: string;
  file_path: string; aspect_ratio: number | null; mine: boolean;
};
export type WebNodeExternal = {
  kind: 'external'; id: string; artist: string; title: string | null;
  image: number | { uri: string };   // bundled require OR picked/uploaded uri
};
export type WebNode = WebNodeArt | WebNodeExternal;
export type WebEdge = { id: string; from: string; to: string }; // from = inspired piece, to = its inspiration
export type WebGraph = { focusId: string; nodes: WebNode[]; edges: WebEdge[] };

export function setInspirationViewer(username: string | null): void;
export function getWeb(artId: string, depth?: number): Promise<WebGraph>;
export function addInspiration(fromArtId: string, toNodeId: string): Promise<WebEdge>;
export function removeInspiration(edgeId: string): Promise<void>;
export function searchLinkTargets(q: string): Promise<WebNode[]>;
export function createExternalArt(input: { artist: string; title?: string; imageUri: string }): Promise<WebNodeExternal>;
```

- [ ] **Step 1:** `cd ios-v1 && npm install d3-force && npm install -D @types/d3-force`
- [ ] **Step 2:** `inspiration.ts` — the types above plus thin delegating functions with a header comment: "Phase 0: delegates to inspirationMock. Phase 1: replace bodies with fetches to /art/{id}/web, /inspirations, /external-art; types unchanged."
- [ ] **Step 3:** `inspirationMock.ts` — in-memory store:
  - Lazy `ensureSeeded()`: `search_art('')` → first ~14 visual pieces become `WebNodeArt`s (`mine` = creator === viewer); one bundled external node `{ kind:'external', id:'ext-klimt', artist:'Gustav Klimt', title:'Litzlberg am Attersee', image: require('../../assets/imgs/klimpt.png') }`; deterministic seed edges: chain pieces 1→0, 2→0, 3→1 within the list, plus pieces at index 0 and 4 → the Klimt. Store `nodes: Map<string, WebNode>`, `edges: WebEdge[]` (module-level, session-persistent).
  - `getWeb(artId, depth=2)`: BFS over edges (both directions) from `artId` up to `depth` hops; return the touched nodes + the edges among them; `focusId = artId`. If artId unknown (e.g. entered from a card not in the seed), fetch nothing extra — add it as a node from the caller-registered info (see `registerArt` below) with no edges.
  - `registerArt(node: WebNodeArt)`: upsert — the entry points call this so ANY card can open its web even if the seed missed it. (Add to inspiration.ts exports too.)
  - `addInspiration`: validate `from` is `mine`; push edge `{id: 'e'+Date-free counter, from, to}` (module counter, no Date.now — fine in app code but keep a simple incrementing int).
  - `removeInspiration`: filter by id.
  - `searchLinkTargets(q)`: Fuse over all nodes (keys: title, creator/artist, medium), empty q → first 12.
  - `createExternalArt`: id `'ext-'+counter`, image `{ uri: imageUri }`, upsert, return node.
- [ ] **Step 4:** `npx tsc --noEmit` → baseline 7 only.
- [ ] **Step 5:** Commit — `git commit -m "Inspiration web data layer: stable interface + in-memory mock"`

---

### Task 3: Route + entry icons

**Files:**
- Modify: `ios-v1/src/navigation/types.ts` (add `Web: { artId: string }` to `SearchStackParamList`, `BookmarkStackParamList`, `AuthStackParamList`)
- Modify: `ios-v1/src/navigation/index.tsx` (register `WebScreen` in the stacks that contain `UserProfile` — follow how UserProfile is registered)
- Create: `ios-v1/src/screens/WebScreen.tsx` (stub: black-on-cream centered text "web: {artId}")
- Modify: `ios-v1/src/screens/ArtGallery.tsx` (web icon button in `FeedArtCard` footer, left of the bookmark, same 32px bordered-square style as `feedCommentBtn`; navigates + `registerArt`)
- Modify: `ios-v1/src/screens/UserProfile.tsx` (web icon button in the art element footer next to `BookmarkButton` `artBookmarkBtn`, same treatment; profile pieces are `Visual2DOut` — map to `WebNodeArt` with `creator: profile username`, `mine: is_owner`)

**Interfaces:**
- Consumes: `registerArt`, `WebNodeArt` (Task 2); `web.png` (Task 1).
- Produces: `WebScreen` route named `'Web'` taking `{ artId: string }`; entry helper pattern:

```tsx
// in FeedArtCard (ArtGallery.tsx) — footer, before BookmarkButton:
<Pressable
  style={styles.feedWebBtn}   // clone of feedCommentBtn dimensions
  hitSlop={8}
  onPress={() => {
    registerArt({ kind: 'art', id: item.id, title: item.title, creator: item.creator_username,
      medium: item.medium, file_path: item.file_path, aspect_ratio: item.aspect_ratio,
      mine: item.creator_username === currentUser });
    navigation.navigate('Web', { artId: item.id });
  }}
>
  <Image source={require('../../assets/imgs/web.png')} style={styles.feedWebIcon} contentFit="contain" />
</Pressable>
```

(`currentUser` from `useAuth()` — already imported in ArtGallery; thread it into FeedArtCard as a prop or read in renderCard.)

- [ ] **Step 1:** types.ts + navigator registration (find the stack screens with `grep -n "UserProfile" src/navigation/index.tsx` and mirror).
- [ ] **Step 2:** WebScreen stub + entry buttons in both cards (styles: `feedWebBtn` identical to `feedCommentBtn`; icon 22×22; UserProfile equivalent `artWebBtn` next to the bookmark, `size` matching its 32).
- [ ] **Step 3:** Verify: web preview → feed → tap web icon → stub screen shows the artId. Profile → art element → same.
- [ ] **Step 4:** `npx tsc --noEmit` baseline; commit — `git commit -m "Web route + hand-drawn web entry icons on feed and profile art"`

---

### Task 4: WebScreen canvas — layout, threads, pan/zoom, focus

**Files:**
- Rewrite: `ios-v1/src/screens/WebScreen.tsx`

**Interfaces:**
- Consumes: `getWeb`, `setInspirationViewer`, `WebGraph`, `WebNode`, `WebEdge` (Task 2); `thumbSource` for art nodes.
- Produces: `WebCanvas` internals; `focusNode(id)` re-centers (Task 5 hangs linking off the focused node). Node positions in a `Map<string, {x,y}>` from d3-force.

- [ ] **Step 1:** Layout: on `getWeb(artId)` resolve, run static d3-force:

```ts
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
type SimNode = { id: string; x?: number; y?: number; fx?: number | null; fy?: number | null };
function layoutGraph(g: WebGraph): Map<string, { x: number; y: number }> {
  const nodes: SimNode[] = g.nodes.map((n) => ({ id: n.id }));
  const focus = nodes.find((n) => n.id === g.focusId);
  if (focus) { focus.fx = 0; focus.fy = 0; }
  const links = g.edges.map((e) => ({ source: e.from, target: e.to }));
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d: any) => d.id).distance(150))
    .force('charge', forceManyBody().strength(-420))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(70))
    .stop();
  for (let i = 0; i < 250; i++) sim.tick();
  return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
```

- [ ] **Step 2:** Canvas: full-screen `View` (bg `Colors.mainBg`); a content `Reanimated.View` whose style is `translateX/translateY/scale` shared values driven by `Gesture.Simultaneous(Gesture.Pan(), Gesture.Pinch())` (pan updates translate from `translationX/Y` + start refs; pinch scales 0.4–2.5 about center — plain center scale is fine here). Web fallback: ctrl+wheel adjusts scale (same listener pattern as SearchTabs but scoped to this screen's root via ref, no stopPropagation needed — no competing listener).
- [ ] **Step 3:** Threads: absolutely positioned within the content view (which is centered by rendering everything at `pos + CANVAS_HALF`, CANVAS_HALF = 2000 with the content view 4000×4000 and initial translate centering focus). Per edge:

```tsx
function Thread({ a, b }: { a: {x:number;y:number}; b: {x:number;y:number} }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  const ang = Math.atan2(dy, dx);
  return (
    <View pointerEvents="none" style={{
      position: 'absolute', width: len, height: 2, backgroundColor: '#222',
      left: a.x + CANVAS_HALF, top: a.y + CANVAS_HALF,
      transform: [{ rotate: `${ang}rad` }],
      transformOrigin: 'left center', opacity: 0.75,
    }}>
      {/* arrowhead: points at the inspired piece (the `from` node = a) */}
      <View style={{ position: 'absolute', left: len * 0.42, top: -4,
        width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderRightWidth: 9,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#222',
        transform: [{ rotate: '180deg' }] }} />
    </View>
  );
}
```

(`transformOrigin` works on RN 0.81 + RNW. Pass `a` = position of `edge.from`, `b` = `edge.to`.)

- [ ] **Step 4:** Nodes: per node a positioned `Pressable` (center = pos + CANVAS_HALF, size by role: focus 132, direct neighbor 92, hop-2 64 — compute hop via BFS from focusId over the returned edges). Art nodes: `expo-image` with `thumbSource(n.id, n.file_path)`, border 2, bg `Colors.artCardBg`; external nodes: `n.image` source, plus a tiny mono artist label under the frame. `onPress` → `focusNode(n.id)`: `getWeb(n.id)` → new layout → reset translate to center (animate translate with `withTiming`).
- [ ] **Step 5:** Focus caption: fixed panel at screen bottom (above safe area): title (serif), `creator · medium` or `artist` (mono muted). Back button (top-left, bordered square "←") pops navigation.
- [ ] **Step 6:** `setInspirationViewer(currentUser)` in a mount effect (`useAuth`).
- [ ] **Step 7:** Verify in web preview: enter from a feed card → web renders with threads + Klimt node; drag pans, ctrl+wheel zooms, tapping a neighbor re-centers on it. `npx tsc --noEmit` baseline.
- [ ] **Step 8:** Commit — `git commit -m "WebScreen: d3-force layout, ink threads, pan/zoom canvas, tap-to-refocus"`

---

### Task 5: In-web linking — add button, long-press, two-pane dialog, delete

**Files:**
- Create: `ios-v1/src/components/ConnectCreateDialog.tsx`
- Modify: `ios-v1/src/screens/WebScreen.tsx`

**Interfaces:**
- Consumes: `searchLinkTargets`, `createExternalArt`, `addInspiration`, `removeInspiration` (Task 2); `appAlert`; `TextInput` from `../components/AppTextInput`; `* as Haptics from 'expo-haptics'`; `* as ImagePicker from 'expo-image-picker'`.
- Produces: `<ConnectCreateDialog fromArt={WebNodeArt} onLinked={(edge) => void} onClose={() => void} />`.

- [ ] **Step 1:** Dialog — `Modal transparent animationType="fade"`, dim backdrop (tap closes), centered card (~86% width) in the app's bordered style. Header: two toggle tabs `connect` / `create` (serif, active tab `Colors.primaryGold`).
  - **connect pane:** `TextInput` (auto-focus) + `FlatList` of `searchLinkTargets(q)` results (thumb 44px, title, creator/artist mono muted); tapping a result → `addInspiration(fromArt.id, target.id)` → `onLinked(edge)`; errors → `appAlert('could not link', 'try again')`. Filter out `fromArt.id` itself and already-linked targets (pass existing target ids in as a prop `linkedIds: Set<string>`).
  - **create pane:** artist `TextInput` (required), title `TextInput` (optional), image picker button (`ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })`, thumbnail preview once picked), submit button disabled until artist + image present → `createExternalArt` → `addInspiration` → `onLinked`.
- [ ] **Step 2:** WebScreen wiring: when the focused node `kind === 'art' && mine`, the caption panel shows a bordered `+ inspiration` button opening the dialog. Long-press (500ms) on any OWN art node: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})` then open the dialog with that node as `fromArt` (Pressable `onLongPress`).
- [ ] **Step 3:** `onLinked`: refetch `getWeb(focusId)` and re-layout (new node threads in immediately).
- [ ] **Step 4:** Delete: in the caption panel for an own focused piece, list its outgoing threads as chips (`inspired by: <title> ×`); × → `removeInspiration(edge.id)` → refetch/re-layout.
- [ ] **Step 5:** Verify in web preview end-to-end: focus own piece → `+ inspiration` → connect pane links an existing piece (thread appears); create pane with a picked image makes a new external node + thread; × removes; long-press path opens the dialog too (web: long mouse-press works via RNW). `npx tsc --noEmit` baseline.
- [ ] **Step 6:** Commit — `git commit -m "In-web linking: connect/create dialog, long-press + haptic, thread delete"`

---

### Task 6: Demo pass

- [ ] **Step 1:** Full web-preview sweep: feed → web icon → explore 2 hops → refocus on neighbor → link + create + delete → back → re-enter (session persistence holds). Profile entry point too.
- [ ] **Step 2:** `npx tsc --noEmit` (baseline 7) and `grep -rn "TODO\|FIXME" ios-v1/src/screens/WebScreen.tsx ios-v1/src/components/ConnectCreateDialog.tsx ios-v1/src/api/inspiration*.ts` → no hits.
- [ ] **Step 3:** Final commit of any stragglers; report with screenshots.
