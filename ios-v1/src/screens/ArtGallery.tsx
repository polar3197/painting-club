import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Platform } from 'react-native';
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
  imageSource,
  ArtResult,
  MediaType,
  Profile,
  Visual2DOut,
} from '../api';
import ArtComments from '../components/ArtComments';
import { appAlert } from '../components/AppAlert';
import BookmarkButton from '../components/BookmarkButton';
import { useDebouncedValue, useWrittenFormText, extFromPath, isTextExt } from '../hooks';
import ArtCarousel from '../components/ArtCarousel';
import { registerArt } from '../api/inspiration';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { columnsFor } from '../constants/grid';
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
              cover_image_path: p.cover_image_path ?? null,
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
function VisualCard({ item, cardWidth, onPress }: { item: ArtResult; cardWidth: number; onPress: () => void }) {
  return (
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
        style={[styles.cardImage, { height: cardWidth }]}
        contentFit="cover"
      />
    </Pressable>
  );
}

// Paper card — written-form pieces. Shows a text snippet for .txt/.md, else a
// blank page (matching the profile's WrittenFormPiece thumbnail treatment).
function WrittenCard({ item, cardWidth, onPress }: { item: ArtResult; cardWidth: number; onPress: () => void }) {
  const isText = isTextExt(extFromPath(item.file_path));
  const text = useWrittenFormText(item.file_path);
  const snippet = snippetOf(text);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={[styles.cardPage, { height: cardWidth }]}>
        {item.cover_image_path ? (
          <Image source={imageSource(item.cover_image_path)} style={styles.cardPageCover} contentFit="cover" />
        ) : isText && !!snippet ? (
          <Text style={styles.cardPageSnippet} numberOfLines={SNIPPET_LINES}>{snippet}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// Instagram-style transient zoom: pinch a feed photo to magnify it under
// your fingers (following the focal drift), spring back on release. The
// zoomed copy renders in the root-level ArtZoomOverlayHost so it floats over
// EVERYTHING (header, nav bar); the inline art hides while a zoom is live.
// Feed (1-per-row) card, modeled on the profile page's art element: bordered
// card, framed art at true aspect ratio, then title + date badge, creator ·
// medium, location/song detail rows, and a comments + bookmark footer.
// Renders the 512px thumb (not the full-res original) — a feed of every
// piece can't afford profile-page bandwidth.
// Tapping the CARD opens the creator's profile; tapping the ART opens the
// full-screen carousel viewer (same one the profile art elements use).
function FeedArtCard({ item, onPress, onZoom, onComment, onWeb }: {
  item: ArtResult;
  onPress: () => void;
  onZoom?: () => void;
  onComment?: () => void;
  onWeb: () => void;
}) {
  const isWritten = item.art_type === 'written_form';
  const isText = isTextExt(extFromPath(item.file_path));
  // No-ops for non-text extensions, so safe to call for visual pieces too.
  const text = useWrittenFormText(item.file_path);
  const snippet = snippetOf(text);
  return (
    <Pressable style={styles.feedElement} onPress={onPress}>
      {isWritten ? (
        <Pressable
          style={({ pressed }) => [styles.feedVisual, pressed && { opacity: 0.9 }]}
          onPress={onPress}
        >
          <View style={[styles.cardPage, styles.feedPage]}>
            {item.cover_image_path ? (
              <Image source={imageSource(item.cover_image_path)} style={styles.cardPageCover} contentFit="cover" />
            ) : isText && !!snippet ? (
              <Text style={styles.cardPageSnippet} numberOfLines={SNIPPET_LINES}>{snippet}</Text>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.feedVisual, pressed && { opacity: 0.9 }]}
          onPress={onZoom ?? onPress}
        >
          <View style={{ width: '100%', aspectRatio: item.aspect_ratio || 1 }}>
            <Image
              source={thumbSource(item.id, item.file_path)}
              transition={Platform.OS === 'web' ? 0 : 200}
              cachePolicy="memory-disk"
              style={styles.feedImage}
              contentFit="contain"
            />
          </View>
        </Pressable>
      )}
      <View style={styles.feedDetails}>
        <View style={styles.feedTitleRow}>
          {!!item.title && <Text style={styles.feedTitle}>{item.title}</Text>}
          {!!item.date && (
            <View style={styles.feedDateBadge}>
              <Text style={styles.feedDateBadgeText}>{item.date}</Text>
            </View>
          )}
        </View>
        <Text style={styles.feedByline} numberOfLines={1}>
          {item.creator_username} · {item.medium}
        </Text>
        {!!item.location && (
          <View style={styles.feedDetailRow}>
            <Image source={require('../../assets/imgs/location.png')} style={styles.feedDetailIcon} />
            <Text style={styles.feedDetailText}>{item.location}</Text>
          </View>
        )}
        {!!item.song && (
          <View style={styles.feedDetailRow}>
            <Image source={require('../../assets/imgs/music.png')} style={styles.feedDetailIcon} />
            <Text style={styles.feedDetailText}>{item.song}</Text>
          </View>
        )}
        <View style={styles.feedFooter}>
          <View style={[styles.feedFooterMain, styles.feedFooterLeft]}>
            <BookmarkButton artId={item.id} size={32} style={styles.feedBookmarkBtn} />
            {/* Charlie's hand-drawn web — opens the inspiration web centered
                on this piece. */}
            <Pressable
              style={({ pressed }) => [styles.feedWebBtn, pressed && styles.cardPressed]}
              onPress={onWeb}
              hitSlop={8}
            >
              <Image
                source={require('../../assets/imgs/web.png')}
                style={styles.feedWebIcon}
                contentFit="contain"
              />
            </Pressable>
          </View>
          {onComment && (
            // Charlie's hand-drawn speech bubble — friendlier than a boxy
            // text button, and it matches the app's inked icon language.
            <Pressable
              style={({ pressed }) => [styles.feedCommentBtn, pressed && styles.cardPressed]}
              onPress={onComment}
              hitSlop={8}
            >
              <Image
                source={require('../../assets/imgs/comment-bubble.png')}
                style={styles.feedCommentIcon}
                contentFit="contain"
              />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
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
}

export default function ArtGallery({ query, onResetFilters, onListScroll, onVerticalScroll }: Props) {
  const navigation = useNavigation<Nav>();
  const { token, currentUser } = useAuth();
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

  // Cards per row from the result count alone (columnsFor: ~√n, capped at 4)
  // — the full gallery is 4-up, a narrowed search gets fewer, larger cards,
  // and a single result renders as the full-width feed card.
  const numColumns = columnsFor(filtered.length);
  const cardWidth = (SCREEN_WIDTH - LIST_PAD * 2 - COLUMN_GAP * (numColumns - 1)) / numColumns;
  const feed = numColumns === 1;

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

  const openProfile = useCallback(
    (item: ArtResult) =>
      navigation.navigate('UserProfile', {
        username: item.creator_username,
        artId: item.id,
        medium: item.medium,
      }),
    [navigation],
  );

  // Tap on a feed photo → the same full-screen swipe-through carousel the
  // profile art elements open, spanning every VISUAL piece in the current
  // (filtered) feed. Written pieces keep their page-tap → profile.
  const visualFeed = useMemo(
    () => filtered.filter((a) => a.art_type !== 'written_form'),
    [filtered],
  );
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const openZoom = useCallback(
    (item: ArtResult) => {
      const idx = visualFeed.findIndex((a) => a.id === item.id);
      if (idx >= 0) setZoomIndex(idx);
    },
    [visualFeed],
  );

  const renderCard = ({ item }: { item: ArtResult }) => {
    const onPress = () => openProfile(item);
    if (feed) {
      const onWeb = () => {
        registerArt({
          kind: 'art',
          id: item.id,
          title: item.title,
          creator: item.creator_username,
          medium: item.medium,
          file_path: item.file_path,
          aspect_ratio: item.aspect_ratio,
          mine: item.creator_username === currentUser,
          artKind: item.art_type === 'written_form' ? 'written' : 'visual',
        });
        (navigation as any).navigate('Web', { artId: item.id });
      };
      return (
        <FeedArtCard
          item={item}
          onPress={onPress}
          onZoom={item.art_type === 'written_form' ? undefined : () => openZoom(item)}
          onComment={item.art_type === 'written_form' ? undefined : () => openComments(item)}
          onWeb={onWeb}
        />
      );
    }
    return item.art_type === 'written_form' ? (
      <WrittenCard item={item} cardWidth={cardWidth} onPress={onPress} />
    ) : (
      <VisualCard item={item} cardWidth={cardWidth} onPress={onPress} />
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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        // FlatList REQUIRES a key change when numColumns changes (it throws
        // otherwise). Columns only move when a search narrows the count, so
        // the remount happens behind active typing, not mid-browse.
        key={numColumns}
        numColumns={numColumns}
        // Solo cards are viewport-width, so rows cross the virtualization
        // boundary constantly — keep more of them mounted to avoid remount
        // churn while scrolling.
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
      {refreshing && (
        <View style={styles.refreshSpinnerOverlay} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}
      {commentPiece && (
        <ArtComments piece={commentPiece} onClose={() => setCommentPiece(null)} />
      )}
      {/* Full-screen viewer over the feed — swipe sideways to the next piece,
          pinch to zoom, drag down to dismiss: identical to the profile's. Mixed
          creators, so captions carry the per-piece title + name. */}
      {zoomIndex !== null && visualFeed[zoomIndex] && (
        <ArtCarousel
          pieces={visualFeed}
          initialIndex={zoomIndex}
          isOwner={false}
          creatorUsername=""
          captions={visualFeed.map((a) => ({
            title: a.title,
            creator: a.creator_username,
            aspectRatio: a.aspect_ratio ?? undefined,
          }))}
          onClose={() => setZoomIndex(null)}
        />
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
  // Feed (1 per row): profile-page-style art element — bordered card with a
  // framed true-ratio artwork, details block, and comments/bookmark footer.
  // White fill matches the profile art elements' default card color.
  feedElement: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
    backgroundColor: Colors.white,
  },
  feedVisual: {
    width: '100%',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  feedImage: {
    width: '100%',
    height: '100%',
  },
  feedPage: {
    aspectRatio: 1,
  },
  feedDetails: {
    paddingHorizontal: 4,
  },
  feedTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 2,
  },
  feedTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    flex: 1,
  },
  feedDateBadge: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 'auto',
    marginTop: 4,
  },
  feedDateBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
  },
  feedByline: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  feedDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedDetailIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  feedDetailText: {
    fontSize: FontSizes.xs,
  },
  feedFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedFooterMain: {
    flex: 1,
  },
  feedFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedWebBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedWebIcon: {
    width: 24,
    height: 24,
  },
  // Same bordered square treatment as BookmarkButton so the two footer
  // actions read as a matched pair.
  feedCommentBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedCommentIcon: {
    width: 24,
    height: 20,
  },
  feedBookmarkBtn: {
    alignSelf: 'flex-start',
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
  // Cover image fills the page frame edge-to-edge (cancel the page padding).
  cardPageCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardPageSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    lineHeight: 10,
    color: Colors.black,
  },
});
