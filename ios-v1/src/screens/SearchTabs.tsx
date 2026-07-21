import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  Keyboard,
  LayoutAnimation,
  Platform,
  UIManager,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtGallery from './ArtGallery';
import People from './People';
import { Colors, Fonts } from '../constants/theme';
import type { GridMode } from '../constants/grid';

// iOS animates layout changes out of the box; Android needs this opt-in. Lets
// the grid crossfade when the column count changes instead of hard-flashing.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF = SCREEN_WIDTH / 2;
// Inset of the sliding selection box inside each half. Small, so the pill fills
// most of its half rather than hugging the word.
const BOX_MARGIN = 8;

// Height of the bottom Tab.Navigator bar (see navigation/index.tsx). The search
// bar rests just above it, so the keyboard overlap into this screen is the
// keyboard height minus this.
const NAV_TAB_HEIGHT = 90;

// The toggle bar shrinks toward the smaller height while the keyboard is up so
// the icons "minimize" and hand their vertical space to the grid.
const TAB_BAR_HEIGHT = 84;
const TAB_BAR_HEIGHT_MIN = 42;

// Persistent gap between the toggle bar and the top of the scrolling grid, so
// content never scrolls flush against the bottom of the icons.
const TAB_PAGER_GAP = 10;
// Scroll distance over which the toggle bar continuously collapses as the grid
// scrolls (0 at the top → fully collapsed after this many px). A continuous
// track rather than a threshold snap so the minimize doesn't feel abrupt.
const SCROLL_COLLAPSE_RANGE = 72;

// The two halves of the search tab. `iconScale` mirrors the per-asset scaling
// the standalone banners used so the profiles mark reads at the same visual
// weight as the art mark.
// Art first (leftmost, opens here): its grid loads 512px thumbnails and paints
// fast, which gives the People page — full-res pics until the profile-thumb route
// deploys — a moment to load before you swipe to it.
const TABS = [
  {
    key: 'art',
    icon: require('../../assets/imgs/art.png'),
    iconScale: 1,
    placeholder: 'search art (by city, person, title, medium, ...)',
  },
  {
    key: 'people',
    icon: require('../../assets/imgs/profiles.png'),
    iconScale: 1.375,
    placeholder: 'search people (by city, person, title, medium, ...)',
  },
];

export default function SearchTabs() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(0);
  // Horizontal pagers don't hand a vertical size to flex children, so each
  // page is sized explicitly from the pager's measured height.
  const [pageHeight, setPageHeight] = useState(0);

  // A single shared query lives here so the bar stays fixed while only the
  // lists swipe — typing live-filters whichever half is showing, and only the
  // placeholder changes when you swipe across.
  const [query, setQuery] = useState('');
  // Grid mode: gallery (4-up target, count-formula capped) vs feed (1 per
  // row with captions). Toggled by the pinch gesture; replaces the old
  // density slider.
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

  // Keyboard-driven animation. `kb` (native driver) shrinks the toggle-bar
  // icons and `kbH` (JS driver) animates its layout height as the keyboard
  // opens; both run over the keyboard's own duration so the minimize tracks the
  // slide. The search bar's *lift* is handled separately by useAnimatedKeyboard
  // below.
  const kb = useRef(new Animated.Value(0)).current;
  const kbH = useRef(new Animated.Value(0)).current;
  // Keyboard-controller tracks the real keyboard frame natively (its native
  // module drives this shared value every frame), so the search bar rises welded
  // to the keyboard with no lag — unlike reanimated's useAnimatedKeyboard, which
  // didn't track on this New-Architecture build. NOTE: its `height` is NEGATIVE
  // when the keyboard is open (0 → -keyboardHeight). Lift only by the overlap
  // into this screen — keyboard height minus the bottom tab bar it already
  // covers — so the bar sits exactly atop the keyboard.
  const { height: kbHeightSV } = useReanimatedKeyboardAnimation();
  const searchBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(0, kbHeightSV.value + NAV_TAB_HEIGHT) }],
  }));

  // Scroll-driven collapse mirrors the keyboard one: `sc` (native driver) drives
  // the icon/word crossfade + selection box, `scH` (JS driver) the toggle bar's
  // layout height. Both are set continuously from the grid's scroll offset (no
  // threshold snap), and summed with the keyboard values so either minimizes it.
  const sc = useRef(new Animated.Value(0)).current;
  const scH = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardUp(true);
      const duration = e.duration || 250;
      Animated.parallel([
        Animated.timing(kb, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(kbH, { toValue: 1, duration, useNativeDriver: false }),
      ]).start();
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
      setKeyboardUp(false);
      const duration = e.duration || 250;
      Animated.parallel([
        Animated.timing(kb, { toValue: 0, duration, useNativeDriver: true }),
        Animated.timing(kbH, { toValue: 0, duration, useNativeDriver: false }),
      ]).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kb, kbH]);

  // Either the keyboard or a scrolled grid minimizes the bar. Summing the two
  // 0→1 drivers and clamping per-use means both at once still reads as fully
  // collapsed rather than doubling up.
  const collapse = Animated.add(kb, sc);
  const collapseH = Animated.add(kbH, scH);
  // Collapse crossfade: the expanded content (icon + word) fades out while the
  // word-only collapsed content fades in. Ranges are offset so the two never sit
  // at full opacity together (no double-word ghosting mid-collapse). Both are
  // opacity-only and native-driven — no layout/transform mixing on one node.
  const expandedOpacity = collapse.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const collapsedOpacity = collapse.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const tabBarHeight = collapseH.interpolate({
    inputRange: [0, 1],
    outputRange: [TAB_BAR_HEIGHT, TAB_BAR_HEIGHT_MIN],
    extrapolate: 'clamp',
  });

  const goTo = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  }, []);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  }, []);

  // Pull-to-refresh on either list clears the shared search.
  const resetFilters = useCallback(() => {
    setQuery('');
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // Continuously collapse the toggle bar as the grid scrolls: map the scroll
  // offset to a 0→1 fraction and set both drivers directly — no threshold snap,
  // no hysteresis. `sc` feeds the native transforms; `scH` the JS layout height.
  const onListVerticalScroll = useCallback(
    (offsetY: number) => {
      const frac = Math.max(0, Math.min(1, offsetY / SCROLL_COLLAPSE_RANGE));
      sc.setValue(frac);
      scH.setValue(frac);
    },
    [sc, scH],
  );

  // Filled gold box slides between the two halves as the pager scrolls.
  const boxTranslate = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [BOX_MARGIN, HALF + BOX_MARGIN],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.tabBar, { height: tabBarHeight }]}>
        <Animated.View
          style={[
            styles.selectionBox,
            { transform: [{ translateX: boxTranslate }] },
          ]}
        />
        {TABS.map((t, i) => (
          <Pressable key={t.key} style={styles.tabItem} onPress={() => goTo(i)}>
            {/* Expanded: icon above the word (the normal-view look). */}
            <Animated.View
              style={[styles.tabLayer, { opacity: expandedOpacity }]}
              pointerEvents="none"
            >
              <Animated.Image
                source={t.icon}
                style={[styles.tabIcon, { transform: [{ scale: t.iconScale }] }]}
                resizeMode="contain"
              />
              <Animated.Text style={styles.tabWord}>{t.key}</Animated.Text>
            </Animated.View>
            {/* Collapsed: just the word, centered in the short bar. */}
            <Animated.View
              style={[styles.tabLayer, { opacity: collapsedOpacity }]}
              pointerEvents="none"
            >
              <Animated.Text style={styles.tabWordCollapsed}>{t.key}</Animated.Text>
            </Animated.View>
          </Pressable>
        ))}
      </Animated.View>

      <View
        style={styles.pager}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      >
        <GestureDetector gesture={pinch}>
        <Reanimated.View style={[{ flex: 1 }, pinchStyle]}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          onMomentumScrollEnd={onMomentumEnd}
        >
          <View style={[styles.page, { height: pageHeight }]}>
            <ArtGallery
              query={query}
              onResetFilters={resetFilters}
              onListScroll={dismissKeyboard}
              onVerticalScroll={onListVerticalScroll}
              mode={mode}
            />
          </View>
          <View style={[styles.page, { height: pageHeight }]}>
            <People
              query={query}
              onResetFilters={resetFilters}
              onListScroll={dismissKeyboard}
              onVerticalScroll={onListVerticalScroll}
              mode={mode}
            />
          </View>
        </Animated.ScrollView>
        </Reanimated.View>
        </GestureDetector>
      </View>

      {/* Search bar lives at the bottom (thumb zone) and rises to sit on top of
          the keyboard while typing — welded to the keyboard frame via
          react-native-keyboard-controller so it tracks the slide with no lag. */}
      <Reanimated.View style={[styles.searchBar, searchBarStyle]}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={TABS[active].placeholder}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.mainBg,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Both content states fill the tab item and center themselves, so each reads
  // centered regardless of the (animating) bar height. They crossfade.
  tabLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    width: 46,
    height: 46,
  },
  tabWord: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.black,
    marginTop: 1,
  },
  tabWordCollapsed: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    color: Colors.black,
  },
  selectionBox: {
    position: 'absolute',
    // Small vertical inset so the pill sits snug in the short collapsed bar with
    // little padding above/below the word.
    top: 5,
    bottom: 5,
    left: 0,
    width: HALF - BOX_MARGIN * 2,
    backgroundColor: Colors.primaryGold,
    borderRadius: 12,
  },
  searchBar: {
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#000',
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#000',
    height: 36,
    paddingHorizontal: 10,
    fontSize: 14,
    backgroundColor: Colors.white,
  },
  pager: {
    flex: 1,
    // Keep a fixed gap below the icons; the grid's own top padding moves here so
    // the space persists instead of scrolling away under the bar.
    marginTop: TAB_PAGER_GAP,
  },
  page: {
    width: SCREEN_WIDTH,
  },
});
