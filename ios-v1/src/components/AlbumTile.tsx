import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  LayoutChangeEvent,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { appAlert } from './AppAlert';
import * as ExpoAudio from 'expo-audio';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AudioIn,
  AudioOut,
  add_new_audio,
  remove_audio,
  rename_series,
  resolveImageUrl,
  set_series_order,
} from '../api';
import { AudioPlayerBar } from './AudioPiece';
import { playTrack, getActiveUri, subscribeActiveTrack } from '../audio/playback';
import { useAuth } from '../context/AuthContext';
import AddArtDialog from './AddArtDialog';
import BookmarkButton from './BookmarkButton';
import ConfirmDialog from './ConfirmDialog';
import Spinner from './Spinner';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const AUDIO_IS_STUB = (ExpoAudio as any).IS_STUB === true;

function fmtTime(sec: number | null): string {
  if (sec == null || !isFinite(sec) || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Album order: explicit order_index first (nulls last), then date as a
// fallback so pre-reorder albums still read sensibly.
function sortAlbum(pieces: AudioOut[]): AudioOut[] {
  return [...pieces].sort((a, b) => {
    const ao = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
}

interface AlbumTileProps {
  isOwner: boolean;
  albumName: string;
  pieces: AudioOut[];
  // Threaded to the full-page view's nested edit dialog.
  selectedMedium: string;
  username: string;
  onMediumMove?: (newMedium: string) => void;
  // Refetch audio pieces after any change inside the album view.
  onRefresh: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  // Set by the profile when a gallery tap landed on a track inside this album:
  // opens the album automatically once the row has scrolled into view.
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

/**
 * One album as one post — back-of-the-record-sleeve tracklist. Rows play in
 * place (the playing row swells into the full player bar) and playback
 * carries the album queue so tracks flow into the next and stop at the end.
 * All EDITING lives in the full-page view opened from the header: rename,
 * reorder, add songs, edit/delete tracks.
 */
export default function AlbumTile({
  isOwner,
  albumName,
  pieces,
  selectedMedium,
  username,
  onMediumMove,
  onRefresh,
  onLayout,
  autoOpen,
  onAutoOpened,
}: AlbumTileProps) {
  const [open, setOpen] = useState(false);

  // Open the album when the profile requests it (deep-link from the search
  // gallery). Cleared via onAutoOpened so it fires once, not on every render.
  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      onAutoOpened?.();
    }
  }, [autoOpen]);
  // Which row shows the full player bar. Tapping a title swaps it (closing
  // the previous one); tapping the open row's title collapses it. Playback
  // keeps the open row in step — starting or auto-advancing a track opens it.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ordered = sortAlbum(pieces);
  const queue = ordered.map((p) => resolveImageUrl(p.file_path));
  const seriesId = pieces[0]?.series_id ?? null;

  const orderedRef = React.useRef(ordered);
  orderedRef.current = ordered;
  useEffect(
    () =>
      subscribeActiveTrack(() => {
        const uri = getActiveUri();
        const match = orderedRef.current.find((p) => resolveImageUrl(p.file_path) === uri);
        if (match) setExpandedId(match.id);
      }),
    [],
  );

  return (
    <>
      {open && seriesId && (
        <AlbumZoomIn
          isOwner={isOwner}
          seriesId={seriesId}
          albumName={albumName}
          pieces={pieces}
          selectedMedium={selectedMedium}
          username={username}
          onMediumMove={onMediumMove}
          onClose={() => setOpen(false)}
          onRefresh={onRefresh}
        />
      )}
      <View style={styles.element} onLayout={onLayout}>
        <View style={styles.headerBar}>
          <Pressable
            style={({ pressed }) => [styles.headerRow, pressed && { opacity: 0.8 }]}
            onPress={() => setOpen(true)}
          >
            <Text style={styles.albumTitle} numberOfLines={2}>{albumName}</Text>
            <Text style={styles.trackCount}>
              {ordered.length} track{ordered.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.headerChevron}>›</Text>
          </Pressable>
          {/* Collection-level save: bookmarks every track on the album. */}
          <BookmarkButton artIds={ordered.map((p) => p.id)} size={30} />
        </View>
        <View style={styles.divider} />

        {AUDIO_IS_STUB && (
          <View style={styles.stubNote}>
            <Text style={styles.stubNoteText}>update the app to play audio</Text>
          </View>
        )}

        {ordered.map((p, i) => {
          const uri = queue[i];
          const expanded = !AUDIO_IS_STUB && expandedId === p.id;
          return (
            <View
              key={p.id}
              style={[styles.trackRow, i === ordered.length - 1 && styles.trackRowLast]}
            >
              <View style={styles.trackHeadRow}>
                <Text style={styles.trackNum}>{i + 1}</Text>
                <Pressable
                  style={styles.trackTitleCol}
                  onPress={() => setExpandedId(expanded ? null : p.id)}
                >
                  <Text style={styles.trackTitle} numberOfLines={1}>{p.title}</Text>
                  {!!p.artist && (
                    <Text style={styles.trackArtist} numberOfLines={1}>{p.artist}</Text>
                  )}
                </Pressable>
                {!expanded && (
                  <Text style={styles.trackDuration}>{fmtTime(p.duration_seconds)}</Text>
                )}
                {!expanded && !AUDIO_IS_STUB && (
                  <Pressable
                    style={({ pressed }) => [styles.rowPlayBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => playTrack(uri, undefined, queue)}
                    hitSlop={6}
                  >
                    <Text style={styles.rowPlayText}>▶</Text>
                  </Pressable>
                )}
              </View>
              {expanded && (
                <View style={styles.activeBarWrap}>
                  <AudioPlayerBar uri={uri} fallbackDuration={p.duration_seconds} queue={queue} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

interface AlbumZoomInProps {
  isOwner: boolean;
  seriesId: string;
  albumName: string;
  pieces: AudioOut[];
  selectedMedium: string;
  username: string;
  onMediumMove?: (newMedium: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * The album as a full-page editable entity. Owners can rename it (every
 * track's album label follows, since pieces only hold series_id), reorder
 * tracks by hold-drag, add new songs via the header "+", and edit/delete
 * tracks — the only place track editing lives. Fresh data flows back down
 * via props after each onRefresh, so the page never holds a stale copy.
 */
function AlbumZoomIn({
  isOwner,
  seriesId,
  albumName,
  pieces,
  selectedMedium,
  username,
  onMediumMove,
  onClose,
  onRefresh,
}: AlbumZoomInProps) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  // Which row shows the full player bar (tap a title to swap/collapse;
  // playback keeps it in step).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Rename
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(albumName);

  // Optimistic order: applied instantly, confirmed by the parent refetch.
  const [localIds, setLocalIds] = useState<string[] | null>(null);
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  useEffect(() => {
    // Membership changed (add/remove) → drop the local override.
    if (localIds && (localIds.length !== pieces.length || localIds.some((id) => !byId.has(id)))) {
      setLocalIds(null);
    }
  }, [pieces, byId, localIds]);

  const ordered = localIds
    ? (localIds.map((id) => byId.get(id)).filter(Boolean) as AudioOut[])
    : sortAlbum(pieces);
  const queue = ordered.map((p) => resolveImageUrl(p.file_path));

  const zOrderedRef = React.useRef(ordered);
  zOrderedRef.current = ordered;
  useEffect(
    () =>
      subscribeActiveTrack(() => {
        const uri = getActiveUri();
        const match = zOrderedRef.current.find((p) => resolveImageUrl(p.file_path) === uri);
        if (match) setExpandedId(match.id);
      }),
    [],
  );

  const [editingPiece, setEditingPiece] = useState<AudioOut | null>(null);
  const [pendingRemove, setPendingRemove] = useState<AudioOut | null>(null);
  // "+" in the header — upload a brand-new song straight into this album.
  const [showAddNew, setShowAddNew] = useState(false);
  // Header pencil toggles edit mode; per-track edit/delete only show then.
  const [editMode, setEditMode] = useState(false);
  // Placeholder spinner row shown from submit until the new track lands in
  // the pieces prop (upload + parent refetch).
  const [uploading, setUploading] = useState(false);
  const prevCountRef = React.useRef(pieces.length);
  useEffect(() => {
    if (pieces.length !== prevCountRef.current) {
      prevCountRef.current = pieces.length;
      setUploading(false);
    }
  }, [pieces.length]);
  useEffect(() => {
    if (!uploading) return;
    // Backstop so a failed refetch can't spin forever.
    const timer = setTimeout(() => setUploading(false), 30000);
    return () => clearTimeout(timer);
  }, [uploading]);

  const handleCreateAudio = async (payload: AudioIn) => {
    setUploading(true);
    try {
      await add_new_audio(token, payload);
      onRefresh();
    } catch (err: any) {
      setUploading(false);
      appAlert('Error', err?.message || 'upload failed');
    }
  };

  // ---- hold-and-drag reorder --------------------------------------------
  // One pan gesture over the whole tracklist, armed by a long press. The
  // touched row lifts (highlight), rows reflow live as the finger crosses
  // neighbours (step accumulator against measured row heights), and the
  // final order commits on release.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const heightsRef = React.useRef<Map<string, number>>(new Map());
  const orderRef = React.useRef<string[]>([]);
  orderRef.current = ordered.map((p) => p.id);
  const dragRef = React.useRef<{ id: string; lastTy: number; moved: boolean } | null>(null);

  const commitOrder = async (ids: string[]) => {
    try {
      await set_series_order(seriesId, ids, token);
      onRefresh();
    } catch (err: any) {
      setLocalIds(null);
      appAlert('Error', err?.message || 'reorder failed');
    }
  };

  const dragPan = Gesture.Pan()
    .enabled(isOwner)
    .runOnJS(true)
    .activateAfterLongPress(300)
    .onStart((e) => {
      const ids = orderRef.current;
      let acc = 0;
      let idx = -1;
      for (let i = 0; i < ids.length; i++) {
        const h = heightsRef.current.get(ids[i]) ?? 60;
        if (e.y < acc + h) { idx = i; break; }
        acc += h;
      }
      if (idx < 0) return;
      dragRef.current = { id: ids[idx], lastTy: 0, moved: false };
      setDraggingId(ids[idx]);
      setScrollEnabled(false);
    })
    .onUpdate((e) => {
      const st = dragRef.current;
      if (!st) return;
      const ids = [...orderRef.current];
      let i = ids.indexOf(st.id);
      if (i < 0) return;
      let changed = false;
      for (;;) {
        const delta = e.translationY - st.lastTy;
        if (delta > 0 && i < ids.length - 1) {
          const nextH = heightsRef.current.get(ids[i + 1]) ?? 60;
          if (delta > nextH * 0.6) {
            ids.splice(i + 1, 0, ids.splice(i, 1)[0]);
            st.lastTy += nextH;
            i++;
            changed = true;
            continue;
          }
        } else if (delta < 0 && i > 0) {
          const prevH = heightsRef.current.get(ids[i - 1]) ?? 60;
          if (-delta > prevH * 0.6) {
            ids.splice(i - 1, 0, ids.splice(i, 1)[0]);
            st.lastTy -= prevH;
            i--;
            changed = true;
            continue;
          }
        }
        break;
      }
      if (changed) {
        st.moved = true;
        orderRef.current = ids;
        setLocalIds(ids);
      }
    })
    .onEnd(() => {
      const st = dragRef.current;
      if (st?.moved) commitOrder(orderRef.current);
    })
    .onFinalize(() => {
      dragRef.current = null;
      setDraggingId(null);
      setScrollEnabled(true);
    });

  // Swipe right from the left edge to leave — replaces the close button.
  // Confined to an edge strip so it can't collide with the scrubber or the
  // hold-drag reorder. The sheet follows the finger so the gesture reads.
  const { width: winW } = useWindowDimensions();
  const slideX = React.useRef(new Animated.Value(0)).current;
  const backSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX(15)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      slideX.setValue(Math.max(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX > 60) {
        Animated.timing(slideX, { toValue: winW, duration: 160, useNativeDriver: true }).start(() =>
          onClose(),
        );
      } else {
        Animated.spring(slideX, { toValue: 0, friction: 8, useNativeDriver: true }).start();
      }
    })
    .onFinalize((e) => {
      if (e.translationX <= 60) {
        Animated.spring(slideX, { toValue: 0, friction: 8, useNativeDriver: true }).start();
      }
    });

  const saveName = async () => {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!name || name === albumName) {
      setNameDraft(albumName);
      return;
    }
    try {
      await rename_series(seriesId, name, token);
      onRefresh();
    } catch (err: any) {
      setNameDraft(albumName);
      appAlert('Error', err?.message || 'rename failed');
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await remove_audio(pendingRemove.id, token);
    setPendingRemove(null);
    onRefresh();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      {editingPiece && (
        // Nested transparent modal — the album page stays alive underneath.
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          audioPiece={editingPiece}
          onSuccess={onRefresh}
          onClose={() => setEditingPiece(null)}
          onMoved={onMediumMove}
        />
      )}
      {showAddNew && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={onRefresh}
          onClose={() => setShowAddNew(false)}
          onCreateAudio={handleCreateAudio}
          initialSeries={albumName}
        />
      )}
      <ConfirmDialog
        visible={!!pendingRemove}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
      <Animated.View
        style={[
          styles.sheet,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
          { transform: [{ translateX: slideX }] },
        ]}
      >
        <View style={styles.zoomHeader}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={saveName}
                onBlur={saveName}
              />
            </View>
          ) : (
            // Owners just tap the title to rename — the field takes over in
            // place and saves on done/blur.
            <Pressable
              style={styles.nameRow}
              disabled={!isOwner}
              onPress={() => {
                setNameDraft(albumName);
                setEditingName(true);
              }}
              hitSlop={6}
            >
              <Text style={styles.zoomTitle} numberOfLines={2}>{albumName}</Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable
              style={({ pressed }) => [
                styles.xBtn,
                editMode && styles.headerBtnActive,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setEditMode((v) => !v)}
              hitSlop={8}
            >
              <Text style={styles.xBtnText}>✎</Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.xBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAddNew(true)}
              hitSlop={8}
            >
              <Text style={styles.xBtnText}>+</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.zoomSubtitle}>
          {ordered.length} track{ordered.length === 1 ? '' : 's'}
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.zoomContent}
          scrollEnabled={scrollEnabled}
        >
          <GestureDetector gesture={dragPan}>
            <View>
              {ordered.map((p, i) => {
                const uri = queue[i];
                const expanded = !AUDIO_IS_STUB && expandedId === p.id;
                return (
                  <View
                    key={p.id}
                    style={[styles.zoomTrackRow, draggingId === p.id && styles.rowDragging]}
                    onLayout={(e) => heightsRef.current.set(p.id, e.nativeEvent.layout.height)}
                  >
                    <View style={styles.trackHeadRow}>
                      <Text style={styles.trackNum}>{i + 1}</Text>
                      <Pressable
                        style={styles.trackTitleCol}
                        onPress={() => setExpandedId(expanded ? null : p.id)}
                      >
                        <Text style={styles.trackTitle} numberOfLines={1}>{p.title}</Text>
                        {!!p.artist && (
                          <Text style={styles.trackArtist} numberOfLines={1}>{p.artist}</Text>
                        )}
                      </Pressable>
                      {!expanded && (
                        <Text style={styles.trackDuration}>{fmtTime(p.duration_seconds)}</Text>
                      )}
                      {!expanded && !AUDIO_IS_STUB && (
                        <Pressable
                          style={({ pressed }) => [styles.rowPlayBtn, pressed && { opacity: 0.7 }]}
                          onPress={() => playTrack(uri, undefined, queue)}
                          hitSlop={6}
                        >
                          <Text style={styles.rowPlayText}>▶</Text>
                        </Pressable>
                      )}
                      <BookmarkButton artId={p.id} size={28} />
                    </View>
                    {expanded && (
                      <View style={styles.activeBarWrap}>
                        <AudioPlayerBar uri={uri} fallbackDuration={p.duration_seconds} queue={queue} />
                      </View>
                    )}
                    {isOwner && editMode && (
                      <View style={styles.ownerRow}>
                        <Pressable style={styles.smallBtn} onPress={() => setEditingPiece(p)} hitSlop={4}>
                          <Text style={styles.smallBtnText}>edit</Text>
                        </Pressable>
                        <Pressable style={styles.smallBtn} onPress={() => setPendingRemove(p)} hitSlop={4}>
                          <Text style={styles.smallBtnText}>delete</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </GestureDetector>

          {uploading && (
            <View style={styles.uploadingRow}>
              <Spinner size={26} />
            </View>
          )}
        </ScrollView>
        <GestureDetector gesture={backSwipe}>
          <View style={styles.edgeSwipe} />
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  element: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
    backgroundColor: '#fff',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  albumTitle: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  trackCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  headerChevron: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: '#000',
    marginTop: 8,
    marginBottom: 4,
  },
  stubNote: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#000',
    opacity: 0.45,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  stubNoteText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
  trackRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  trackRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  trackHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackNum: {
    width: 16,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  rowPlayBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPlayText: {
    fontSize: 11,
    color: Colors.black,
  },
  trackTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  trackArtist: {
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
  },
  trackDuration: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  activeBarWrap: {
    marginTop: 8,
  },

  // Full-page album view
  sheet: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 16,
  },
  zoomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    paddingVertical: 2,
  },
  zoomTitle: {
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  zoomSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    paddingTop: 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  zoomContent: {
    paddingTop: 10,
    paddingBottom: 24,
  },
  zoomTrackRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  // The lifted row while hold-dragging.
  rowDragging: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    borderBottomColor: '#000',
    paddingHorizontal: 6,
    transform: [{ scale: 1.02 }],
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  uploadingRow: {
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerBtnActive: {
    backgroundColor: Colors.primaryGold,
  },
  // Invisible left-edge strip that hosts the swipe-back gesture.
  edgeSwipe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 28,
    zIndex: 50,
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  smallBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
  },
  xBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 20,
    color: Colors.black,
  },
});
