import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import Spinner from '../components/Spinner';
import { useMembers, useDebouncedValue } from '../hooks';
import { resolveImageUrl, profilePicSource, profileThumbSource, Profile } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { GridMode, columnsFor } from '../constants/grid';
import type { SearchStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SearchStackParamList, 'SearchTabs'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = 10;
const LIST_PAD = 20; // horizontal padding on each side of the list

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
      source={useThumb ? profileThumbSource(item.id) : fullOrDefault}
      transition={200}
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
  // Grid display mode from SearchTabs (pinch-toggled): feed forces 1 per
  // row; gallery uses the per-count formula.
  mode: GridMode;
}

export default function People({ query, onResetFilters, onListScroll, onVerticalScroll, mode }: Props) {
  const navigation = useNavigation<Nav>();
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

  // Index construction is the expensive half of Fuse — build it once per
  // dataset, not per keystroke. The query is debounced so the grid re-renders
  // when typing pauses instead of on every character.
  const fuse = useMemo(() => new Fuse(members, { keys: PEOPLE_KEYS, threshold: 0.4 }), [members]);
  const debouncedQuery = useDebouncedValue(query);
  const filtered = useMemo(() => {
    if (!debouncedQuery.trim()) return members;
    return fuse.search(debouncedQuery).map((r) => r.item);
  }, [members, fuse, debouncedQuery]);

  // Decouple the slider's target column count from the rendered one and
  // crossfade the change: FlatList must remount to change numColumns, so we fade
  // the grid out, swap columns while invisible, then fade back in (no vanish).
  const targetColumns = mode === 'feed' ? 1 : columnsFor(filtered.length);
  const [renderedColumns, setRenderedColumns] = useState(targetColumns);
  const gridOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);
  useEffect(() => {
    // Behind the initial-load spinner nothing is visible — snap columns
    // silently so the first paint starts at the right count.
    if (loading) {
      if (targetColumns !== renderedColumns) setRenderedColumns(targetColumns);
      return;
    }
    if (targetColumns === renderedColumns) {
      if (transitioning.current) {
        transitioning.current = false;
        Animated.timing(gridOpacity, { toValue: 1, duration: 110, useNativeDriver: true }).start();
      }
      return;
    }
    transitioning.current = true;
    let cancelled = false;
    // Dip to a dim floor (not 0) so content never fully leaves the screen — no
    // blank "pause" while the list remounts, just a brief dim during the swap.
    Animated.timing(gridOpacity, { toValue: 0.4, duration: 55, useNativeDriver: true }).start(({ finished }) => {
      if (cancelled || !finished) return;
      setRenderedColumns(targetColumns);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, targetColumns, renderedColumns, gridOpacity]);

  const numColumns = renderedColumns;
  const cardWidth = (SCREEN_WIDTH - LIST_PAD * 2 - COLUMN_GAP * (numColumns - 1)) / numColumns;

  const renderCard = ({ item }: { item: Profile }) => (
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

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Spinner size={48} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.username}
        renderItem={renderCard}
        // FlatList requires a key change when numColumns changes (throws
        // otherwise). Remount flash is softened by the opacity crossfade around
        // the list (see gridOpacity / renderedColumns).
        key={numColumns}
        numColumns={numColumns}
        // Solo cards are viewport-width squares, so rows cross the
        // virtualization boundary constantly — keep more of them mounted to
        // avoid remount churn while scrolling.
        windowSize={numColumns === 1 ? 41 : 21}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
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
      </Animated.View>
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
});
