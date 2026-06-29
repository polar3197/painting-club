import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';

type Mode = '1:1' | 'groups';
type Conversation = { id: string; title: string };

const MODES: Mode[] = ['1:1', 'groups'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Toggle spans the content width (12px page padding each side), split in half —
// mirrors the art/people selector on the stuff page.
const TOGGLE_WIDTH = SCREEN_WIDTH - 24;
const HALF = TOGGLE_WIDTH / 2;
const BOX_MARGIN = 6;

// Messages inbox. A swipeable pager between the 1:1 and groups threads, with a
// gold box that slides with the swipe (like the stuff page). Conversations come
// from the messaging backend (not built yet), so the lists are empty for now.
export default function Messages() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  // Horizontal pagers don't hand a vertical size to flex children, so each page
  // is sized explicitly from the pager's measured height.
  const [pageHeight, setPageHeight] = useState(0);

  const goTo = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  }, []);

  // Gold box slides between the halves as the pager scrolls.
  const boxTranslate = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [BOX_MARGIN, HALF + BOX_MARGIN],
    extrapolate: 'clamp',
  });

  const conversationsFor = (_mode: Mode): Conversation[] => [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.pageTitle}>messages</Text>

      <View style={styles.toggle}>
        <Animated.View style={[styles.selectionBox, { transform: [{ translateX: boxTranslate }] }]} />
        {MODES.map((m, i) => (
          <Pressable key={m} style={styles.toggleItem} onPress={() => goTo(i)}>
            <Text style={styles.toggleText}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pager} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={scrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
        >
          {MODES.map((m) => {
            const conversations = conversationsFor(m);
            return (
              <View key={m} style={[styles.page, { height: pageHeight }]}>
                <ScrollView
                  style={styles.pageScroll}
                  contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 24 }]}
                >
                  {conversations.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>WIP coming soon</Text>
                    </View>
                  ) : (
                    conversations.map((c) => (
                      <Pressable key={c.id} style={styles.row}>
                        <Text style={styles.rowText}>{c.title}</Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
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
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  toggle: {
    flexDirection: 'row',
    width: TOGGLE_WIDTH,
    height: 46,
    alignSelf: 'center',
    backgroundColor: Colors.mainBg,
  },
  selectionBox: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    width: HALF - BOX_MARGIN * 2,
    backgroundColor: Colors.primaryGold,
    borderRadius: 12,
  },
  toggleItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 12,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  row: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  rowText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
  },
});
