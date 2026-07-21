# Pinch-to-Zoom Grid + Feed Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the search tab's density slider with a pinch gesture that toggles gallery (4-up) / feed (1-per-row) modes, where feed shows art at true aspect ratio with a title/creator/medium caption and a comments button.

**Architecture:** `SearchTabs` owns a `mode: 'gallery' | 'feed'` state (replacing `columns: number`) and a `Pinch` gesture (react-native-gesture-handler, already used in `Home.tsx`) wrapping the pager; both grids derive their column target from mode + the existing `columnsFor` count formula (deduped into a shared module). Feed rendering and the `ArtComments` hookup live entirely in `ArtGallery`. A one-time hint overlay persists its "seen" flag via `expo-secure-store` (web-safe via the existing metro shim).

**Tech Stack:** React Native 0.81 / Expo 54, react-native-gesture-handler `Gesture.Pinch`, react-native-reanimated for live scale feedback, expo-secure-store, existing `ArtComments` modal.

## Global Constraints

- `ios-v1` has **no JS test infrastructure** (no jest). Each task verifies with `cd ios-v1 && npx tsc --noEmit` plus a live check in the running web preview (`.claude/launch.json` → `ios-v1-web`, http://localhost:8081). On web, pinch = ctrl+wheel.
- Working branch: `stream-b-events-obs`. Commit after every task.
- Feed captions: title in `Fonts.serif`, byline in `Fonts.mono`, comment button matches the app's bordered-button idiom (`borderWidth: 1, borderColor: '#000'`, serif label, `Colors.secondary` background).
- Do NOT touch `WeeklyPromptDetail.tsx` (it has its own `columnsFor` for submissions and no slider).
- Keep the 2026-07-21 fixes intact: initial-load spinner + column snap, `windowSize={numColumns === 1 ? 41 : 21}`, `cachePolicy="memory-disk"`.

---

### Task 1: Shared grid-mode module + mode plumbing (slider removed)

**Files:**
- Create: `ios-v1/src/constants/grid.ts`
- Modify: `ios-v1/src/screens/SearchTabs.tsx` (state ~line 92, handler ~line 98, slider JSX ~line 295, `sliderRow` style ~line 369, `DensitySlider` import line 22)
- Modify: `ios-v1/src/screens/ArtGallery.tsx` (Props ~line 147, `columnsFor` ~line 137, `targetColumns` ~line 200)
- Modify: `ios-v1/src/screens/People.tsx` (Props ~line 56, `columnsFor` ~line 20, `targetColumns` ~line 93)
- Delete: `ios-v1/src/components/DensitySlider.tsx`

**Interfaces:**
- Produces: `type GridMode = 'gallery' | 'feed'` and `columnsFor(n: number): number` exported from `src/constants/grid.ts`; both grids take `mode: GridMode` instead of `columns: number`; `SearchTabs` has `handleModeChange(m: GridMode): void` (Task 2 calls it from the gesture).

- [ ] **Step 1: Create the shared module**

```ts
// ios-v1/src/constants/grid.ts
// Grid display mode for the search tab: gallery is the dense multi-column
// grid, feed is one full-width piece per row with caption + comments.
export type GridMode = 'gallery' | 'feed';

// Cards per row grow ~square with the result count, capped at 4 — a big
// gallery stays 4-up, and a narrowed search slims to fewer, larger cards.
export function columnsFor(n: number): number {
  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));
}
```

- [ ] **Step 2: Rewire `SearchTabs`**

Replace the `columns` state + handler (~lines 89–103):

```ts
import type { GridMode } from '../constants/grid';
// ...
  // Grid mode: gallery (4-up target, count-formula capped) vs feed (1 per
  // row). Toggled by the pinch gesture (Task 2); replaces the old slider.
  const [mode, setMode] = useState<GridMode>('gallery');
  const [keyboardUp, setKeyboardUp] = useState(false);

  // Wrap the mode change in a LayoutAnimation so the grid crossfades to the
  // new column count instead of hard-remounting (the flash).
  const handleModeChange = useCallback((m: GridMode) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setMode(m);
  }, []);
```

Pass `mode={mode}` to `<ArtGallery>` and `<People>` (delete `columns={columns}` at ~lines 264 and 273). Delete: the `DensitySlider` import (line 22), the `{!keyboardUp && (<View style={styles.sliderRow}>…)}` block (~lines 293–299 — the whole conditional; `keyboardUp` is still used elsewhere, keep the state), and the `sliderRow` style (~line 369).

- [ ] **Step 3: Rewire both grids**

In `ArtGallery.tsx` and `People.tsx` identically: delete the local `columnsFor`, import from the shared module, change the prop, derive the target.

```ts
import { GridMode, columnsFor } from '../constants/grid';

interface Props {
  // ...existing fields unchanged...
  // Grid display mode from SearchTabs (pinch-toggled): feed forces 1 per
  // row; gallery uses the per-count formula.
  mode: GridMode;
}

// signature: ({ query, onResetFilters, onListScroll, onVerticalScroll, mode }: Props)

const targetColumns = mode === 'feed' ? 1 : columnsFor(filtered.length);
```

- [ ] **Step 4: Delete `ios-v1/src/components/DensitySlider.tsx`** (`git rm`).

- [ ] **Step 5: Verify**

Run: `cd ios-v1 && npx tsc --noEmit` → no errors. Web preview: grid renders 4-up, no slider under the search bar, search box sits closer to the bottom.

- [ ] **Step 6: Commit** — `git commit -m "Search grids: mode (gallery/feed) replaces density slider; shared columnsFor"`

---

### Task 2: Pinch gesture (+ web ctrl+wheel) toggles mode

**Files:**
- Modify: `ios-v1/src/screens/SearchTabs.tsx` (wrap the pager `<Animated.ScrollView>` ~line 240; imports)

**Interfaces:**
- Consumes: `handleModeChange(m: GridMode)` from Task 1.
- Produces: `commitPinch(m: GridMode)` — also the hook point where Task 4 marks the hint seen.

- [ ] **Step 1: Add the gesture**

Follow the `Gesture`/`GestureDetector` pattern from `Home.tsx:280-347`. Imports: `import { Gesture, GestureDetector } from 'react-native-gesture-handler';` and extend the existing reanimated import with `useSharedValue, withTiming, runOnJS`.

```ts
  // Pinch-to-zoom: spread = feed (bigger), pinch = gallery (denser). The grid
  // scales slightly under the fingers for feedback, then snaps back while the
  // LayoutAnimation crossfade swaps the column count.
  const pinchScale = useSharedValue(1);
  const commitPinch = useCallback((m: GridMode) => {
    handleModeChange(m);
  }, [handleModeChange]);
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      // Damp the raw scale so the grid nudges rather than balloons.
      pinchScale.value = 1 + (e.scale - 1) * 0.08;
    })
    .onEnd((e) => {
      pinchScale.value = withTiming(1, { duration: 160 });
      if (e.scale > 1.05) runOnJS(commitPinch)('feed');
      else if (e.scale < 0.95) runOnJS(commitPinch)('gallery');
    });
  const pinchStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchScale.value }],
  }));
```

Wrap the pager (the `<Animated.ScrollView …>` holding both pages) —

```tsx
<GestureDetector gesture={pinch}>
  <Reanimated.View style={[{ flex: 1 }, pinchStyle]}>
    {/* existing Animated.ScrollView pager, unchanged */}
  </Reanimated.View>
</GestureDetector>
```

- [ ] **Step 2: Web fallback (ctrl+wheel = trackpad pinch)**

```ts
  // Browsers encode trackpad pinch as ctrl+wheel. Dev-preview convenience;
  // native never runs this.
  const wheelAcc = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      if (wheelAcc.current < -60) { wheelAcc.current = 0; commitPinch('feed'); }
      else if (wheelAcc.current > 60) { wheelAcc.current = 0; commitPinch('gallery'); }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [commitPinch]);
```

(`Platform` is already imported in SearchTabs; add it if not.)

- [ ] **Step 3: Verify**

`npx tsc --noEmit` → clean. Web preview: ctrl+scroll-up over the grid → feed (1 col via crossfade); ctrl+scroll-down → gallery. Normal scroll/swipe still work.

- [ ] **Step 4: Commit** — `git commit -m "Pinch (native) / ctrl+wheel (web) toggles gallery-feed grid mode"`

---

### Task 3: Feed card — true aspect ratio + caption strip

**Files:**
- Modify: `ios-v1/src/screens/ArtGallery.tsx` (`VisualCard` ~line 92, `WrittenCard` ~line 110, `renderCard` ~line 232, styles)

**Interfaces:**
- Consumes: `mode` prop (Task 1). `ArtResult.aspect_ratio: number | null` (exists in `src/api/types.ts`).
- Produces: `VisualCard`/`WrittenCard` accept `feed?: boolean` and `onComment?: () => void`; a shared `FeedCaption` sub-component Task 4 passes `onComment` into.

- [ ] **Step 1: Add `FeedCaption` and thread `feed` through the cards**

```tsx
// Below the art in feed mode: title / creator · medium, plus the comments
// button (visual pieces only — ArtComments is visual-2d only).
function FeedCaption({ item, onComment }: { item: ArtResult; onComment?: () => void }) {
  return (
    <View style={styles.feedCaption}>
      <View style={styles.feedCaptionText}>
        {!!item.title && (
          <Text style={styles.feedTitle} numberOfLines={1}>{item.title}</Text>
        )}
        <Text style={styles.feedByline} numberOfLines={1}>
          {item.creator_username} · {item.medium}
        </Text>
      </View>
      {onComment && (
        <Pressable style={styles.feedCommentBtn} onPress={onComment} hitSlop={8}>
          <Text style={styles.feedCommentBtnText}>comments</Text>
        </Pressable>
      )}
    </View>
  );
}
```

`VisualCard` gains `feed` + `onComment`; in feed mode the image height honors the piece's ratio (thumbnails preserve aspect — `ArtComments` measures them for exactly that reason):

```tsx
function VisualCard({ item, cardWidth, onPress, feed, onComment }: {
  item: ArtResult; cardWidth: number; onPress: () => void;
  feed?: boolean; onComment?: () => void;
}) {
  const height = feed ? cardWidth / (item.aspect_ratio || 1) : cardWidth;
  return (
    <View style={feed ? styles.feedItem : null}>
      <Pressable
        style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        <Image
          source={thumbSource(item.id, item.file_path)}
          transition={200}
          cachePolicy="memory-disk"
          style={[styles.cardImage, { height }]}
          contentFit="cover"
        />
      </Pressable>
      {feed && <FeedCaption item={item} onComment={onComment} />}
    </View>
  );
}
```

`WrittenCard`: same `feed?: boolean` prop; the paper-page body is unchanged (stays `height: cardWidth` — no ratio for text), but wrap in `styles.feedItem` and append `<FeedCaption item={item} />` (no `onComment`) when `feed` is true.

- [ ] **Step 2: Render cards in feed mode from `renderCard`**

```tsx
  const feed = numColumns === 1;
  const renderCard = ({ item }: { item: ArtResult }) => {
    const onPress = () => navigation.navigate('UserProfile', {
      username: item.creator_username, artId: item.id, medium: item.medium,
    });
    const card = item.art_type === 'written_form'
      ? <WrittenCard item={item} cardWidth={cardWidth} onPress={onPress} feed={feed} />
      : <VisualCard item={item} cardWidth={cardWidth} onPress={onPress} feed={feed} />;
    return card;
  };
```

Delete the old `numColumns === 1 ? <View style={styles.soloItem}>…` wrapper and the `soloItem` style; `feedItem`'s `marginBottom` takes over its spacing role.

- [ ] **Step 3: Styles**

```ts
  feedItem: {
    marginBottom: 28,
  },
  feedCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  feedCaptionText: {
    flex: 1,
  },
  feedTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
  feedByline: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  feedCommentBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedCommentBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
```

(Confirm `FontSizes` is imported in ArtGallery — add to the existing `constants/theme` import if missing. Remove the now-unused `soloItem` style.)

- [ ] **Step 4: Verify**

`npx tsc --noEmit` → clean. Web preview → ctrl+wheel to feed: art shows non-square heights matching each piece, caption strip shows title + `creator · medium` + a bordered "comments" button; written pieces keep the paper card with caption but no button; gallery mode looks exactly as before.

- [ ] **Step 5: Commit** — `git commit -m "Feed mode: true-ratio art + title/creator/medium caption strip"`

---

### Task 4: Comments from the feed

**Files:**
- Modify: `ios-v1/src/screens/ArtGallery.tsx` (component body; imports: `get_members_visual_2d`, `Visual2DOut` from `../api`, `ArtComments` from `../components/ArtComments`, `appAlert` from `../components/AppAlert`)

**Interfaces:**
- Consumes: `FeedCaption`'s `onComment` (Task 3); `get_members_visual_2d(username: string, medium: string): Promise<Visual2DOut[]>`; `ArtComments({ piece: Visual2DOut, onClose })`; `appAlert(title, message?)`.

- [ ] **Step 1: Fetch-on-tap + modal state**

Search results (`ArtResult`) lack `comments_enabled` and other `Visual2DOut` fields, so resolve the full piece on tap via the existing per-member endpoint:

```ts
  // Comments open straight from the feed. ArtResult is a slim search row, so
  // fetch the full piece (comments_enabled etc.) on demand.
  const [commentPiece, setCommentPiece] = useState<Visual2DOut | null>(null);
  const openComments = useCallback(async (item: ArtResult) => {
    try {
      const pieces = await get_members_visual_2d(item.creator_username, item.medium);
      const piece = pieces.find((p) => p.id === item.id);
      if (!piece) throw new Error('piece not found');
      if (!piece.comments_enabled) {
        appAlert('comments are off', 'the artist turned comments off for this piece');
        return;
      }
      setCommentPiece(piece);
    } catch {
      appAlert('could not open comments', 'try again');
    }
  }, []);
```

Wire it in `renderCard`: `<VisualCard … feed={feed} onComment={feed ? () => openComments(item) : undefined} />`. Render the sheet next to the refresh spinner overlay at the bottom of the component's JSX:

```tsx
      {commentPiece && (
        <ArtComments piece={commentPiece} onClose={() => setCommentPiece(null)} />
      )}
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` → clean. Web preview, feed mode: tap "comments" on a visual piece → the comments sheet opens with the art at top; close works; posting a comment works (live backend — write a real comment on your own piece, then delete it in the sheet).

- [ ] **Step 3: Commit** — `git commit -m "Feed: comments button opens ArtComments via on-demand piece fetch"`

---

### Task 5: One-time pinch hint

**Files:**
- Create: `ios-v1/src/components/PinchHint.tsx`
- Modify: `ios-v1/src/screens/SearchTabs.tsx` (render hint over the pager; mark seen in `commitPinch`)

**Interfaces:**
- Produces: `<PinchHint />` (self-managing) and `markPinchHintSeen(): void` — Task 2's `commitPinch` calls the latter.

- [ ] **Step 1: The component**

```tsx
// ios-v1/src/components/PinchHint.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const KEY = 'pinch_hint_seen';

export function markPinchHintSeen() {
  SecureStore.setItemAsync(KEY, '1').catch(() => {});
}

// One-time "pinch to zoom" whisper over the search grid: fades in on the
// first-ever visit, sits for ~4s, fades out, never returns (flag persisted;
// a real pinch also retires it immediately via markPinchHintSeen).
export default function PinchHint() {
  const [show, setShow] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((seen) => {
        if (!alive || seen) return;
        setShow(true);
        markPinchHintSeen();
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(4000),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start(() => alive && setShow(false));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [opacity]);

  if (!show) return null;
  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={styles.bubble}>
        <Text style={styles.glyph}>)( ‹—› )(</Text>
        <Text style={styles.text}>pinch to zoom</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 20,
  },
  bubble: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  glyph: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
  },
  text: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Mount + retire on real pinch**

In `SearchTabs`: `import PinchHint, { markPinchHintSeen } from '../components/PinchHint';` — render `<PinchHint />` as the last child inside the pager wrapper `<Reanimated.View>` from Task 2, and extend `commitPinch`:

```ts
  const commitPinch = useCallback((m: GridMode) => {
    markPinchHintSeen();
    handleModeChange(m);
  }, [handleModeChange]);
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` → clean. Web preview: `localStorage.removeItem('pinch_hint_seen')` in the console, reload, open the search tab → hint fades in over the grid, out after ~4s; reload again → no hint.

- [ ] **Step 4: Commit** — `git commit -m "One-time pinch-to-zoom hint over the search grid"`

---

### Task 6: End-to-end pass

- [ ] **Step 1:** `cd ios-v1 && npx tsc --noEmit` → clean.
- [ ] **Step 2:** Web preview full sweep: gallery↔feed via ctrl+wheel on both art and people tabs; feed captions + comments open/post/delete; small search result set still auto-relaxes gallery columns; keyboard open/close unaffected by slider removal; initial-load spinner unchanged.
- [ ] **Step 3:** `grep -rn "DensitySlider\|columns={columns}\|sliderRow" ios-v1/src` → no hits.
- [ ] **Step 4:** Commit anything outstanding; done.
