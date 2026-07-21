import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import Spinner from '../components/Spinner';
import {
  search_art,
  get_media,
  get_members,
  get_members_visual_2d,
  get_members_written_form,
  thumbSource,
  ArtResult,
  MediaType,
  Profile,
  Visual2DOut,
} from '../api';
import ArtComments from '../components/ArtComments';
import { appAlert } from '../components/AppAlert';
import { useDebouncedValue, useWrittenFormText, extFromPath, isTextExt } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { GridMode, columnsFor } from '../constants/grid';
import type { SearchStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SearchStackParamList, 'SearchTabs'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = 10;
const LIST_PAD = 20; // horizontal padding on each side of the list
const SNIPPET_LINES = 8;

function snippetOf(text: string | null): string {
  if (!text) return '';
  return text.split(/\r?\n/).slice(0, SNIPPET_LINES).join('\n');
}

// The /art/search endpoint is visual-2d only, and there's no global
// written-form endpoint — so the gallery assembles written pieces itself,
// client-side, from the per-member written endpoint. One fetch per
// (member, shown written-medium); iterating each member's SHOWN `media`
// list naturally skips hidden media. WrittenFormOut carries no creator or
// medium, so we stitch those in from the fetch context.
async function fetchWrittenArt(token: string | null): Promise<ArtResult[]> {
  const [media, members] = await Promise.all([
    get_media().catch(() => [] as MediaType[]),
    get_members('', '', token).catch(() => [] as Profile[]),
  ]);
  const writtenMedia = new Set(
    media.filter((m) => m.type === 'written_form').map((m) => m.name),
  );
  if (writtenMedia.size === 0) return [];

  const jobs: Promise<ArtResult[]>[] = [];
  for (const member of members) {
    for (const medium of member.media ?? []) {
      if (!writtenMedia.has(medium)) continue;
      jobs.push(
        get_members_written_form(member.username, medium)
          .then((pieces) =>
            pieces.map((p): ArtResult => ({
              id: p.id,
              title: p.title,
              medium,
              art_type: 'written_form',
              keywords: p.keywords ?? [],
              song: null,
              file_path: p.file_path,
              date: p.date,
              location: null,
              creator_username: member.username,
              creator_city: member.city ?? null,
              aspect_ratio: null,
            })),
          )
          .catch(() => [] as ArtResult[]),
      );
    }
  }
  return (await Promise.all(jobs)).flat();
}

// Merge visual + written newest-first (ISO date strings; nulls sink to the
// bottom), deduped by id so a future backend that returns written pieces in
// search can't double them up with the client fan-out.
function mergeArt(visual: ArtResult[], written: ArtResult[]): ArtResult[] {
  const byId = new Map<string, ArtResult>();
  for (const a of visual) byId.set(a.id, a);
  for (const a of written) if (!byId.has(a.id)) byId.set(a.id, a);
  return Array.from(byId.values()).sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  );
}

// Image card — visual-2d pieces (and anything an old backend returns untyped).
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

function VisualCard({ item, cardWidth, onPress, feed, onComment }: {
  item: ArtResult;
  cardWidth: number;
  onPress: () => void;
  feed?: boolean;
  onComment?: () => void;
}) {
  // Feed shows the piece at its true shape; gallery tiles stay square. Thumbs
  // preserve aspect ratio (ArtComments measures them for exactly that), so
  // cover-fitting the ratio-correct box doesn't crop.
  const height = feed ? cardWidth / (item.aspect_ratio || 1) : cardWidth;
  return (
    <View style={feed ? styles.feedItem : null}>
      <Pressable
        style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        {/* Grid tiles load the 512px thumbnail, not the multi-MB original — the
            tile is far smaller than full-res, and this cuts gallery bandwidth
            ~10-50x. Full-res still loads in the zoom viewer on tap. */}
        <Image
          source={thumbSource(item.id, item.file_path)}
          // Web: expo-image's cross-dissolve strands memory-cached images at
          // opacity 0 after a FlatList column-swap remount, so no fade there.
          transition={Platform.OS === 'web' ? 0 : 200}
          // memory-disk: remounted rows (FlatList virtualization) paint
          // synchronously from memory instead of replaying the fade — without
          // this the 1-column view "refreshes" every image as you scroll.
          cachePolicy="memory-disk"
          style={[styles.cardImage, { height }]}
          contentFit="cover"
        />
      </Pressable>
      {feed && <FeedCaption item={item} onComment={onComment} />}
    </View>
  );
}

// Paper card — written-form pieces. Shows a text snippet for .txt/.md, else a
// blank page (matching the profile's WrittenFormPiece thumbnail treatment).
function WrittenCard({ item, cardWidth, onPress, feed }: {
  item: ArtResult;
  cardWidth: number;
  onPress: () => void;
  feed?: boolean;
}) {
  const isText = isTextExt(extFromPath(item.file_path));
  const text = useWrittenFormText(item.file_path);
  const snippet = snippetOf(text);
  return (
    <View style={feed ? styles.feedItem : null}>
      <Pressable
        style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        <View style={[styles.cardPage, { height: cardWidth }]}>
          {isText && !!snippet && (
            <Text style={styles.cardPageSnippet} numberOfLines={SNIPPET_LINES}>{snippet}</Text>
          )}
        </View>
      </Pressable>
      {feed && <FeedCaption item={item} />}
    </View>
  );
}

const ART_KEYS = ['title', 'medium', 'song', 'creator_username', 'location', 'keywords'];

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

export default function ArtGallery({ query, onResetFilters, onListScroll, onVerticalScroll, mode }: Props) {
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  // Visual paints immediately; written fans out and merges in when ready.
  const [visualArt, setVisualArt] = useState<ArtResult[]>([]);
  const [writtenArt, setWrittenArt] = useState<ArtResult[]>([]);
  const art = useMemo(() => mergeArt(visualArt, writtenArt), [visualArt, writtenArt]);
  const [refreshing, setRefreshing] = useState(false);
  // Until the first visual fetch settles the result count is 0, which would
  // paint a 1-column grid that reflows once results land — spin instead.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    search_art('')
      .then(setVisualArt)
      .catch(() => {})
      .finally(() => setLoaded(true));
    fetchWrittenArt(token).then(setWrittenArt).catch(() => {});
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onResetFilters();
    await Promise.all([
      search_art('').then(setVisualArt).catch(() => {}),
      fetchWrittenArt(token).then(setWrittenArt).catch(() => {}),
    ]);
    setRefreshing(false);
  }, [onResetFilters, token]);

  // Index construction is the expensive half of Fuse — build it once per
  // dataset, not per keystroke. The query is debounced so the grid re-renders
  // when typing pauses instead of on every character.
  const fuse = useMemo(() => new Fuse(art, { keys: ART_KEYS, threshold: 0.4 }), [art]);
  const debouncedQuery = useDebouncedValue(query);
  const filtered = useMemo(() => {
    if (!debouncedQuery.trim()) return art;
    return fuse.search(debouncedQuery).map((r) => r.item);
  }, [art, fuse, debouncedQuery]);

  // FlatList must remount to change numColumns (it throws otherwise), and a bare
  // remount makes every photo vanish + reappear. So we decouple the target
  // column count (from the slider) from the one actually rendered, and crossfade:
  // fade the grid out, swap columns while it's invisible, fade back in.
  const targetColumns = mode === 'feed' ? 1 : columnsFor(filtered.length);
  const [renderedColumns, setRenderedColumns] = useState(targetColumns);
  const gridOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);
  useEffect(() => {
    // Behind the initial-load spinner nothing is visible — snap columns
    // silently so the first paint starts at the right count.
    if (!loaded) {
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
    // Dip to a dim floor (not 0) so content is always on screen — no blank
    // "pause" while the list remounts, just a brief dim as it swaps columns.
    Animated.timing(gridOpacity, { toValue: 0.4, duration: 55, useNativeDriver: true }).start(({ finished }) => {
      if (cancelled || !finished) return;
      setRenderedColumns(targetColumns);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, targetColumns, renderedColumns, gridOpacity]);

  const numColumns = renderedColumns;
  const cardWidth = (SCREEN_WIDTH - LIST_PAD * 2 - COLUMN_GAP * (numColumns - 1)) / numColumns;

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

  const feed = numColumns === 1;
  const renderCard = ({ item }: { item: ArtResult }) => {
    const onPress = () =>
      navigation.navigate('UserProfile', {
        username: item.creator_username,
        artId: item.id,
        medium: item.medium,
      });
    return item.art_type === 'written_form' ? (
      <WrittenCard item={item} cardWidth={cardWidth} onPress={onPress} feed={feed} />
    ) : (
      <VisualCard
        item={item}
        cardWidth={cardWidth}
        onPress={onPress}
        feed={feed}
        onComment={feed ? () => openComments(item) : undefined}
      />
    );
  };

  if (!loaded) {
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
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        // FlatList REQUIRES a key change when numColumns changes (it throws
        // otherwise). The remount flash is softened by the opacity crossfade
        // around this list (see gridOpacity / renderedColumns).
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
      {commentPiece && (
        <ArtComments piece={commentPiece} onClose={() => setCommentPiece(null)} />
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
  // Feed (1 per row): full-width card + caption strip, spaced like posts.
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
  // Written-form "page": cream panel with a clipped serif snippet, sized to
  // match the square image cards so mixed rows line up.
  cardPage: {
    width: '100%',
    backgroundColor: Colors.secondary,
    padding: 8,
    overflow: 'hidden',
  },
  cardPageSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    lineHeight: 10,
    color: Colors.black,
  },
});
