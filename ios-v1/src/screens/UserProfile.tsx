import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
  RefreshControl,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useProfile, useAdminPending } from '../hooks';
import * as ImagePicker from 'expo-image-picker';
import {
  get_members_visual_2d,
  remove_visual_2d,
  add_member_media,
  get_members_written_form,
  get_members_audio,
  get_search_options,
  imageSource,
  profilePicSrc,
  profilePicSource,
  thumbSource,
  displaySource,
  upload_profile_picture,
  get_media,
  open_dm,
  get_unread_count,
  Visual2DOut,
  WrittenFormOut,
  AudioOut,
  Profile,
  MediaType,
} from '../api';
import Dropdown from '../components/Dropdown';
import ArtZoomIn from '../components/ArtZoomIn';
import ArtCarousel, { CarouselElement } from '../components/ArtCarousel';
import ArtComments from '../components/ArtComments';
import BookmarkButton from '../components/BookmarkButton';
import { registerArt } from '../api/inspiration';
import AddArtDialog from '../components/AddArtDialog';
import WrittenFormPiece from '../components/WrittenFormPiece';
import AudioPiece from '../components/AudioPiece';
import AlbumTile from '../components/AlbumTile';
import PaintingSeriesRow from '../components/PaintingSeriesRow';
import SeriesRow from '../components/SeriesRow';
import AddMediaDialog from '../components/AddMediaDialog';
import ShareMediaDialog from '../components/ShareMediaDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { useUploads } from '../context/UploadContext';
import CommentsReceivedPanel from '../components/CommentsReceivedPanel';
import type { CommentReceivedOut } from '../api/types';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import {
  DEFAULT_PROFILE_COLORS,
  ProfilePageColors,
  decodeStoredColors,
} from '../constants/profileColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Minimum height of the bio/comments carousel. The Artist Statement otherwise
// auto-sizes to its content; this floor guarantees the comments page (which
// always wants to show ~4 rows) isn't squished when a bio is very short.
// Bumped to give each comment row more vertical room while still showing 4.
// Floor for the artist-statement / comments carousel — sized to one line of
// statement text (page padding 20 + border 2 + label ~26 + divider ~9 + one
// 22px line). The box hugs its content and only grows once the statement wraps
// past a single line. On your own profile the statement shares this row height
// with the comments page, so a short statement also shortens that page (it still
// scrolls).
const BIO_PAGE_MIN_HEIGHT = 88;
// Visual gap between the two bordered pages of the carousel so the swipe feels
// like moving to a separate frame rather than sliding content under one.
const BIO_PAGE_GAP = 40;
// Horizontal inset of each bio page from the wrap edges. The wrap itself
// spans the screen (so pages can slide fully off-screen) — this padding
// keeps each page's framed border in the same visual position it had before.
const BIO_PAGE_INSET = 22;

type ProfileRoute = RouteProp<
  { UserProfile: { username: string; artId?: string; medium?: string } },
  'UserProfile'
>;

// --- Placeholder tile shown while an upload is in flight ---
function PendingPiece({ uri, title, aspectRatio, cardBg }: { uri: string; title: string; aspectRatio: number; cardBg: string }) {
  return (
    <View style={[styles.artElement, { backgroundColor: cardBg }]}>
      <View style={styles.artVisual}>
        <View style={[styles.artVisualInner, { aspectRatio }]}>
          <Image
            source={{ uri }}
            style={[styles.artImage, { opacity: 0.35 }]}
            contentFit="contain"
          />
          <View style={styles.pendingOverlay}>
            <Spinner size={64} />
          </View>
        </View>
      </View>
      <View style={styles.artDetails}>
        <Text style={styles.artTitle}>{title || 'uploading…'}</Text>
        <Text style={styles.artDetailText}>uploading…</Text>
      </View>
    </View>
  );
}

// --- Visual2DPiece sub-component ---
function Visual2DPiece({
  isOwner,
  piece,
  viewerBlockedByOwner,
  cardBg,
  onRemove,
  onEdit,
  onZoom,
  onLayout,
}: {
  isOwner: boolean;
  piece: Visual2DOut;
  viewerBlockedByOwner: boolean;
  // Art element fill from the owner's profile colors.
  cardBg: string;
  onRemove: () => void;
  onEdit: () => void;
  // Open the shared zoom viewer on this piece. Zoom state lives on the screen
  // so the viewer can swipe across all the profile's pieces.
  onZoom: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { token, currentUser } = useAuth();
  const webNav = useNavigation<any>();
  const webRoute = useRoute<any>();
  // Whose profile this piece renders on — the Me tab has no route param.
  const profileUsername = piece.username || webRoute.params?.username || currentUser || '';
  const [showComments, setShowComments] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // Start from the server-provided ratio captured at upload, but override it
  // with the image's real dimensions once it loads. A wrong/stale stored ratio
  // would otherwise letterbox the image (white bars) under contentFit:contain.
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);
  // The ratio we're confident about — stored, or measured from the thumbnail.
  // Null only for the brief moment before either is known; we hold the image
  // hidden until then so it never flashes at the wrong (square) shape.
  const knownRatio = measuredRatio ?? piece.aspect_ratio ?? null;
  const aspectRatio = knownRatio ?? 1;

  // Mid-res display derivative (~1600px) instead of the multi-MB original —
  // this is what kills the placeholder linger. On any load error (backend
  // predates the route, gen failed) fall back to the original, so this is safe
  // to ship before OR after the backend deploys.
  const [displayFailed, setDisplayFailed] = useState(false);

  const removeArt = async () => {
    await remove_visual_2d(piece.id, token);
    setShowRemoveConfirm(false);
    onRemove();
  };

  return (
    <>
      <ConfirmDialog
        visible={showRemoveConfirm}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={removeArt}
        onCancel={() => setShowRemoveConfirm(false)}
      />
      {showComments && (
        <ArtComments piece={piece} onClose={() => setShowComments(false)} />
      )}
      <View style={[styles.artElement, { backgroundColor: cardBg }]} onLayout={onLayout}>
        <Pressable
          style={({ pressed }) => [styles.artVisual, pressed && { opacity: 0.9 }]}
          onPress={onZoom}
        >
          <View style={[styles.artVisualInner, { aspectRatio }]}>
            <Image
              source={
                displayFailed
                  ? imageSource(piece.file_path)
                  : displaySource(piece.id, piece.file_path)
              }
              placeholder={thumbSource(piece.id, piece.file_path)}
              // Slower crossfade so the thumb→display change reads as a gentle
              // sharpen rather than a snap.
              transition={450}
              style={[styles.artImage, { opacity: knownRatio ? 1 : 0 }]}
              contentFit="contain"
              // Match the placeholder's fit to the image's. Its default is
              // 'scale-down' (and the source default is 'cover'), so without this
              // the thumb paints cropped/zoomed for a frame and then snaps to the
              // contained fit — the "starts zoomed then flashes" glitch.
              placeholderContentFit="contain"
              onError={() => setDisplayFailed(true)}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) setMeasuredRatio(width / height);
              }}
            />
          </View>
        </Pressable>
        <View style={styles.artDetails}>
          <View style={styles.titleRow}>
            <Text style={styles.artTitle}>{piece.title}</Text>
            {!!piece.date && (
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{piece.date}</Text>
              </View>
            )}
          </View>
          {!!piece.location && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/location.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>{piece.location}</Text>
            </View>
          )}
          {!!piece.song && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/music.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>
                {[piece.song, piece.song_artist].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          {!!piece.width && !!piece.height && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/dimensions.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>
                {piece.width}"x{piece.height}"
              </Text>
            </View>
          )}
          {/* Keywords temporarily hidden — data still flows through (filter
              bar, payloads); only the per-piece readout is suppressed for now.
              Restore by removing this comment wrapper. */}
          {false && piece.keywords && piece.keywords.length > 0 && (
            <Text style={styles.artDetailText}>
              <Text style={{ fontWeight: '700' }}>keywords: </Text>
              {piece.keywords.join(', ')}
            </Text>
          )}
          <View style={styles.artFooter}>
            {/* The existing action buttons flex to fill the row; the bookmark
                square is pinned to the right and always present, whether or not
                the comments button is shown. */}
            <View style={styles.artFooterMain}>
              {isOwner ? (
                <View style={styles.artButtons}>
                  <Pressable style={[styles.artBtn, styles.removeBtn]} onPress={() => setShowRemoveConfirm(true)}>
                    <Text style={styles.artBtnText}>remove</Text>
                  </Pressable>
                  {piece.comments_enabled && (
                    // Middle button flexes to fill the remaining width — paired
                    // with the row's stretch layout this puts the three buttons
                    // span the full art-element width with the same edge inset
                    // on both sides.
                    <Pressable
                      style={[styles.artBtn, styles.commentsBtn, styles.commentsBtnStretch, styles.commentsBtnIconWrap]}
                      onPress={() => setShowComments(true)}
                    >
                      <Image
                        source={require('../../assets/imgs/comment-bubble.png')}
                        style={styles.commentsBtnIcon}
                        contentFit="contain"
                      />
                    </Pressable>
                  )}
                  <Pressable style={[styles.artBtn, styles.editBtn]} onPress={onEdit}>
                    <Text style={styles.artBtnText}>edit</Text>
                  </Pressable>
                </View>
              ) : (
                piece.comments_enabled && currentUser && !viewerBlockedByOwner && (
                  // Single button when viewing someone else's piece — stretch to
                  // the full row width so it reads as the primary (only) action,
                  // matching the visual weight of the owner-side three-button row.
                  <Pressable
                    style={[styles.artBtn, styles.commentsBtn, styles.commentsBtnFull, styles.commentsBtnIconWrap]}
                    onPress={() => setShowComments(true)}
                  >
                    <Image
                      source={require('../../assets/imgs/comment-bubble.png')}
                      style={styles.commentsBtnIcon}
                      contentFit="contain"
                    />
                  </Pressable>
                )
              )}
            </View>
            {/* Charlie's hand-drawn web — opens the inspiration web centered
                on this piece. */}
            <Pressable
              style={({ pressed }) => [styles.artWebBtn, pressed && { transform: [{ scale: 0.95 }] }]}
              onPress={() => {
                registerArt({
                  kind: 'art',
                  id: piece.id,
                  title: piece.title,
                  // Per-member endpoints leave username/medium implicit in the
                  // URL, so the piece rows may not carry them — fall back to
                  // the profile context.
                  creator: profileUsername,
                  medium: piece.medium || '',
                  file_path: piece.file_path,
                  aspect_ratio: piece.aspect_ratio,
                  mine: isOwner,
                  artKind: 'visual',
                });
                (webNav as any).navigate('Web', { artId: piece.id });
              }}
              hitSlop={8}
            >
              <Image
                source={require('../../assets/imgs/web.png')}
                style={styles.artWebIcon}
                contentFit="contain"
              />
            </Pressable>
            <BookmarkButton artId={piece.id} size={32} style={styles.artBookmarkBtn} />
          </View>
        </View>
      </View>
    </>
  );
}

// Temp feature flag — hide the keyword dropdown without removing the wiring.
// Flip back to true when we want it surfaced again.
const SHOW_KEYWORDS_BAR = false;

// --- Main UserProfile screen ---
export default function UserProfile() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ProfileRoute>();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { currentUser, token } = useAuth();

  const params = route.params as { username?: string; artId?: string; medium?: string } | undefined;
  const username = params?.username || currentUser || '';
  const scrollToArtId = params?.artId;
  const mediumParam = params?.medium;

  const [profile, setProfile, error, loading, refetchProfile] = useProfile(username);
  // The owner's saved page colors (partial), merged over the app defaults.
  // Viewers get the owner's scheme too — it rides the profile payload.
  const pageColors: ProfilePageColors = useMemo(
    () => ({ ...DEFAULT_PROFILE_COLORS, ...decodeStoredColors(profile?.profile_colors) }),
    [profile?.profile_colors]
  );
  const [selectedMedium, setSelectedMedium] = useState<string | null>(mediumParam ?? null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [availableKeywords, setAvailableKeywords] = useState<string[]>([]);
  const [art, setArt] = useState<Visual2DOut[]>([]);
  const [writtenArt, setWrittenArt] = useState<WrittenFormOut[]>([]);
  const [audioArt, setAudioArt] = useState<AudioOut[]>([]);
  const [refresh, setRefresh] = useState(0);
  // Unread-messages dot on the owner's mail button. Polled while the profile
  // is focused; server counts messages newer than each thread's read cursor.
  const [unreadMessages, setUnreadMessages] = useState(0);
  // Admin-only: pending account + media requests → red dot on the settings gear.
  const adminPending = useAdminPending();

  useEffect(() => {
    if (!isFocused || !profile?.is_owner) return;
    let live = true;
    const check = () =>
      get_unread_count(token)
        .then((r) => { if (live) setUnreadMessages(r.unread); })
        .catch(() => {});
    check();
    const iv = setInterval(check, 15000);
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [isFocused, profile?.is_owner, token]);
  const [refreshing, setRefreshing] = useState(false);
  // Optimistic upload state + the upload triggers live in UploadContext so the
  // global "+" Add flow can fire an upload and have its placeholder/spinner tile
  // appear here once the user lands on this profile. `version` bumps on each
  // completed upload to refetch the grid.
  const {
    pendingPieces,
    pendingWritten,
    pendingAudio,
    version: uploadVersion,
  } = useUploads();
  // Captured from onLayout so each page of the bio/comments carousel can size
  // to match the container exactly (paging snaps cleanly to that width).
  const [bioPageWidth, setBioPageWidth] = useState(0);
  // The bio/comments carousel row height. This is measured ONLY from the artist
  // statement page (a stable content measurement, floored by a constant
  // minHeight so it can't feed back on itself) and then applied as a fixed
  // height to the comments page. The comments page's FlatList is unbounded, so
  // if we let the ScrollView's default `stretch` cross-axis alignment size the
  // row off the tallest child, the list's content height would drive the row —
  // and because the panel derived its own row height from that measurement, it
  // ran away and made the one-line statement box oscillate. Statement drives,
  // comments follow.
  const [bioPageHeight, setBioPageHeight] = useState(BIO_PAGE_MIN_HEIGHT);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchProfile();
      setRefresh((r) => r + 1);
    } catch {}
    setRefreshing(false);
  }, [refetchProfile]);
  const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
  const [editingWritten, setEditingWritten] = useState<WrittenFormOut | null>(null);
  const [editingAudio, setEditingAudio] = useState<AudioOut | null>(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [profileZoom, setProfileZoom] = useState(false);
  // Server mtime of the just-uploaded profile pic — busts the avatar's (otherwise
  // stable) cache key so a change shows immediately. Null until this session's
  // first upload; a natural refetch keeps whatever the server last returned.
  const [picBust, setPicBust] = useState<string | null>(null);
  // Index into filteredArt of the piece shown in the zoom viewer (null = closed).
  // Held here (not per-tile) so the viewer can swipe across the whole gallery.
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const handleAddMedia = useCallback(async (name: string) => {
    if (!profile) return;
    try {
      await add_member_media(username, name, token);
      setProfile({ ...profile, media: [...(profile.media ?? []), name] });
      setSelectedMedium(name);
      setSelectedKeywords([]);
    } catch (err: any) {
      appAlert('Error', err.message);
    }
  }, [profile, username, token]);

  const handleMediaVisibilityChange = useCallback((name: string, hiddenNow: boolean) => {
    if (!profile) return;
    const media = [...(profile.media ?? [])];
    const hidden = [...(profile.hidden_media ?? [])];
    if (hiddenNow) {
      const i = media.indexOf(name);
      if (i >= 0) media.splice(i, 1);
      if (!hidden.includes(name)) hidden.push(name);
    } else {
      const i = hidden.indexOf(name);
      if (i >= 0) hidden.splice(i, 1);
      if (!media.includes(name)) media.push(name);
    }
    setProfile({ ...profile, media, hidden_media: hidden });
    if (hiddenNow && selectedMedium === name) {
      setSelectedMedium(media[0] ?? null);
      setSelectedKeywords([]);
    }
  }, [profile, selectedMedium]);

  const pickAndUploadProfilePic = async () => {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      // Square crop so the pic fills the profile's 1:1 avatar box as framed.
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = asset.uri.split('/').pop() || 'pic.jpg';
    const type = asset.mimeType || 'image/jpeg';
    const res = await upload_profile_picture({ uri: asset.uri, name, type }, token);
    // The upload endpoint returns an UNSIGNED /static/profile path. Under the
    // member-only lockdown nginx rejects unsigned /static/profile URLs (403), so
    // showing that path directly fails — refetch the profile to get a SIGNED URL.
    // The signed URL drops the ?v=<mtime> tag, so grab the version here and pass
    // it as a cache-bust (see profilePicSource) or the old photo stays cached.
    // The zoom (if open) stays open: ArtZoomIn holds the old image until the
    // new one loads, then swaps in place.
    setPicBust(res.profile_pic_path?.match(/[?&]v=(\d+)/)?.[1] ?? String(Date.now()));
    await refetchProfile();
  };

  const scrollRef = useRef<ScrollView>(null);
  const artPositions = useRef<Record<string, number>>({});
  const artSectionY = useRef(0);
  const mediaBarY = useRef(0);
  const keywordsBarY = useRef(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(scrollToArtId ?? null);
  // A gallery tap can point at a piece that lives inside a collapsed series/
  // collection/album row. Once we resolve which row contains it, we retarget the
  // scroll to that row and (for gallery nav) auto-open it. `pendingOpenSeriesId`
  // flips the matching row's `autoOpen` after the scroll settles.
  const [pendingOpenSeriesId, setPendingOpenSeriesId] = useState<string | null>(null);
  // Only auto-open the collection for gallery navigation (a route artId). The
  // comments-panel tap reuses the same scroll mechanism but should just scroll.
  const autoOpenSeriesRef = useRef<boolean>(!!scrollToArtId);
  // The series row id to open once the scroll to it lands (set during resolution).
  const openAfterScrollRef = useRef<string | null>(null);

  // Scroll to a resolved target, then (if it's a series we deep-linked into)
  // open its collection once the scroll settles. Shared by the layout callback
  // and the already-laid-out fallback below.
  const finishPendingScroll = useCallback((y: number, id: string) => {
    scrollRef.current?.scrollTo({ y, animated: true });
    setPendingScroll(null);
    if (openAfterScrollRef.current === id) {
      openAfterScrollRef.current = null;
      setTimeout(() => setPendingOpenSeriesId(id), 350);
    }
  }, []);

  // Tap a row in the comments-received panel: route to that art piece by reusing
  // the existing scrollToArtId mechanism. Setting the medium triggers art refetch;
  // when the piece mounts and fires handleArtLayout, the page scrolls to it.
  const handleTapReceivedComment = useCallback((c: CommentReceivedOut) => {
    // Comments-panel taps scroll to the piece/row but don't pop the collection open.
    autoOpenSeriesRef.current = false;
    setSelectedMedium(c.art_medium);
    setSelectedKeywords([]);
    setPendingScroll(c.art_id);
  }, []);

  const handleKeywordFocus = useCallback(() => {
    // Put the keyword bar near the top of the visible area so it (and the
    // dropdown list underneath) stays in view when the keyboard pops up.
    const target = Math.max(0, mediaBarY.current + keywordsBarY.current - 20);
    // Delay so the keyboard has started animating up before we scroll.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }, 50);
  }, []);

  // The backend now returns media in a stable order — the owner's chosen tab
  // order (hold-and-drag) first, then alphabetical — identical across the
  // mount + focus refetch, so we render it as-is instead of re-sorting
  // alphabetically (which would override the custom order).
  const mediaTabs = useMemo(
    () => profile?.media ?? [],
    [profile?.media],
  );

  useEffect(() => {
    if (!mediumParam && mediaTabs[0]) {
      setSelectedMedium(mediaTabs[0]);
    }
  }, [mediaTabs, mediumParam]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (isFocused) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation, isFocused]);

  // Refresh the profile whenever this screen regains focus — e.g. after sharing
  // a piece (possibly to a previously-hidden medium), so its now-unhidden state
  // is reflected here instead of showing a stale local copy. refetchProfile
  // updates in the background (no loading flash).
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refetchProfile();
    });
    return unsubscribe;
  }, [navigation, refetchProfile]);

  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  useEffect(() => {
    get_media().then(setAllMedia).catch(() => {});
  }, []);
  const selectedMediumType = selectedMedium
    ? allMedia.find((m) => m.name === selectedMedium)?.type ?? null
    : null;
  const isV2d = selectedMediumType === 'visual_2d';
  const isWritten = selectedMediumType === 'written_form';
  const isAudio = selectedMediumType === 'audio';

  // Keep the medium tab in sync when navigated here with a medium param — e.g.
  // landing from the Add flow on the piece's medium, even if this profile was
  // already mounted on a different tab.
  useEffect(() => {
    if (mediumParam) setSelectedMedium(mediumParam);
  }, [mediumParam]);

  // Fetch art
  useEffect(() => {
    if (!selectedMedium || !username) return;
    if (isV2d) {
      get_members_visual_2d(username, selectedMedium)
        .then((data) => {
          setArt(data);
          setWrittenArt([]);
          setAudioArt([]);
          const unique = [...new Set(data.flatMap((p) => p.keywords ?? []))];
          setAvailableKeywords(unique);
        })
        .catch(() => {
          setArt([]);
          setWrittenArt([]);
          setAudioArt([]);
          setAvailableKeywords([]);
        });
    } else if (isWritten) {
      get_members_written_form(username, selectedMedium)
        .then((data) => {
          setWrittenArt(data);
          setArt([]);
          setAudioArt([]);
          const unique = [...new Set(data.flatMap((p) => p.keywords ?? []))];
          setAvailableKeywords(unique);
        })
        .catch(() => {
          setWrittenArt([]);
          setArt([]);
          setAudioArt([]);
          setAvailableKeywords([]);
        });
    } else if (isAudio) {
      get_members_audio(username, selectedMedium)
        .then((data) => {
          setAudioArt(data);
          setArt([]);
          setWrittenArt([]);
          const unique = [...new Set(data.flatMap((p) => p.keywords ?? []))];
          setAvailableKeywords(unique);
        })
        .catch(() => {
          setAudioArt([]);
          setArt([]);
          setWrittenArt([]);
          setAvailableKeywords([]);
        });
    } else {
      setArt([]);
      setWrittenArt([]);
      setAudioArt([]);
      setAvailableKeywords([]);
    }
  }, [username, selectedMedium, refresh, uploadVersion, isV2d, isWritten, isAudio]);

  const filteredArt = useMemo(() => {
    if (selectedKeywords.length === 0) return art;
    return art.filter((p) => selectedKeywords.every((k) => p.keywords?.includes(k)));
  }, [art, selectedKeywords]);

  const filteredWrittenArt = useMemo(() => {
    if (selectedKeywords.length === 0) return writtenArt;
    return writtenArt.filter((p) => selectedKeywords.every((k) => p.keywords?.includes(k)));
  }, [writtenArt, selectedKeywords]);

  const filteredAudioArt = useMemo(() => {
    if (selectedKeywords.length === 0) return audioArt;
    return audioArt.filter((p) => selectedKeywords.every((k) => p.keywords?.includes(k)));
  }, [audioArt, selectedKeywords]);

  // Group filtered written pieces into rows: standalone pieces render
  // individually, pieces sharing a series_id collapse into one SeriesRow.
  // A series' position in the list is set by its FIRST member's index, so
  // adding a new piece to a series doesn't reshuffle the feed.
  const writtenRows = useMemo(() => {
    type Row =
      | { kind: 'piece'; piece: WrittenFormOut }
      | { kind: 'series'; id: string; name: string; pieces: WrittenFormOut[] };
    const rows: Row[] = [];
    const seriesIndex = new Map<string, Extract<Row, { kind: 'series' }>>();
    for (const p of filteredWrittenArt) {
      if (p.series_id) {
        const existing = seriesIndex.get(p.series_id);
        if (existing) {
          existing.pieces.push(p);
        } else {
          const row: Extract<Row, { kind: 'series' }> = {
            kind: 'series',
            id: p.series_id,
            name: p.series_name ?? 'series',
            pieces: [p],
          };
          seriesIndex.set(p.series_id, row);
          rows.push(row);
        }
      } else {
        rows.push({ kind: 'piece', piece: p });
      }
    }
    return rows;
  }, [filteredWrittenArt]);

  // Same series collapsing for paintings — a series shows as one cover tile.
  const visualRows = useMemo(() => {
    type Row =
      | { kind: 'piece'; piece: Visual2DOut }
      | { kind: 'series'; id: string; name: string; pieces: Visual2DOut[] };
    const rows: Row[] = [];
    const seriesIndex = new Map<string, Extract<Row, { kind: 'series' }>>();
    for (const p of filteredArt) {
      if (p.series_id) {
        const existing = seriesIndex.get(p.series_id);
        if (existing) {
          existing.pieces.push(p);
        } else {
          const row: Extract<Row, { kind: 'series' }> = {
            kind: 'series',
            id: p.series_id,
            name: p.series_name ?? 'series',
            pieces: [p],
          };
          seriesIndex.set(p.series_id, row);
          rows.push(row);
        }
      } else {
        rows.push({ kind: 'piece', piece: p });
      }
    }
    return rows;
  }, [filteredArt]);

  // The zoom viewer opens over these same collapsed slots (solo pieces + series),
  // so swiping left/right in the viewer matches the grid. A series becomes one
  // vertical-scroll slot; its pieces are ordered like PaintingSeriesRow (explicit
  // order_index first, then fetch order).
  const visualElements = useMemo<CarouselElement[]>(
    () =>
      visualRows.map((row) =>
        row.kind === 'piece'
          ? { kind: 'piece', piece: { id: row.piece.id, file_path: row.piece.file_path } }
          : {
              kind: 'collection',
              pieces: [...row.pieces]
                .sort(
                  (a, b) =>
                    (a.order_index ?? Number.MAX_SAFE_INTEGER) -
                    (b.order_index ?? Number.MAX_SAFE_INTEGER),
                )
                .map((p) => ({ id: p.id, file_path: p.file_path })),
            },
      ),
    [visualRows],
  );

  // ...and for audio — an album shows as one tracklist tile.
  const audioRows = useMemo(() => {
    type Row =
      | { kind: 'piece'; piece: AudioOut }
      | { kind: 'series'; id: string; name: string; pieces: AudioOut[] };
    const rows: Row[] = [];
    const seriesIndex = new Map<string, Extract<Row, { kind: 'series' }>>();
    for (const p of filteredAudioArt) {
      if (p.series_id) {
        const existing = seriesIndex.get(p.series_id);
        if (existing) {
          existing.pieces.push(p);
        } else {
          const row: Extract<Row, { kind: 'series' }> = {
            kind: 'series',
            id: p.series_id,
            name: p.series_name ?? 'album',
            pieces: [p],
          };
          seriesIndex.set(p.series_id, row);
          rows.push(row);
        }
      } else {
        rows.push({ kind: 'piece', piece: p });
      }
    }
    return rows;
  }, [filteredAudioArt]);

  const handleArtLayout = useCallback((pieceId: string, e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y + artSectionY.current;
    artPositions.current[pieceId] = y;
    if (pendingScroll && pieceId === pendingScroll) {
      setTimeout(() => finishPendingScroll(y, pieceId), 300);
    }
  }, [pendingScroll, finishPendingScroll]);

  // A gallery/comments target can point at a piece that lives inside a collapsed
  // series row — only the row lays out (under its series id), never the piece,
  // so a piece-id scroll target would never match. Resolve it to the containing
  // row's id (and, for gallery nav, mark that row to auto-open once scrolled to).
  useEffect(() => {
    if (!pendingScroll) return;
    const seriesRows = isV2d ? visualRows : isWritten ? writtenRows : isAudio ? audioRows : [];
    for (const row of seriesRows) {
      if (row.kind === 'series' && row.pieces.some((p) => p.id === pendingScroll)) {
        if (autoOpenSeriesRef.current) openAfterScrollRef.current = row.id;
        setPendingScroll(row.id);
        return;
      }
    }
  }, [pendingScroll, visualRows, writtenRows, audioRows, isV2d, isWritten, isAudio]);

  // Fallback path: when the target row is already laid out (typical when it's in
  // the medium you're already viewing, or after the resolution above retargets
  // to an already-measured series row), handleArtLayout won't re-fire so it would
  // never consume pendingScroll. This scrolls directly using the cached y.
  useEffect(() => {
    if (!pendingScroll) return;
    const y = artPositions.current[pendingScroll];
    if (y == null) return;
    const t = setTimeout(() => finishPendingScroll(y, pendingScroll), 100);
    return () => clearTimeout(t);
  }, [pendingScroll, finishPendingScroll]);

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={[styles.loadingText, { paddingHorizontal: 24, textAlign: 'center' }]}>
          Sorry guys, the power source to the raspberry pi this app runs on is weak and it keeps dying. Will be getting it more power soon.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { paddingTop: insets.top, backgroundColor: pageColors.bg }]}
      contentContainerStyle={styles.contentContainer}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          // Hide the native spinner — we render a spinning groups.png overlay below.
          tintColor="transparent"
          colors={['transparent']}
        />
      }
    >
      {refreshing && (
        <View style={styles.refreshSpinnerOverlay} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}
      {/* Profile zoom — block lives on the back of this dialog for non-owners. */}
      {profileZoom && profile.profile_pic_path && (
        <ArtZoomIn
          isOwner={profile.is_owner}
          imgPath={profilePicSrc(profile) ?? profile.profile_pic_path}
          onClose={() => setProfileZoom(false)}
          onChangePic={profile.is_owner ? pickAndUploadProfilePic : undefined}
          blockableUsername={!profile.is_owner ? profile.username : undefined}
        />
      )}

      {/* Shared 2D-art zoom viewer: a paged carousel you can swipe through to
          see every piece in the current (filtered) medium without closing. */}
      {zoomIndex !== null && visualElements[zoomIndex] && (
        <ArtCarousel
          pieces={filteredArt}
          // Element mode: solo pieces + collections (vertical-scroll slots). The
          // index is into visualElements, matching the grid's collapsed order.
          elements={visualElements}
          initialIndex={zoomIndex}
          isOwner={profile.is_owner}
          creatorUsername={profile.username}
          // Just close — leave the profile scrolled where the user was when they
          // opened the viewer (no jump to the last-viewed piece).
          onClose={() => setZoomIndex(null)}
        />
      )}

      {/* Create now lives in the full-screen Add flow (the "+" tab / per-medium
          add button route to it). AddArtDialog is kept only for editing. */}
      {editingPiece && selectedMedium && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={() => setRefresh((r) => r + 1)}
          onClose={() => setEditingPiece(null)}
          onMoved={(newMedium) => {
            setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
            setSelectedMedium(newMedium);
            setSelectedKeywords([]);
          }}
          piece={editingPiece}
        />
      )}
      {editingWritten && selectedMedium && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={() => setRefresh((r) => r + 1)}
          onClose={() => setEditingWritten(null)}
          onMoved={(newMedium) => {
            setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
            setSelectedMedium(newMedium);
            setSelectedKeywords([]);
          }}
          writtenPiece={editingWritten}
        />
      )}
      {editingAudio && selectedMedium && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={() => setRefresh((r) => r + 1)}
          onClose={() => setEditingAudio(null)}
          onMoved={(newMedium) => {
            setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
            setSelectedMedium(newMedium);
            setSelectedKeywords([]);
          }}
          audioPiece={editingAudio}
        />
      )}
      {showAddMedia && (
        <AddMediaDialog
          shown={profile.media ?? []}
          hidden={profile.hidden_media ?? []}
          onAdd={handleAddMedia}
          onVisibilityChange={handleMediaVisibilityChange}
          onReorder={() => refetchProfile()}
          onClose={() => setShowAddMedia(false)}
        />
      )}
      <ShareMediaDialog
        visible={showShareDialog}
        username={username}
        media={profile.media ?? []}
        onClose={() => setShowShareDialog(false)}
      />

      {/* ---- UserDetails ---- */}
      <View style={styles.userDetails}>
        {/* Editing no longer happens inline — the pencil button routes to the
            EditProfile screen (details + color scheme tabs). */}
        <View style={styles.userFields}>
              <View style={styles.userTopRow}>
                <View style={styles.userIdentity}>
                  <Text style={[styles.userName, { color: pageColors.nameText }]}>
                    {profile.firstname} {profile.lastname}
                  </Text>
                  {(profile.city || profile.state) && (
                    <Text style={[styles.userLocation, { color: pageColors.nameText }]}>
                      {[profile.city, profile.state].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  {!profile.is_owner && !profile.viewer_blocked_by_owner && (
                    <View style={styles.ownerActions}>
                      <Pressable
                        style={[styles.ownerActionBtn, { backgroundColor: pageColors.actionBtn }]}
                        onPress={async () => {
                          try {
                            const convo = await open_dm(profile.username, token);
                            navigation.navigate('ConversationThread', {
                              conversationId: convo.id,
                              title: convo.title,
                              type: 'dm',
                              partnerUsername: convo.partner_username,
                            });
                          } catch (err: any) {
                            appAlert('Could not open messages', err?.message || 'try again');
                          }
                        }}
                      >
                        <Ionicons name="mail-outline" size={22} color={Colors.black} />
                      </Pressable>
                    </View>
                  )}
                  {profile.is_owner && (
                    <View style={styles.ownerActions}>
                      <Pressable
                        style={[styles.ownerActionBtn, { backgroundColor: pageColors.actionBtn }]}
                        onPress={() => navigation.navigate('Settings')}
                      >
                        <Ionicons name="settings-outline" size={22} color={Colors.black} />
                        {adminPending.total > 0 && <View style={styles.unreadDot} />}
                      </Pressable>
                      <Pressable
                        style={[styles.ownerActionBtn, { backgroundColor: pageColors.actionBtn }]}
                        onPress={() => navigation.navigate('EditProfile')}
                      >
                        <Ionicons name="pencil-outline" size={22} color={Colors.black} />
                      </Pressable>
                      <Pressable
                        style={[styles.ownerActionBtn, { backgroundColor: pageColors.actionBtn }]}
                        onPress={() => navigation.navigate('Messages')}
                      >
                        <Ionicons name="mail-outline" size={22} color={Colors.black} />
                        {unreadMessages > 0 && <View style={styles.unreadDot} />}
                      </Pressable>
                      <Pressable
                        style={[styles.ownerActionBtn, { backgroundColor: pageColors.actionBtn }]}
                        onPress={() => setShowShareDialog(true)}
                      >
                        <Ionicons name="paper-plane-outline" size={22} color={Colors.black} />
                      </Pressable>
                    </View>
                  )}
                </View>
                {profile.profile_pic_path ? (
                  <Pressable onPress={() => setProfileZoom(true)} style={styles.profilePicContainer}>
                    <Image
                      source={profilePicSource(profile, picBust) ?? { uri: '' }}
                      transition={200}
                      priority="high"
                      style={[styles.profilePic, { borderColor: pageColors.picFrame }]}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : profile.is_owner ? (
                  <Pressable onPress={pickAndUploadProfilePic} style={styles.profilePicContainer}>
                    <View style={[styles.profilePic, styles.profilePicEmpty, { borderColor: pageColors.picFrame }]}>
                      <Text style={styles.profilePicPlus}>add prof pic</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.profilePicContainer}>
                    <View style={[styles.profilePic, styles.profilePicEmpty, { borderColor: pageColors.picFrame }]} />
                  </View>
                )}
              </View>
              {/* Paged carousel: page 1 = artist statement, page 2 = comments
                  received. Only the user's OWN profile shows the comments page
                  (you can't see others' received-comments). The row height is
                  measured from the statement page (see bioPageHeight) and the
                  comments page is pinned to it — the comments FlatList is
                  unbounded, so it must never be allowed to drive the row. */}
              <View
                style={[styles.bioCarouselWrap, { minHeight: BIO_PAGE_MIN_HEIGHT }]}
                // Only update on a real width change. Firing setState on every
                // layout pass (incl. subpixel-identical ones) churned re-renders
                // and, combined with the width-0 first pass below, made the
                // statement box flash oversized then snap back.
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  setBioPageWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
                }}
              >
                {/* Each page keeps its prior visible inset (BIO_PAGE_INSET on
                    each side) via paddingHorizontal on the ScrollView's
                    contentContainer. The wrap itself is now screen-wide so
                    overflow:hidden clips at the screen edge, but the pages
                    themselves still look like before. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={Math.max(1, (bioPageWidth - BIO_PAGE_INSET * 2) + BIO_PAGE_GAP)}
                  snapToAlignment="start"
                  nestedScrollEnabled
                  // Only your own profile has a second (comments) page to swipe
                  // to — on everyone else's, lock it so the lone artist-statement
                  // card can't drag/bounce around.
                  scrollEnabled={profile.is_owner}
                  bounces={profile.is_owner}
                  // flex-start (not the default `stretch`) keeps each page at
                  // its own height so the unbounded comments FlatList can't
                  // stretch the statement page up to its content height.
                  contentContainerStyle={{ paddingHorizontal: BIO_PAGE_INSET, alignItems: 'flex-start' }}
                >
                  {/* Both pages wait for a real width. At the initial width of 0
                      the page width would be negative (clamped to 0) and the bio
                      text would wrap one character per line — a giant box that
                      then snapped small once onLayout resolved the width. */}
                  {bioPageWidth > 0 && (
                    <View
                      style={[styles.bioPage, { width: bioPageWidth - BIO_PAGE_INSET * 2, minHeight: BIO_PAGE_MIN_HEIGHT, marginRight: BIO_PAGE_GAP, backgroundColor: pageColors.statementBox }]}
                      // Sole height source for the carousel row. The constant
                      // minHeight floors it, so this measurement can't feed back
                      // on itself; the comments page below is pinned to the
                      // result rather than the other way around.
                      onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        setBioPageHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
                      }}
                    >
                      <Text style={styles.bioLabel}>Artist Statement</Text>
                      <View style={styles.bioHr} />
                      {!!profile.bio && <Text style={styles.bioText}>{profile.bio}</Text>}
                    </View>
                  )}
                  {profile.is_owner && bioPageWidth > 0 && (
                    <View style={[styles.bioPage, { width: bioPageWidth - BIO_PAGE_INSET * 2, height: bioPageHeight, padding: 0 }]}>
                      <CommentsReceivedPanel height={bioPageHeight} onTapComment={handleTapReceivedComment} />
                    </View>
                  )}
                </ScrollView>
              </View>
        </View>
      </View>

      {/* ---- MediaBar ---- */}
      <View
        style={styles.mediaBar}
        onLayout={(e) => { mediaBarY.current = e.nativeEvent.layout.y; }}
      >
        <View style={styles.mediaTabs}>
          {mediaTabs.map((m) => (
            <Pressable
              key={m}
              style={[
                styles.mediaTab,
                {
                  backgroundColor:
                    selectedMedium === m ? pageColors.mediaTabSelected : pageColors.mediaTab,
                },
              ]}
              onPress={() => {
                setSelectedMedium(m);
                setSelectedKeywords([]);
              }}
            >
              <Text style={styles.mediaTabText}>{m}</Text>
            </Pressable>
          ))}
          {profile.is_owner && (
            <Pressable
              style={[
                styles.addMediaBtn,
                { backgroundColor: pageColors.mediaTab },
                (profile.media?.length ?? 0) === 0 && styles.addMediaBtnFull,
              ]}
              onPress={() => setShowAddMedia(true)}
            >
              <Text style={styles.addMediaBtnText}>+/-</Text>
            </Pressable>
          )}
        </View>

        {/* Keywords sub-bar */}
        {SHOW_KEYWORDS_BAR && (
        <View
          style={styles.keywordsBar}
          onLayout={(e) => { keywordsBarY.current = e.nativeEvent.layout.y; }}
        >
            <View style={styles.keywordDropdown}>
              <Dropdown
                placeholder="keyword"
                options={availableKeywords.filter((k) => !selectedKeywords.includes(k))}
                onSelect={(k) => {
                  if (!selectedKeywords.includes(k)) {
                    setSelectedKeywords([...selectedKeywords, k]);
                  }
                }}
                onFocus={handleKeywordFocus}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.keywordBubbles}>
              {selectedKeywords.map((k) => (
                <View key={k} style={styles.keywordBubble}>
                  <Text style={styles.keywordBubbleText}>{k}</Text>
                  <Pressable
                    onPress={() => setSelectedKeywords(selectedKeywords.filter((sk) => sk !== k))}
                  >
                    <Text style={styles.keywordRemove}>x</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
        </View>
        )}
      </View>

      {/* ---- Art Section ---- */}
      <View
        style={[styles.artSection, { backgroundColor: pageColors.bg }]}
        onLayout={(e) => { artSectionY.current = e.nativeEvent.layout.y; }}
      >
        {/* Add now lives in the center "+" tab — no per-medium add button here. */}
        {selectedMedium && isV2d ? (
          <>
            {pendingPieces
              .filter((p) => p.medium === selectedMedium && p.username === username)
              .map((p) => (
                <PendingPiece
                  key={p.tempId}
                  uri={p.uri}
                  title={p.title}
                  aspectRatio={p.aspectRatio}
                  cardBg={pageColors.artCardBg}
                />
              ))}
            {visualRows.map((row, ri) =>
              row.kind === 'piece' ? (
                <Visual2DPiece
                  key={row.piece.id}
                  isOwner={profile.is_owner}
                  piece={row.piece}
                  viewerBlockedByOwner={!!profile.viewer_blocked_by_owner}
                  cardBg={pageColors.artCardBg}
                  onRemove={() => setRefresh((r) => r + 1)}
                  onEdit={() => setEditingPiece(row.piece)}
                  // Open the zoom viewer at this slot; it swipes across all
                  // visualElements (collapsed like the grid).
                  onZoom={() => setZoomIndex(ri)}
                  onLayout={(e) => handleArtLayout(row.piece.id, e)}
                />
              ) : (
                <PaintingSeriesRow
                  key={row.id}
                  isOwner={profile.is_owner}
                  seriesName={row.name}
                  pieces={row.pieces}
                  cardBg={pageColors.artCardBg}
                  selectedMedium={selectedMedium!}
                  username={username}
                  creatorUsername={profile.username}
                  onRefresh={() => setRefresh((r) => r + 1)}
                  onMediumMove={(newMedium) => {
                    setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
                    setSelectedMedium(newMedium);
                    setSelectedKeywords([]);
                  }}
                  onLayout={(e) => handleArtLayout(row.id, e)}
                  // Tapping the card opens the vertical-scroll zoom at this slot;
                  // the owner-only edit button (inside the card) opens the grid.
                  onOpenZoom={() => setZoomIndex(ri)}
                  autoOpen={pendingOpenSeriesId === row.id}
                  onAutoOpened={() => setPendingOpenSeriesId(null)}
                />
              )
            )}
          </>
        ) : selectedMedium && isWritten ? (
          <>
            {pendingWritten
              .filter((p) => p.medium === selectedMedium && p.username === username)
              .map((p) => (
                <View key={p.tempId} style={styles.pendingWrittenTile}>
                  <Text style={styles.artTitle}>{p.title}</Text>
                  <Text style={styles.artDetailText}>uploading…</Text>
                </View>
              ))}
            {writtenRows.map((row) =>
              row.kind === 'piece' ? (
                <WrittenFormPiece
                  key={row.piece.id}
                  isOwner={profile.is_owner}
                  piece={row.piece}
                  onRemove={() => setRefresh((r) => r + 1)}
                  onEdit={() => setEditingWritten(row.piece)}
                  onLayout={(e) => handleArtLayout(row.piece.id, e)}
                />
              ) : (
                <SeriesRow
                  key={row.id}
                  isOwner={profile.is_owner}
                  seriesId={row.id}
                  seriesName={row.name}
                  pieces={row.pieces}
                  selectedMedium={selectedMedium!}
                  username={username}
                  onRefresh={() => setRefresh((r) => r + 1)}
                  onMediumMove={(newMedium) => {
                    setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
                    setSelectedMedium(newMedium);
                    setSelectedKeywords([]);
                  }}
                  onLayout={(e) => handleArtLayout(row.id, e)}
                  autoOpen={pendingOpenSeriesId === row.id}
                  onAutoOpened={() => setPendingOpenSeriesId(null)}
                />
              )
            )}
          </>
        ) : selectedMedium && isAudio ? (
          <>
            {pendingAudio
              .filter((p) => p.medium === selectedMedium && p.username === username)
              .map((p) => (
                <View key={p.tempId} style={styles.pendingWrittenTile}>
                  <Text style={styles.artTitle}>{p.title}</Text>
                  <Text style={styles.artDetailText}>uploading…</Text>
                </View>
              ))}
            {audioRows.map((row) =>
              row.kind === 'piece' ? (
                <AudioPiece
                  key={row.piece.id}
                  isOwner={profile.is_owner}
                  piece={row.piece}
                  onRemove={() => setRefresh((r) => r + 1)}
                  onEdit={() => setEditingAudio(row.piece)}
                  onLayout={(e) => handleArtLayout(row.piece.id, e)}
                />
              ) : (
                <AlbumTile
                  key={row.id}
                  isOwner={profile.is_owner}
                  albumName={row.name}
                  pieces={row.pieces}
                  selectedMedium={selectedMedium!}
                  username={username}
                  onMediumMove={(newMedium) => {
                    setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
                    setSelectedMedium(newMedium);
                    setSelectedKeywords([]);
                  }}
                  onRefresh={() => setRefresh((r) => r + 1)}
                  onLayout={(e) => handleArtLayout(row.id, e)}
                  autoOpen={pendingOpenSeriesId === row.id}
                  onAutoOpened={() => setPendingOpenSeriesId(null)}
                />
              )
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>{selectedMedium} is empty atm</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  contentContainer: {
    // No bottom padding — the artSection owns the bottom of the page (with
    // its beige background). flexGrow:1 lets the artSection's flex:1 stretch
    // it down to the tab bar so the beige fills any leftover space.
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
  loadingText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },

  // UserDetails
  userDetails: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  userFields: {
    width: '100%',
    padding: 10,
  },
  userName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  userLocation: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  bioSection: {
    marginTop: 12,
    marginHorizontal: -8,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    padding: 10,
  },
  // Outer wrapper of the artist-statement <-> comments-received carousel.
  // Height is driven by the bio content auto-size (floored at
  // BIO_PAGE_MIN_HEIGHT) and applied inline by the renderer. The border moved
  // to each page so swiping reveals a fresh framed block instead of swapping
  // content inside one shared frame.
  bioCarouselWrap: {
    marginTop: 12,
    // Cancel out the surrounding paddings (userDetails paddingHorizontal: 20
    // + userFields padding: 10) so the carousel — and therefore the slide-off
    // clip boundary — reaches the actual screen edge. Pages now glide fully
    // off-screen instead of vanishing 30px before the edge.
    marginHorizontal: -30,
    overflow: 'hidden',
  },
  bioPage: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
  },
  bioLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 4,
  },
  bioHr: {
    height: 1,
    backgroundColor: '#000',
    marginBottom: 8,
  },
  bioText: {
    fontWeight: '300',
    lineHeight: 22,
  },
  ownerActions: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-start',
    // Grow to fill the identity column below the location line (the column
    // stretches to the profile pic's height), and center the buttons in that
    // space — vertically midway between the location and the pic bottom.
    flex: 1,
    alignItems: 'center',
  },
  ownerActionBtn: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.redBright,
  },
  userTopRow: {
    flexDirection: 'row',
    // Top-align the name/location with the top of the profile pic (rather than
    // centering, which dropped them when the row's left column got shorter).
    alignItems: 'flex-start',
    gap: 12,
  },
  userIdentity: {
    flex: 1,
    gap: 4,
    // Match the profile pic's height (userTopRow top-aligns children, which
    // would otherwise shrink-wrap this column) so the action row's flex:1
    // has the full pic-height space to center within.
    alignSelf: 'stretch',
  },
  profilePicContainer: {
    width: SCREEN_WIDTH * 0.32,
  },
  profilePic: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 5,
    borderColor: Colors.primaryGold,
    borderRadius: 5,
  },
  profilePicEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicPlus: {
    fontFamily: Fonts.serif,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },

  // MediaBar
  mediaBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    // The artist statement leaves ~20px of padding above the bar but there were
    // only 8px below the tabs, so the block sat low. Pull the bar up and grow
    // the bottom padding by the same amount: the tabs rise to sit evenly between
    // the statement and the border line, while the line itself stays put.
    marginTop: -10,
    paddingTop: 8,
    paddingBottom: 18,
    // Match the userDetails horizontal inset (20) so the media tabs align
    // with the artist-statement card above them.
    paddingHorizontal: 20,
  },
  mediaTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // space-between pushes each pair to both edges of the row so the right
    // tab reaches the right inset instead of leaving an ~8pt gap. The
    // configured rowGap still separates the two rows vertically.
    justifyContent: 'space-between',
    rowGap: 6,
    width: '100%',
  },
  mediaTab: {
    width: '48%',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mediaTabText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  addMediaBtn: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addMediaBtnFull: {
    width: '100%',
  },
  addMediaBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  keywordsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  keywordDropdown: {
    width: '25%',
    marginRight: 8,
  },
  keywordBubbles: {
    flexDirection: 'row',
  },
  keywordBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accentGolden,
    borderWidth: 2,
    borderColor: Colors.blue,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  keywordBubbleText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
    marginRight: 4,
  },
  keywordRemove: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  // Art Section
  artSection: {
    padding: 16,
    paddingBottom: 56,
    backgroundColor: Colors.mainBg,
    // flex:1 (paired with contentContainer's flexGrow:1) lets this view
    // stretch to fill any leftover vertical space — keeps the page bg
    // consistent down to the tab bar even with few pieces.
    flex: 1,
  },
  addBtn: {
    // Full-width bordered button — beige (matches the bottom nav bar) so
    // the add-art affordance reads as a utility chrome row, not content.
    height: 28,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '600',
    lineHeight: 18,
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    padding: 20,
  },

  // Art element
  artElement: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
    backgroundColor: '#fff',
  },
  artVisual: {
    width: '100%',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  artVisualInner: {
    width: '100%',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  pendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingWrittenTile: {
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 16,
    opacity: 0.7,
  },
  refreshSpinnerOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  artDetails: {
    paddingHorizontal: 4,
  },
  artTitle: {
    fontFamily: Fonts.serif,
    // ~2/3 of the original xxl (36 → 24) — still reads as a title but
    // less dominant than the artwork.
    fontSize: FontSizes.lg,
    // Take only the space left of the date badge and WRAP long titles —
    // unconstrained, a long title grew to content width and pushed the
    // badge off the row's right edge.
    flex: 1,
  },
  titleRow: {
    // Title left, date badge pinned to the right edge via marginLeft:'auto'
    // on the badge itself. Top-aligned so a wrapped multi-line title keeps
    // the badge beside its first line.
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  dateBadge: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 'auto',
    // Optically align with the title's first text line under flex-start.
    marginTop: 4,
  },
  dateBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textPrimary,
  },
  artDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  artDetailText: {
    fontSize: FontSizes.xs,
    marginBottom: 4,
  },
  artFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  artFooterMain: {
    // Holds the existing owner/viewer action buttons and absorbs the width the
    // bookmark square doesn't, so those buttons keep their full-width layout.
    flex: 1,
  },
  artWebBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  artWebIcon: {
    width: 24,
    height: 24,
  },
  artBookmarkBtn: {
    alignSelf: 'stretch',
  },
  artButtons: {
    flexDirection: 'row',
    gap: 8,
    // Span the full art-element width so the middle (comments) button's
    // flex:1 has somewhere to grow into.
    alignSelf: 'stretch',
  },
  artBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  artBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  editBtn: {
    // Same neutral cream as the comments button — no candy colors competing
    // with the artwork itself.
    backgroundColor: Colors.secondary,
  },
  commentsBtn: {
    backgroundColor: Colors.secondary,
  },
  // Icon variant of the comments button (Charlie's hand-drawn bubble).
  commentsBtnIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  commentsBtnIcon: {
    width: 26,
    height: 22,
  },
  commentsBtnFull: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  commentsBtnStretch: {
    // Inside the owner button row: flex:1 absorbs whatever width remove +
    // edit don't, centering the label between them.
    flex: 1,
    alignItems: 'center',
  },
  removeBtn: {
    backgroundColor: Colors.secondary,
  },
});
