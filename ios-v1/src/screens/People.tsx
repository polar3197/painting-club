import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Platform, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import Spinner from '../components/Spinner';
import { useMembers, useDebouncedValue } from '../hooks';
import { resolveImageUrl, profilePicSource, profileThumbSource, picVersion, Profile } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { columnsFor } from '../constants/grid';
import { useNavPref } from '../context/NavPrefContext';
import type { SearchStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SearchStackParamList, 'SearchTabs'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = 10;
const LIST_PAD = 20; // horizontal padding on each side of the list
const STRIP_PAD = 10; // sideways mode: padding around the strip
const NAME_H = 30; // sideways mode: the username row under each photo
const ROW_AV = 56;   // avatar size in the single-column "feed" rows view

const PEOPLE_KEYS = ['username', 'firstname', 'lastname', 'city', 'media'];

// Roster tile avatar. Loads the small (256px) gated profile-pic thumbnail so a
// directory of members isn't pulling a full-res photo per tile. If that route
// 404s — a backend that predates it — it falls back to the full pic, so the
// roster keeps working across the deploy that adds the route. No pic → default.
function RosterAvatar({ item, size }: { item: Profile; size: number }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasPic = !!item.profile_pic_path;
  // Full-pic fallback is keyed (stableCacheKey) so the roster doesn't re-cache
  // every member's full-res photo on each browse — that was the gigabyte leak.
  const fullOrDefault = profilePicSource(item) ?? { uri: resolveImageUrl(`/imgs/${item.id}.png`) };
  const useThumb = hasPic && !thumbFailed;
  return (
    <Image
      source={useThumb ? profileThumbSource(item.id, picVersion(item)) : fullOrDefault}
      // Web: expo-image's cross-dissolve strands memory-cached images at
      // opacity 0 after a FlatList column-swap remount, so no fade there.
      transition={Platform.OS === 'web' ? 0 : 200}
      // memory-disk: remounted rows (FlatList virtualization) paint
      // synchronously from memory instead of replaying the fade.
      cachePolicy="memory-disk"
      style={[styles.cardImage, { height: size }]}
      contentFit="cover"
      onError={useThumb ? () => setThumbFailed(true) : undefined}
    />
  );
}

interface Props {
  // Search state is owned by SearchTabs so the bar can stay fixed above the
  // swiping lists; this screen just renders the filtered grid.
  query: string;
  onResetFilters: () => void;
  onListScroll: () => void;
  // Reports the grid's vertical scroll offset so SearchTabs can minimize the
  // toggle bar as you scroll down.
  onVerticalScroll: (offsetY: number) => void;
  // Lay the cards out `rows` tall and scroll sideways (the hub's People pane —
  // sideways scrolling leaves up/down free for the hub's swipe back to Home).
  rows?: number;
}

export default function People({ query, onResetFilters, onListScroll, onVerticalScroll, rows }: Props) {
  const navigation = useNavigation<Nav>();
  const { everythingView } = useNavPref();
  // `loading` is true only for the initial fetch — while it runs the member
  // count is 0, which would paint a 1-column grid that reflows once the
  // roster lands. Spin until it settles instead.
  const [members, , loading, refetchMembers] = useMembers('', '');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onResetFilters();
    try {
      await refetchMembers();
    } catch {}
    setRefreshing(false);
  }, [onResetFilters, refetchMembers]);

  // Directory order: members with a profile picture first, then those without;
  // within each group, newest-to-join first (by terms_accepted_at — the closest
  // join timestamp the profile exposes; missing dates sink to the bottom).
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ap = a.profile_pic_path ? 1 : 0;
      const bp = b.profile_pic_path ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.terms_accepted_at ?? '';
      const bt = b.terms_accepted_at ?? '';
      if (at && bt) return bt.localeCompare(at);
      if (at) return -1;
      if (bt) return 1;
      return 0;
    });
  }, [members]);

  // Index construction is the expensive half of Fuse — build it once per
  // dataset, not per keystroke. The query is debounced so the grid re-renders
  // when typing pauses instead of on every character.
  const fuse = useMemo(() => new Fuse(sortedMembers, { keys: PEOPLE_KEYS, threshold: 0.4 }), [sortedMembers]);
  const debouncedQuery = useDebouncedValue(query);
  const filtered = useMemo(() => {
    if (!debouncedQuery.trim()) return sortedMembers;
    return fuse.search(debouncedQuery).map((r) => r.item);
  }, [sortedMembers, fuse, debouncedQuery]);

  // The search-bar toggle switches this roster between the grid and a single-
  // column "feed" (compact rows).
  const feedMode = everythingView === 'feed';
  // Cards per row from the result count alone (columnsFor: ~√n, capped at 4)
  // — a full roster is 4-up, a narrowed search gets fewer, larger cards. Feed
  // mode is always one column.
  const numColumns = feedMode ? 1 : columnsFor(filtered.length);
  const cardWidth = (SCREEN_WIDTH - LIST_PAD * 2 - COLUMN_GAP * (numColumns - 1)) / numColumns;

  const renderCard = ({ item }: { item: Profile }) => {
    if (feedMode) {
      const fullName = `${item.firstname ?? ''} ${item.lastname ?? ''}`.trim();
      return (
        <Pressable
          style={({ pressed }) => [styles.rowCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('UserProfile', { username: item.username })}
        >
          <View style={styles.rowAvatar}><RosterAvatar item={item} size={ROW_AV} /></View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>{item.username}</Text>
            {fullName ? <Text style={styles.rowSub} numberOfLines={1}>{fullName}</Text> : null}
            {item.city ? <Text style={styles.rowMeta} numberOfLines={1}>{item.city}{item.state ? `, ${item.state}` : ''}</Text> : null}
          </View>
        </Pressable>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { width: cardWidth },
          // Single full-width column has no columnWrapper gap, so space the stacked
          // cards here.
          numColumns === 1 && styles.soloItem,
          pressed && styles.cardPressed,
        ]}
        onPress={() => navigation.navigate('UserProfile', { username: item.username })}
      >
        <RosterAvatar item={item} size={cardWidth} />
        <View style={styles.cardBody}>
          <Text style={styles.cardUsername} numberOfLines={1}>{item.username}</Text>
        </View>
      </Pressable>
    );
  };

  // Sideways mode: a grid of `rows` rows that scrolls sideways, card size from
  // the space available.
  const [stripH, setStripH] = useState(0);
  const [stripW, setStripW] = useState(0);

  // Card size comes from the height; the number of columns that fit comes from
  // the width. Both are needed before the grid can be filled, so they are
  // computed here rather than inside the render branch below.
  const sizeRows = rows ? rows + 1 : 1;
  const cellH = rows && stripH > 0 ? (stripH - STRIP_PAD * 2 - COLUMN_GAP * (sizeRows - 1)) / sizeRows : 0;
  const side = Math.max(0, cellH - NAME_H);
  const gap = rows && rows > 1 ? COLUMN_GAP + (cellH + COLUMN_GAP) / 4 / (rows - 1) : COLUMN_GAP;
  // The row length nothing used to define: how many columns actually fit.
  const colsPerScreen =
    side > 0 && stripW > 0
      ? Math.max(1, Math.floor((stripW - LIST_PAD * 2 + gap) / (side + gap)))
      : 1;

  const columns = useMemo(() => {
    if (!rows) return [];
    // ROW-major, not column-major. Filling down each column first meant that
    // narrowing a search stacked the survivors down the left edge; filling
    // across means a short result set lands in the top row, read left to right.
    //
    // Row-major needs a row length, and the honest one is the number of columns
    // that fit on screen. Once `rows * colsPerScreen` slots are used the next
    // screenful fills the same way, so the reading order is the same everywhere
    // rather than changing once you scroll.
    const C = colsPerScreen;
    const perScreen = rows * C;
    const out: Profile[][] = [];
    for (let start = 0; start < filtered.length; start += perScreen) {
      const page = filtered.slice(start, start + perScreen);
      for (let c = 0; c < C; c++) {
        const col: Profile[] = [];
        for (let r = 0; r < rows; r++) {
          const j = r * C + c;
          if (j < page.length) col.push(page[j]);
        }
        // A partial last row leaves trailing columns empty; drop them rather
        // than rendering blanks.
        if (col.length) out.push(col);
      }
    }
    return out;
  }, [filtered, rows, colsPerScreen]);

  if (rows && !loading) {
    // Cards are sized as if the strip held one more row than it shows; a
    // quarter of the freed row widens the gaps, and rows and columns share
    // that one gap. Sizing happens above, since the grid needs it to fill.
    // Each column is a FIXED-height grid of `rows` slots, so a short column
    // keeps its cards in their slots from the top instead of floating them to
    // the middle of the strip.
    const gridH = rows * cellH + (rows - 1) * gap;
    return (
      <View
        style={styles.container}
        onLayout={(e) => {
          setStripH(e.nativeEvent.layout.height);
          setStripW(e.nativeEvent.layout.width);
        }}
      >
        {side > 0 && (
          <FlatList
            horizontal
            data={columns}
            keyExtractor={(col) => col[0].username}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.strip, { gap }]}
            renderItem={({ item: col }) => (
              <View style={[styles.stripCol, { width: side, height: gridH, gap }]}>
                {col.map((m) => (
                  <Pressable
                    key={m.username}
                    style={({ pressed }) => [styles.card, { width: side }, pressed && styles.cardPressed]}
                    onPress={() => navigation.navigate('UserProfile', { username: m.username })}
                  >
                    <RosterAvatar item={m} size={side - 2} />
                    <View style={[styles.cardBody, styles.stripName]}>
                      <Text style={styles.cardUsername} numberOfLines={1}>{m.username}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          />
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Spinner size={48} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.username}
        renderItem={renderCard}
        // FlatList requires a key change when numColumns changes (throws
        // otherwise). Also remount when toggling grid⇄feed.
        key={feedMode ? 'feed' : `grid-${numColumns}`}
        numColumns={numColumns}
        columnWrapperStyle={!feedMode && numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={onListScroll}
        onScroll={(e) => onVerticalScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      />
      {refreshing && (
        <View style={styles.refreshSpinnerOverlay} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshSpinnerOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  strip: {
    padding: STRIP_PAD,
    paddingHorizontal: LIST_PAD,
    gap: COLUMN_GAP,
  },
  stripCol: {
    gap: COLUMN_GAP,
    // The column is given an explicit height of `rows` slots, and its cards
    // fill from the TOP of that grid. A short column therefore keeps its cards
    // in their grid positions instead of floating them to the middle, which is
    // what centring inside a stretched column used to do.
    justifyContent: 'flex-start',
    // The grid as a whole still sits just above the strip's centre — that is
    // the block being placed, not the cards being redistributed inside it.
    alignSelf: 'center',
    marginBottom: 44,
  },
  stripName: {
    height: NAME_H,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  list: {
    // Top gap lives on the pager (SearchTabs) so it persists while scrolling.
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  row: {
    justifyContent: 'flex-start',
    gap: COLUMN_GAP,
    marginBottom: 12,
  },
  // Vertical gap between full-width cards when the grid is 1 per row.
  soloItem: {
    marginBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardImage: {
    width: '100%',
  },
  cardBody: {
    padding: 8,
  },
  cardUsername: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    // Match the art search card title color (black).
    color: Colors.textPrimary,
  },
  // Single-column "feed" rows
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    marginHorizontal: LIST_PAD,
    marginBottom: 10,
    paddingLeft: 10,
    paddingVertical: 8,
  },
  rowAvatar: {
    width: ROW_AV,
    height: ROW_AV,
    borderWidth: 1,
    borderColor: '#000',
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rowSub: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

// Standalone people screen for the Home "people" button — the roster with the
// people icon up top and a live search bar (no tab chrome).
export function PeopleScreen({ embedded = false, rows }: { embedded?: boolean; rows?: number } = {}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [query, setQuery] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: Colors.mainBg, paddingTop: insets.top }}>
      <View style={peopleScreenStyles.topRow}>
        {/* In the swipe hub there's nothing to go back to — the green edge
            returns Home instead. */}
        {embedded ? (
          <View style={peopleScreenStyles.spacer} />
        ) : (
          <Pressable onPress={() => nav.goBack()} hitSlop={10}>
            <Text style={peopleScreenStyles.back}>‹ back</Text>
          </Pressable>
        )}
        <Image source={require('../../assets/imgs/profiles.png')} style={peopleScreenStyles.icon} contentFit="contain" />
        <View style={peopleScreenStyles.spacer} />
      </View>
      <View style={peopleScreenStyles.searchWrap}>
        <TextInput
          style={peopleScreenStyles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="search people (by city, person, title, medium, ...)"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <People query={query} onResetFilters={() => setQuery('')} onListScroll={() => {}} onVerticalScroll={() => {}} rows={rows} />
    </View>
  );
}

const peopleScreenStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  back: { fontFamily: Fonts.mono, fontSize: 15, color: Colors.black, width: 64 },
  spacer: { width: 64 },
  icon: { width: 44, height: 44 },
  searchWrap: { paddingHorizontal: 12, paddingBottom: 10 },
  search: {
    borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.white,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: Fonts.mono, fontSize: 14, color: Colors.black,
  },
});
