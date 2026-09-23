import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Home from './Home';
import UserProfile from './UserProfile';
import Events from './Events';
import ActivePrompt from './ActivePrompt';
import { Colors, Fonts } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// The four top-level "places", left→right. Home stays page 0 so the app still
// opens on the feed. Order is the swipe order and the indicator order.
const PAGES = [
  { key: 'feed', label: 'feed', Screen: Home },
  { key: 'profile', label: 'me', Screen: UserProfile },
  { key: 'events', label: 'events', Screen: Events },
  { key: 'prompt', label: 'prompt', Screen: ActivePrompt },
] as const;

const N = PAGES.length;
const SEG_W = SCREEN_WIDTH / N;

// Model A: horizontal paging. All four pages live on the left↔right axis;
// vertical is left entirely to each page's own scrolling, so the swipe gesture
// never fights in-page scroll. A thin indicator bar up top shows position and
// lets you jump by tapping. Detail screens (EventDetail, WeeklyPromptDetail,
// user profiles, …) are pushed on the *outer* SwipeStack, so they cover this
// pager rather than living inside it — that keeps the pager gesture live only
// at a page root and avoids the pager-vs-stack-back conflict.
export default function SwipeMain() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(0);
  // A horizontal pager doesn't hand a vertical size to its children, so each
  // page is sized explicitly from the pager's measured height.
  const [pageHeight, setPageHeight] = useState(0);

  const goTo = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  }, []);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  }, []);

  // Underline slides continuously with the pager across the four segments.
  const underlineX = scrollX.interpolate({
    inputRange: PAGES.map((_, i) => i * SCREEN_WIDTH),
    outputRange: PAGES.map((_, i) => i * SEG_W),
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View style={[styles.indicatorBar, { paddingTop: insets.top }]}>
        <View style={styles.labelRow}>
          {PAGES.map((p, i) => (
            <Pressable key={p.key} style={styles.labelItem} onPress={() => goTo(i)}>
              <Text style={[styles.label, i === active && styles.labelActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <Animated.View style={[styles.underline, { transform: [{ translateX: underlineX }] }]} />
      </View>

      <View style={styles.pager} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          onMomentumScrollEnd={onMomentumEnd}
        >
          {PAGES.map(({ key, Screen }) => (
            <View key={key} style={[styles.page, { height: pageHeight }]}>
              <Screen />
            </View>
          ))}
        </Animated.ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  indicatorBar: {
    backgroundColor: Colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.black,
  },
  labelRow: {
    flexDirection: 'row',
    height: 40,
  },
  labelItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textTertiary,
  },
  labelActive: {
    color: Colors.black,
    fontWeight: '700',
  },
  underline: {
    height: 2,
    width: SEG_W,
    backgroundColor: Colors.darkerGold,
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
});
