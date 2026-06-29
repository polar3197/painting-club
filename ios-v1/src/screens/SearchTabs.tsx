import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Pressable,
  TextInput,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtGallery from './ArtGallery';
import People from './People';
import { Colors } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF = SCREEN_WIDTH / 2;
// Inset of the sliding selection box inside each half.
const BOX_MARGIN = 14;

// Height of the bottom Tab.Navigator bar (see navigation/index.tsx). The search
// bar rests just above it, so the keyboard overlap into this screen is the
// keyboard height minus this.
const NAV_TAB_HEIGHT = 90;

// The toggle bar shrinks toward the smaller height while the keyboard is up so
// the icons "minimize" and hand their vertical space to the grid.
const TAB_BAR_HEIGHT = 84;
const TAB_BAR_HEIGHT_MIN = 44;
const ICON_SCALE_MIN = 0.55;

// The two halves of the search tab. `iconScale` mirrors the per-asset scaling
// the standalone banners used so the profiles mark reads at the same visual
// weight as the art mark.
const TABS = [
  {
    key: 'people',
    icon: require('../../assets/imgs/profiles.png'),
    iconScale: 1.375,
    placeholder: 'search people (by city, person, title, medium, ...)',
  },
  {
    key: 'art',
    icon: require('../../assets/imgs/art.png'),
    iconScale: 1,
    placeholder: 'search art (by city, person, title, medium, ...)',
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

  // Keyboard-driven animation. `kb` (0→1, native driver) handles transforms —
  // lifting the search bar above the keyboard and shrinking the icons. `kbH`
  // (0→1, JS driver) animates the toggle bar's layout height. Both are driven
  // by the keyboard's own duration so the minimize tracks the keyboard slide.
  const kb = useRef(new Animated.Value(0)).current;
  const kbH = useRef(new Animated.Value(0)).current;
  // How far to lift the search bar. Set imperatively before each show so the
  // transform stays in the animation system (no re-render, no first-frame jump).
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      const overlap = Math.max(0, e.endCoordinates.height - NAV_TAB_HEIGHT);
      lift.setValue(-overlap);
      const duration = e.duration || 250;
      Animated.parallel([
        Animated.timing(kb, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(kbH, { toValue: 1, duration, useNativeDriver: false }),
      ]).start();
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
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
  }, [kb, kbH, lift]);

  // Lift the bar by the keyboard overlap; shrink/recenter the icons.
  const barTranslateY = Animated.multiply(kb, lift);
  const iconScale = kb.interpolate({ inputRange: [0, 1], outputRange: [1, ICON_SCALE_MIN] });
  const iconTranslateY = kb.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const tabBarHeight = kbH.interpolate({
    inputRange: [0, 1],
    outputRange: [TAB_BAR_HEIGHT, TAB_BAR_HEIGHT_MIN],
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
            { transform: [{ translateX: boxTranslate }, { translateY: 8 }] },
          ]}
        />
        {TABS.map((t, i) => (
          <Pressable key={t.key} style={styles.tabItem} onPress={() => goTo(i)}>
            <Animated.Image
              source={t.icon}
              style={[
                styles.tabIcon,
                {
                  transform: [
                    { translateY: iconTranslateY },
                    { scale: Animated.multiply(iconScale, t.iconScale) },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </Pressable>
        ))}
      </Animated.View>

      <View
        style={styles.pager}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      >
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
            <People
              query={query}
              onResetFilters={resetFilters}
              onListScroll={dismissKeyboard}
            />
          </View>
          <View style={[styles.page, { height: pageHeight }]}>
            <ArtGallery
              query={query}
              onResetFilters={resetFilters}
              onListScroll={dismissKeyboard}
            />
          </View>
        </Animated.ScrollView>
      </View>

      {/* Search bar lives at the bottom (thumb zone) and lifts to sit on top of
          the keyboard while typing. */}
      <Animated.View style={[styles.searchBar, { transform: [{ translateY: barTranslateY }] }]}>
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
      </Animated.View>
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
  tabIcon: {
    width: 56,
    height: 56,
  },
  selectionBox: {
    position: 'absolute',
    top: 10,
    bottom: 10,
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
  },
  page: {
    width: SCREEN_WIDTH,
  },
});
