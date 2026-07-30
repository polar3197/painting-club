import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  list_my_bookmarks,
  thumbSource,
  imageSource,
  BookmarkedArtOut,
} from '../api';
import { useWrittenFormText, extFromPath, isTextExt } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useBookmarks } from '../context/BookmarkContext';
import BookmarkButton from '../components/BookmarkButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { BookmarkStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<BookmarkStackParamList, 'Bookmarks'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LIST_PAD = 20;
const COLUMN_GAP = 10;
const NUM_COLUMNS = 2;
const CARD_WIDTH = (SCREEN_WIDTH - LIST_PAD * 2 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const SNIPPET_LINES = 8;

// Bottom medium slider: the gold pill sits BOX_INSET px inside the active segment.
const BOX_INSET = 4;

function snippetOf(text: string | null): string {
  if (!text) return '';
  return text.split(/\r?\n/).slice(0, SNIPPET_LINES).join('\n');
}

function countLabel(artType: string, n: number): string {
  if (artType === 'audio') return `${n} track${n === 1 ? '' : 's'}`;
  return `${n} piece${n === 1 ? '' : 's'}`;
}

// One saved entry: a standalone piece, or a collection (2+ saved pieces sharing
// a series). Collections only form once the backend returns series fields; until
// then every piece arrives series-less and renders on its own.
type Entry =
  | { kind: 'piece'; item: BookmarkedArtOut }
  | {
      kind: 'collection';
      seriesId: string;
      seriesName: string;
      artType: string;
      medium: string;
      pieces: BookmarkedArtOut[];
    };

function buildEntries(items: BookmarkedArtOut[]): Entry[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.series_id) counts.set(it.series_id, (counts.get(it.series_id) ?? 0) + 1);
  }
  const emitted = new Set<string>();
  const entries: Entry[] = [];
  for (const it of items) {
    const sid = it.series_id;
    if (sid && (counts.get(sid) ?? 0) >= 2) {
      if (emitted.has(sid)) continue;
      emitted.add(sid);
      const pieces = items.filter((x) => x.series_id === sid);
      entries.push({
        kind: 'collection',
        seriesId: sid,
        seriesName: it.series_name || 'collection',
        artType: it.art_type,
        medium: it.medium,
        pieces,
      });
    } else {
      entries.push({ kind: 'piece', item: it });
    }
  }
  return entries;
}

// --- Tiles -------------------------------------------------------------------

function VisualTile({ item }: { item: BookmarkedArtOut }) {
  return (
    <Image
      source={thumbSource(item.art_id, item.file_path)}
      transition={200}
      style={[styles.tile, styles.tileImage]}
      contentFit="cover"
    />
  );
}

function WrittenTile({ item }: { item: BookmarkedArtOut }) {
  const isText = isTextExt(extFromPath(item.file_path ?? ''));
  const text = useWrittenFormText(item.file_path ?? '');
  const snippet = snippetOf(text);
  return (
    <View style={[styles.tile, styles.tilePage]}>
      {item.cover_image_path ? (
        <Image
          source={imageSource(item.cover_image_path)}
          style={styles.tilePageCover}
          contentFit="cover"
        />
      ) : isText && !!snippet ? (
        <Text style={styles.tilePageSnippet} numberOfLines={SNIPPET_LINES}>
          {snippet}
        </Text>
      ) : null}
    </View>
  );
}

function AudioTile({ item }: { item: BookmarkedArtOut }) {
  return (
    <View style={[styles.tile, styles.tilePage, styles.tileAudio]}>
      <Text style={styles.tileAudioLabel} numberOfLines={1}>{item.medium}</Text>
    </View>
  );
}

function pieceTile(item: BookmarkedArtOut) {
  if (item.art_type === 'written_form') return <WrittenTile item={item} />;
  if (item.art_type === 'audio') return <AudioTile item={item} />;
  return <VisualTile item={item} />;
}

function PieceCard({ item, onPress }: { item: BookmarkedArtOut; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View>
        {pieceTile(item)}
        <BookmarkButton artId={item.art_id} size={26} style={styles.tileBookmark} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.cardCreator} numberOfLines={1}>@{item.creator_username}</Text>
    </Pressable>
  );
}

function CollectionCard({ entry, onPress }: { entry: Extract<Entry, { kind: 'collection' }>; onPress: () => void }) {
  const cover = entry.pieces[0];
  const isVisual = entry.artType !== 'written_form' && entry.artType !== 'audio';
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      {/* Offset layer behind reads as a stack of pieces. */}
      <View style={styles.stackWrap}>
        <View style={styles.stackBack} />
        <View style={styles.stackFront}>
          {isVisual ? (
            <Image
              source={thumbSource(cover.art_id, cover.file_path)}
              transition={200}
              style={[styles.tile, styles.tileImage]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.tile, styles.tilePage, styles.tileAudio]}>
              <Text style={styles.tileAudioLabel} numberOfLines={1}>{entry.medium}</Text>
            </View>
          )}
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{entry.pieces.length}</Text>
          </View>
        </View>
        <BookmarkButton
          artIds={entry.pieces.map((p) => p.art_id)}
          size={26}
          style={styles.tileBookmark}
        />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{entry.seriesName}</Text>
      <Text style={styles.cardCreator} numberOfLines={1}>
        {countLabel(entry.artType, entry.pieces.length)} · @{cover.creator_username}
      </Text>
    </Pressable>
  );
}

// --- Screen ------------------------------------------------------------------

export default function Bookmarks() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { bookmarkedIds, refresh: refreshBookmarks } = useBookmarks();
  const [items, setItems] = useState<BookmarkedArtOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await list_my_bookmarks(token));
    } catch {
      // Keep the last-known list; a failed refresh surfaces via BackendGate.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); refreshBookmarks(); }, [load, refreshBookmarks]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Drop anything unbookmarked elsewhere (or here) so removals show live without
  // a refetch — the shared context set is the source of truth for membership.
  const present = useMemo(
    () => items.filter((it) => bookmarkedIds.has(it.art_id)),
    [items, bookmarkedIds],
  );

  // Distinct mediums, most-saved first, for the bottom slider.
  const mediums = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of present) counts.set(it.medium, (counts.get(it.medium) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }, [present]);

  // segments[0] = "all"; index maps to activeIndex.
  const segments = useMemo(() => ['all', ...mediums], [mediums]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMedium = activeIndex === 0 ? null : segments[activeIndex] ?? null;

  // If the selected medium disappears (last piece removed), fall back to "all".
  useEffect(() => {
    if (activeIndex > segments.length - 1) setActiveIndex(0);
  }, [segments.length, activeIndex]);

  // Gold pill slides to whichever segment is active. Because medium names vary
  // in length, each segment sizes to its own text and reports its measured x +
  // width; the box animates to those, so it lands fairly on every label. Both
  // position and width animate on the JS driver (no native/JS mixing).
  const boxX = useRef(new Animated.Value(0)).current;
  const boxW = useRef(new Animated.Value(0)).current;
  const barRef = useRef<ScrollView>(null);
  const segLayouts = useRef<{ x: number; width: number }[]>([]);

  const moveBox = useCallback(
    (i: number, animated: boolean) => {
      const l = segLayouts.current[i];
      if (!l) return;
      const duration = animated ? 220 : 0;
      const easing = Easing.out(Easing.cubic);
      Animated.timing(boxX, { toValue: l.x + BOX_INSET, duration, easing, useNativeDriver: false }).start();
      Animated.timing(boxW, { toValue: Math.max(0, l.width - BOX_INSET * 2), duration, easing, useNativeDriver: false }).start();
      barRef.current?.scrollTo({ x: Math.max(0, l.x + l.width / 2 - SCREEN_WIDTH / 2), animated });
    },
    [boxX, boxW],
  );

  const onSegLayout = useCallback(
    (i: number, x: number, width: number) => {
      segLayouts.current[i] = { x, width };
      if (i === activeIndex) moveBox(i, false);
    },
    [activeIndex, moveBox],
  );

  const selectSegment = useCallback(
    (i: number) => {
      setActiveIndex(i);
      moveBox(i, true);
    },
    [moveBox],
  );

  // Re-snap when the active index or the segment set changes (onSegLayout
  // corrects it precisely once the new segments have measured).
  useEffect(() => {
    moveBox(activeIndex, false);
  }, [activeIndex, segments.length, moveBox]);

  // Grid crossfade on filter change: fade out, swap the rendered filter, fade in.
  const gridOpacity = useRef(new Animated.Value(1)).current;
  const [renderMedium, setRenderMedium] = useState<string | null>(null);
  useEffect(() => {
    if (renderMedium === activeMedium) return;
    Animated.timing(gridOpacity, { toValue: 0, duration: 110, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setRenderMedium(activeMedium);
      Animated.timing(gridOpacity, { toValue: 1, duration: 170, useNativeDriver: true }).start();
    });
  }, [activeMedium, renderMedium, gridOpacity]);

  const filtered = useMemo(
    () => (renderMedium ? present.filter((it) => it.medium === renderMedium) : present),
    [present, renderMedium],
  );
  const entries = useMemo(() => buildEntries(filtered), [filtered]);

  const openPiece = (item: BookmarkedArtOut) =>
    navigation.navigate('UserProfile', {
      username: item.creator_username,
      artId: item.art_id,
      medium: item.medium,
    });

  const renderEntry = ({ item: entry }: { item: Entry }) =>
    entry.kind === 'collection' ? (
      <CollectionCard entry={entry} onPress={() => openPiece(entry.pieces[0])} />
    ) : (
      <PieceCard item={entry.item} onPress={() => openPiece(entry.item)} />
    );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { marginTop: insets.top + 12 }]}>bookmarks</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : present.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>nothing saved yet</Text>
        </View>
      ) : (
        <>
          <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
            <FlatList
              data={entries}
              keyExtractor={(e) => (e.kind === 'collection' ? `col:${e.seriesId}` : e.item.art_id)}
              renderItem={renderEntry}
              numColumns={NUM_COLUMNS}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          </Animated.View>

          {segments.length > 1 && (
            <View style={[styles.slider, { paddingBottom: 8 }]}>
              <ScrollView
                ref={barRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sliderContent}
              >
                {/* Box and segments share one coordinate space (no content
                    padding); leading/trailing spacers give edge breathing room. */}
                <Animated.View
                  pointerEvents="none"
                  style={[styles.sliderBox, { width: boxW, transform: [{ translateX: boxX }] }]}
                />
                <View style={styles.sliderSpacer} />
                {segments.map((label, i) => (
                  <Pressable
                    key={label}
                    style={styles.segment}
                    onLayout={(e) => onSegLayout(i, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
                    onPress={() => selectSegment(i)}
                  >
                    <Text
                      style={[styles.segText, i === activeIndex && styles.segTextActive]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
                <View style={styles.sliderSpacer} />
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
    paddingHorizontal: LIST_PAD,
    marginBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  list: {
    paddingHorizontal: LIST_PAD,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'flex-start',
    gap: COLUMN_GAP,
    marginBottom: 16,
  },
  card: {
    width: CARD_WIDTH,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  tile: {
    width: '100%',
    height: CARD_WIDTH,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  tileImage: {},
  tilePage: {
    backgroundColor: Colors.secondary,
    padding: 8,
    overflow: 'hidden',
  },
  tilePageSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    lineHeight: 10,
    color: Colors.black,
  },
  // Cover image fills the page frame edge-to-edge (cancel the page padding).
  tilePageCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tileAudio: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileAudioLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  // Saved/unsaved toggle pinned to each tile's top-right corner.
  tileBookmark: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  // Collection stack: a cream layer peeking out behind the cover.
  stackWrap: {
    position: 'relative',
  },
  stackBack: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    height: CARD_WIDTH,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
  },
  stackFront: {
    // Sits on top of stackBack.
  },
  countBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.black,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    marginTop: 6,
  },
  cardCreator: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Bottom slider.
  slider: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    backgroundColor: Colors.mainBg,
    paddingTop: 8,
  },
  sliderContent: {
    // No horizontal padding here so segment layout x and the absolute box share
    // one origin; spacers below supply the edge gap instead.
    position: 'relative',
    alignItems: 'center',
  },
  sliderSpacer: {
    width: LIST_PAD,
  },
  sliderBox: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    backgroundColor: Colors.primaryGold,
    borderRadius: 13,
  },
  segment: {
    // Sizes to its own label so long medium names get room and the row overflows
    // into a real horizontal scroll instead of scrunching.
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  segTextActive: {
    color: Colors.black,
    fontWeight: '700',
  },
});
