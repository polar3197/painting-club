# Keyboard-lift + search-header handoff

**From:** the "streams/observability" Claude session (Charlie)
**To:** the session that owns keyboard-lift + search-header work in `ios-v1`
**Scope of your ownership (per coordination note):** `SearchTabs.tsx`, `AddArtDialog.tsx`, `ArtComments.tsx`, `EventDetail.tsx`

This doc exists because I made keyboard-lift edits in three of those files before we realized we were both working the same surfaces in the same shared working tree. Everything below is yours to keep, merge, or throw out. Nothing here is precious.

---

## 1. The library / API

**`react-native-reanimated`** — already a dependency (`~4.1.1`), already compiled into the native binary (used in `Home.tsx`, `ArtCarousel.tsx`, `ArtZoomIn.tsx`).

The specific API:

```ts
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

const keyboard = useAnimatedKeyboard();
// keyboard.height: SharedValue<number>  — live keyboard height from the bottom of the window
// keyboard.state:  SharedValue<KeyboardState>

const style = useAnimatedStyle(() => ({
  transform: [{ translateY: -keyboard.height.value }],   // or paddingBottom, etc.
}));

// apply to a Reanimated component:
<Reanimated.View style={[styles.whatever, style]} />
```

`keyboard.height.value` updates **every frame on the UI thread**, in lockstep with the OS keyboard animation.

### Why it's OTA-safe (no App Store submission)

`useAnimatedKeyboard` is a JS API of Reanimated. The native keyboard-tracking code has shipped inside Reanimated since v3, so it's already in the installed app. Using it is a pure-JS change → ships via `eas update`. No new pods, no `eas build`, no submission. On iOS it needs **no** native config. (Android would want `android:windowSoftInputMode=adjustResize`, but this app is iOS-first.)

---

## 2. Why the current lift lags

The hand-rolled pattern in these files is:

```ts
Keyboard.addListener('keyboardWillShow', (e) => {
  lift.setValue(-overlap);
  Animated.timing(kb, { toValue: 1, duration: e.duration, useNativeDriver: true }).start();
});
```

Two independent delays stack:

1. **Start latency** — the OS starts sliding the keyboard immediately, but the JS listener only *then* schedules the `Animated.timing`. That hand-off costs a frame or two, so the input starts moving after the keyboard. ("keyboard first, input a split second later.")
2. **Easing mismatch** — even matched on duration, `Animated.timing`'s default curve isn't the iOS keyboard's private curve, so the two diverge mid-slide and the input visibly chases/catches up.

Matching duration can't fix either: the input is *imitating* the keyboard instead of being *tied* to it. `useAnimatedKeyboard` ties it — the position is derived from the real keyboard frame, so there's no hand-off and no curve to mismatch.

> Note: the **resting** position (keyboard fully up) is identical before/after. The fix is only visible *during* the ~250ms slide. A still screenshot looks unchanged — watch the motion.

---

## 3. The three lift shapes (they are NOT the same)

| File | Current mechanism | Fix |
|---|---|---|
| `SearchTabs.tsx` | manual `translateY` on the bottom search bar | `translateY: -(keyboard.height - NAV_TAB_HEIGHT)` |
| `AddArtDialog.tsx` | `kbHeight` state → `modalRoot` `paddingBottom` (discrete re-render, jumps a frame behind) | animate `paddingBottom: keyboard.height` |
| `ArtComments.tsx` | `KeyboardAvoidingView behavior="padding"` (has its own iOS lag) | replace wrapper with a padded `Reanimated.View` |
| `EventDetail.tsx` | `kbHeight` state → sheet content padding (same discrete pattern; comment claims "rides keyboard 1:1" but it's still state-driven) | same as AddArtDialog — **I did NOT touch this file** |

### The critical gotcha (SearchTabs)

The search bar can go fully Reanimated because it has no other animated style. **But the toggle-bar collapse cannot naively be made JS/Reanimated-driven.** The gold selection box's transform combines `boxTranslate` (from the horizontal pager's `scrollX`, `useNativeDriver:true` — RN Animated, native) with the collapse-derived `boxScaleX`/`translateY`. React Native **crashes** if a single transform array mixes native-driven and JS-driven values. Making the collapse JS-driven crashed the app the instant search was tapped (shipped, then reverted). Keep the collapse on the **native** RN-Animated driver; only the bar *lift* moved to Reanimated. Don't cross the streams on the box.

---

## 4. Exactly what I already changed (to reconcile)

All three are additive and currently in the working tree + shipped in OTA group `60aab5f7-...` (runtime 1.0.4).

**`src/screens/SearchTabs.tsx`**
- Added `import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';`
- Added `const keyboard = useAnimatedKeyboard();` and
  `const searchBarStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, keyboard.height.value - NAV_TAB_HEIGHT) }] }));`
- Search bar element: `<Animated.View style={[styles.searchBar, {transform:[{translateY: barTranslateY}]}]}>` → `<Reanimated.View style={[styles.searchBar, searchBarStyle]}>`
- Removed the `lift` Animated.Value, `barTranslateY`, and the `lift.setValue(-overlap)` line. The `keyboardWillShow/Hide` listener still drives `kb`/`kbH` for the **collapse** (unchanged).

**`src/components/AddArtDialog.tsx`**
- Added the Reanimated import.
- Added `const keyboard = useAnimatedKeyboard();` and `const modalRootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));`
- `<View style={[styles.modalRoot, { paddingBottom: kbHeight }]}>` → `<Reanimated.View style={[styles.modalRoot, modalRootStyle]}>` (and closing tag).
- Kept the `kbHeight` state + listener — it still drives `panelMaxHeight` (the height cap; a discrete jump there is fine).

**`src/components/ArtComments.tsx`**
- Added the Reanimated import; **removed** `KeyboardAvoidingView` from the `react-native` import.
- Added `const keyboard = useAnimatedKeyboard();` and `const containerKbStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));`
- `<KeyboardAvoidingView style={styles.container} behavior=...>` → `<Reanimated.View style={[styles.container, containerKbStyle]}>` (and closing tag).
- Kept the `keyboardOpen` boolean + listener — it still shrinks the image section (`sectionHeight`), unrelated to the lift.

**`src/screens/EventDetail.tsx`** — untouched by me.

### Reconciliation notes / risks
- I typecheck-verified all three but **did not sim-test** them. The modal `paddingBottom` swaps animate a layout prop on a flex container containing a FlatList/ScrollView — that relayouts per frame during the slide; it *should* be smoother than KAV, but confirm on device. If it's janky, an alternative for the sheets is translating an inner wrapper instead of padding the flex container.
- If your work already converted these differently, just overwrite mine — no dependency on my version.

---

## 5. Search-header redesign spec (also handed to you)

Charlie asked for a redesign of the `SearchTabs` toggle bar. Decisions locked in with him:

- **Normal (expanded) view:** unchanged — keep the icon images **+** the text labels, and the sliding gold selection box.
- **Scrolling / searching (collapsed) view:** the bar **shrinks in height** and becomes **text-only** — the words **"art"** and **"people"**, no icons. Today's collapsed state instead shrinks the icons to a tiny orphaned pill and fades the labels *out* — that's the thing he dislikes (screenshot: a lone gold pill with a shrunk icon + lots of dead space). Invert it: fade the **icons** out, keep the **words**.
- **Selector:** keep the **sliding gold pill** that glides between the two halves.
- **Spacing:** tighten the gap beneath the bar (currently `TAB_PAGER_GAP = 20`, plus the collapsed bar's wasted internal space). The collapsed bar should be short and fully used by the centered word.

**Implementation caution:** because the collapse must stay on the **native** RN-Animated driver (see §3), drive the icon-fade / word-crossfade / word-scale off the existing native `collapse` value (opacity + transform are native-safe). Only the tab-bar **height** stays on the JS driver (`collapseH`, since layout height can't be native). Don't put a JS-driven prop on the same view as a native transform.

There's a **separate** open thread from Charlie: he found the collapse *itself* clunky (it's a threshold snap at 40px via `Animated.timing`, not a continuous track). The clean fix is to feed a **native** `scrollY` from the child `FlatList`s (convert them to `Animated.FlatList` + `Animated.event({useNativeDriver:true})`) and interpolate the collapse continuously, with only the JS-side height driven off a throttled `scrollY.addListener`. That keeps everything native-consistent. This can fold into the redesign.

---

## 6. TL;DR
- Use `useAnimatedKeyboard()` from reanimated (already installed) for keyboard-synced motion. OTA-safe, iOS needs no native config.
- Three different lift shapes — translate (SearchTabs), padding-anchor (AddArtDialog/EventDetail), KAV-replace (ArtComments).
- **Never** mix native + JS driven values in one transform — that crashed SearchTabs. Keep the toggle-bar collapse native.
- My edits to SearchTabs/AddArtDialog/ArtComments are in the tree + shipped; keep/merge/overwrite freely. EventDetail is all yours.
- Redesign: expanded = icons+text; collapsed = short text-only bar ("art"/"people") with the sliding gold pill; tighter gap.
