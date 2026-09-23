import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  AppState,
  Pressable,
  Text,
} from 'react-native';
import Home, { HomeTitleBall } from './Home';
import UserProfile from './UserProfile';
import { ArtWall } from './WallScreen';
import { PeopleScreen } from './People';
import Events from './Events';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HubPagerLock } from '../context/HubPagerLock';
import { useAuth } from '../context/AuthContext';
import { readCached } from '../utils/jsonCache';
import { DEFAULT_PROFILE_COLORS, decodeStoredColors } from '../constants/profileColors';
import type { Profile } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// Home's background green — the seam bands use it so "that way is Home" reads
// at a glance.
export const HOME_GREEN = 'rgb(216, 237, 138)';

// Seam band thickness: fits the label (mono 12, stacked letters on the sides).
const BAND = 18;

type Side = 'top' | 'bottom' | 'left' | 'right';

// Model B: 4-directional hub, centered on Home.
//   up = people, down = events, left = profile, right = art wall.
// Plain nested paging ScrollViews (no new native deps, so it ships over OTA):
//   outer VERTICAL pager:  [ people | middle-row | events ]
//   middle-row = inner HORIZONTAL pager: [ profile | home | art wall ]
// The vertical pager runs in the middle column (people scroll sideways and the
// events list wins its own touches, so up/down is free to return Home); the
// horizontal pager only from Home — profile and the art wall scroll up/down,
// so they return by intent (below).
//
// Each neighbor has ONE label band (its name, in Home green) that rides the
// seam between Home and that panel: on Home it sits at Home's edge, it travels
// with the seam during the swipe, and on arrival it's the band on the panel's
// Home-facing edge. Driven by the pagers' scroll offsets on the native thread.
export default function SwipeHub() {
  const insets = useSafeAreaInsets();
  const vRef = useRef<ScrollView>(null);
  const hRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ w: SCREEN_W, h: 0 });
  // 0 profile, 1 home, 2 art wall
  const [hPage, setHPage] = useState(1);
  // 0 people, 1 middle row, 2 events
  const [vPage, setVPage] = useState(1);
  // Wall columns lock the pagers while touched so their scroll can't bubble.
  const [columnLock, setColumnLock] = useState(false);

  const scrollX = useRef(new Animated.Value(SCREEN_W)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  // Last measured size, as a ref so an unchanged re-layout can be ignored
  // without re-rendering. setSize alone couldn't do this: it built a new object
  // every call, so an identical layout still re-rendered and re-centred.
  const sizeRef = useRef({ w: SCREEN_W, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Returning from the background, a call banner, a rotation and a
    // safe-area change all re-fire onLayout, usually at the SAME size. Doing
    // the work again was actively harmful: the scrollTo below re-centres both
    // pagers, but hPage/vPage are only ever updated by onMomentumScrollEnd and
    // onScrollEndDrag — user-gesture events that a programmatic scrollTo does
    // not fire. So the view snapped to Home while the state still said e.g.
    // "art wall", and scrollEnabled (derived from that state) went false on
    // BOTH pagers: sitting on Home, unable to swipe anywhere, with the panel's
    // own back-gesture off screen. Ignoring a no-op layout also means you keep
    // the panel you were on when you come back.
    if (sizeRef.current.w === width && sizeRef.current.h === height) return;
    sizeRef.current = { w: width, h: height };
    setSize({ w: width, h: height });
    scrollX.setValue(width);
    scrollY.setValue(height);
    // Re-centring IS a move, so the page state has to move with it or it
    // desynchronises exactly as described above.
    setHPage(1);
    setVPage(1);
    requestAnimationFrame(() => {
      vRef.current?.scrollTo({ y: height, animated: false });
      hRef.current?.scrollTo({ x: width, animated: false });
    });
  }, [scrollX, scrollY]);

  // A column lock is set on touch-start and cleared on touch-end/cancel. If the
  // app is backgrounded with a finger down on a wall column, that release never
  // arrives and the lock outlives the touch — disabling both pagers for good.
  // Nothing else ever clears it, so drop it whenever the app stops being active.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setColumnLock(false);
    });
    return () => sub.remove();
  }, []);

  const { w, h } = size;
  const cell = { width: w, height: h };

  const onHScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (w > 0) setHPage(Math.round(e.nativeEvent.contentOffset.x / w));
  };
  const onVScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (h > 0) setVPage(Math.round(e.nativeEvent.contentOffset.y / h));
  };
  // A release with velocity is still gliding to its page — settle on the
  // momentum end instead, or the other pager gets (un)locked mid-glide.
  const onHDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) onHScroll(e);
  };
  const onVDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) onVScroll(e);
  };

  const onVScrollEvent = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );
  const onHScrollEvent = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
    [scrollX],
  );

  // The pages are built once — re-rendering the whole profile, wall columns,
  // people list and calendar on every settled swipe made the hub stutter.
  const pages = useMemo(
    () => ({
      artWall: <ArtWall />,
      profile: <UserProfile />,
      home: <Home />,
      people: <PeopleScreen embedded rows={3} />,
      events: <Events embedded />,
    }),
    [],
  );

  const goTo = useCallback((side: Side | 'home') => {
    const y = side === 'top' ? 0 : side === 'bottom' ? 2 * h : h;
    const x = side === 'left' ? 0 : side === 'right' ? 2 * w : w;
    vRef.current?.scrollTo({ y, animated: true });
    hRef.current?.scrollTo({ x, animated: true });
    setVPage(Math.round(y / h));
    setHPage(Math.round(x / w));
  }, [w, h]);

  // Where each band sits (viewport coords) as a function of the scroll offsets.
  // Vertical-seam bands (art wall / events) ride the seam on y and the Home
  // column on x; horizontal-seam bands (profile / art wall) the reverse.
  const bands = useMemo(() => {
    if (!h) return null;
    const colX = scrollX.interpolate({ inputRange: [0, w, 2 * w], outputRange: [w, 0, -w] });
    const rowY = scrollY.interpolate({ inputRange: [0, h, 2 * h], outputRange: [h, 0, -h] });
    return {
      // Home cell's offset on screen (the title ball rides it)
      homeX: colX,
      homeY: rowY,
      // Each band has TWO resting positions that mean different things: on a
      // neighbour it covers that panel's Home-facing inset, and on Home it sits
      // at Home's own edge as an affordance. Interpolating straight between
      // them gave a slope of -(size-BAND)/size, while the seam it is covering
      // moves at exactly -1 — so the band lagged the seam by up to BAND (18pt),
      // worst right where the neighbour's inset first slides into view. That
      // lag was the strip of empty space that opened and closed mid-swipe.
      //
      // The extra stop in each range fixes it: the band PARKS at its Home
      // resting place until the seam actually reaches it, then tracks 1:1 the
      // rest of the way. Both resting positions are unchanged; only the travel
      // between them is corrected.

      // seam people|home: Home's top edge (below the notch) -> the people pane's bottom edge
      top: {
        x: colX,
        y: scrollY.interpolate({
          inputRange: [0, h - BAND - insets.top, h, 2 * h],
          outputRange: [h - BAND, insets.top, insets.top, insets.top - h],
        }),
      },
      // seam home|events: Home's bottom edge -> just under the notch on events
      bottom: {
        x: colX,
        y: scrollY.interpolate({
          inputRange: [0, h, 2 * h - BAND - insets.top, 2 * h],
          outputRange: [2 * h, h - BAND, insets.top, insets.top],
        }),
      },
      // seam profile|home: Home's left edge -> the profile's right edge
      left: {
        x: scrollX.interpolate({
          inputRange: [0, w - BAND, w, 2 * w],
          outputRange: [w - BAND, 0, 0, -w],
        }),
        y: rowY,
      },
      // seam home|art wall: Home's right edge -> the art wall's left edge
      right: {
        x: scrollX.interpolate({
          inputRange: [0, w, w + BAND, 2 * w],
          outputRange: [2 * w, w - BAND, w - BAND, 0],
        }),
        y: rowY,
      },
    };
  }, [w, h, insets.top, scrollX, scrollY]);

  // ---- swiping back to Home, by intent -------------------------------------
  // Profile and the art wall scroll up/down, so the horizontal pager is off
  // there and the way back is a pan that only claims a swipe once it's
  // clearly heading toward Home (activeOffset on that axis before failOffset
  // on the other). It drives the pager so the page follows the finger, then
  // settles Home or springs back.
  const dragReturn = useCallback(
    (side: Side, delta: number) => {
      if (side === 'left') hRef.current?.scrollTo({ x: Math.min(w, Math.max(0, -delta)), animated: false });
      else if (side === 'right') hRef.current?.scrollTo({ x: Math.max(w, Math.min(2 * w, 2 * w - delta)), animated: false });
      else if (side === 'top') vRef.current?.scrollTo({ y: Math.min(h, Math.max(0, -delta)), animated: false });
    },
    [w, h],
  );
  const endReturn = useCallback(
    (side: Side, delta: number, velocity: number) => {
      // toward Home: left panel/art wall move negative, right panel positive
      const toward = side === 'right' ? delta : -delta;
      const speed = side === 'right' ? velocity : -velocity;
      const size = side === 'top' ? h : w;
      if (toward > size * 0.25 || speed > 600) goTo('home');
      else goTo(side);
    },
    [w, h, goTo],
  );
  const returnPan = useCallback(
    (side: Side) => {
      const horizontal = side === 'left' || side === 'right';
      const pan = Gesture.Pan().runOnJS(true);
      const g = horizontal
        ? pan.activeOffsetX(side === 'left' ? [-12, 9999] : [-9999, 12]).failOffsetY([-12, 12])
        : pan.activeOffsetY([-10, 9999]).failOffsetX([-20, 20]);
      return g
        .onUpdate((e) => dragReturn(side, horizontal ? e.translationX : e.translationY))
        .onEnd((e) =>
          endReturn(side, horizontal ? e.translationX : e.translationY, horizontal ? e.velocityX : e.velocityY),
        );
    },
    [dragReturn, endReturn],
  );
  const profileBack = useMemo(() => returnPan('left'), [returnPan]);
  const wallBack = useMemo(() => returnPan('right'), [returnPan]);

  // The profile panel's inset beside its band is the member's own page
  // background (last-known colors), so it narrows in their color, not white.
  const { currentUser } = useAuth();
  const profileBg = useMemo(() => {
    const cached = currentUser ? readCached<Profile>(`profile:${currentUser.toLowerCase()}`) : undefined;
    return { ...DEFAULT_PROFILE_COLORS, ...decodeStoredColors(cached?.profile_colors) }.bg;
    // re-read when a swipe settles, so a color change shows up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, hPage]);

  const here: Side | 'home' =
    vPage === 0 ? 'top' : vPage === 2 ? 'bottom' : hPage === 0 ? 'left' : hPage === 2 ? 'right' : 'home';
  // A band opens its panel from Home, and returns Home from its panel.
  const tapBand = (side: Side) => goTo(here === side ? 'home' : side);

  return (
    <HubPagerLock.Provider value={setColumnLock}>
      <View style={styles.fill} onLayout={onLayout}>
        {h > 0 && (
          <Animated.ScrollView
            ref={vRef as any}
            pagingEnabled
            directionalLockEnabled
            showsVerticalScrollIndicator={false}
            contentOffset={{ x: 0, y: h }}
            scrollEventThrottle={16}
            onScroll={onVScrollEvent}
            onMomentumScrollEnd={onVScroll}
            onScrollEndDrag={onVDragEnd}
            scrollEnabled={hPage === 1 && !columnLock}
            scrollsToTop={false}
          >
            {/* up: people — its cards scroll sideways, so up/down stays the
                hub's and a plain swipe up returns Home. Each panel is laid out
                beside its band (inset by BAND on the Home-facing side). */}
            <View style={[cell, { paddingBottom: BAND, backgroundColor: Colors.mainBg }]}>{pages.people}</View>

            {/* middle row: profile ← home → art wall */}
            <View style={cell}>
              <Animated.ScrollView
                ref={hRef as any}
                horizontal
                pagingEnabled
                directionalLockEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: w, y: 0 }}
                scrollEventThrottle={16}
                onScroll={onHScrollEvent}
                onMomentumScrollEnd={onHScroll}
                onScrollEndDrag={onHDragEnd}
                scrollEnabled={vPage === 1 && hPage === 1 && !columnLock}
              >
                <GestureDetector gesture={profileBack}>
                  <View style={[cell, { paddingRight: BAND, backgroundColor: profileBg }]}>{pages.profile}</View>
                </GestureDetector>
                <View style={cell}>{pages.home}</View>
                <GestureDetector gesture={wallBack}>
                  <View style={[cell, { paddingLeft: BAND, backgroundColor: Colors.mainBg }]}>{pages.artWall}</View>
                </GestureDetector>
              </Animated.ScrollView>
            </View>

            {/* down: events — its notch area in Home green, the band just below */}
            <View style={[cell, { paddingTop: BAND }]}>
              {pages.events}
              <View pointerEvents="none" style={[styles.notchFill, { height: insets.top }]} />
            </View>
          </Animated.ScrollView>
        )}

        {bands && (
          <>
            {/* Layers over the pagers: the bands' green, then Home's title
                ball (riding the Home cell, full frame — it bounces off the
                phone's edges and passes over the green), then the bands'
                labels on top of the ball. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {(['top', 'bottom', 'left', 'right'] as Side[]).map((side) => (
                <SeamFill key={side} side={side} w={w} h={h} pos={bands[side]} />
              ))}
            </View>
            <Animated.View
              pointerEvents="box-none"
              style={[styles.ballCell, { width: w, height: h, transform: [{ translateX: bands.homeX }, { translateY: bands.homeY }] }]}
            >
              <HomeTitleBall />
            </Animated.View>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <SeamLabel side="top" label="people" w={w} h={h} pos={bands.top} onPress={() => tapBand('top')} />
              <SeamLabel side="bottom" label="events" w={w} h={h} pos={bands.bottom} onPress={() => tapBand('bottom')} />
              <SeamLabel side="left" label="profile" w={w} h={h} pos={bands.left} onPress={() => tapBand('left')} />
              <SeamLabel side="right" label="art wall" w={w} h={h} pos={bands.right} onPress={() => tapBand('right')} />
            </View>
          </>
        )}
      </View>
    </HubPagerLock.Provider>
  );
}

type BandPos = { x: Animated.AnimatedInterpolation<number>; y: Animated.AnimatedInterpolation<number> };

function bandBox(side: Side, w: number, h: number) {
  return side === 'left' || side === 'right' ? { width: BAND, height: h } : { width: w, height: BAND };
}

// A seam band's Home-green fill (below the title ball).
function SeamFill({ side, w, h, pos }: { side: Side; w: number; h: number; pos: BandPos }) {
  return (
    <Animated.View
      style={[
        styles.band,
        styles.bandFill,
        bandBox(side, w, h),
        { transform: [{ translateX: pos.x }, { translateY: pos.y }] },
      ]}
    />
  );
}

// A seam band's label + tap target (above the title ball), riding with its fill.
function SeamLabel({ side, label, w, h, pos, onPress }: { side: Side; label: string; w: number; h: number; pos: BandPos; onPress: () => void }) {
  const vertical = side === 'left' || side === 'right';
  return (
    <Animated.View
      style={[styles.band, bandBox(side, w, h), { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
    >
      <Pressable style={styles.bandPress} onPress={onPress} hitSlop={6}>
        {vertical ? (
          <View>
            {label.split('').map((ch, i) => (
              <Text key={i} style={styles.vLetter}>{ch}</Text>
            ))}
          </View>
        ) : (
          <Text style={styles.hLabel}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  notchFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: HOME_GREEN,
  },
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  bandFill: {
    backgroundColor: HOME_GREEN,
  },
  ballCell: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  bandPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    color: '#000',
  },
  vLetter: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 13,
    textAlign: 'center',
    color: '#000',
  },
});
