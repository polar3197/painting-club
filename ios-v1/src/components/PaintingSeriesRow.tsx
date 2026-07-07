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
  useWindowDimensions,
  Alert,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  add_new_visual_2d,
  get_members_visual_2d,
  remove_visual_2d,
  rename_series,
  resolveImageUrl,
  set_series_order,
  thumbUrl,
  update_visual_2d,
  Visual2DIn,
  Visual2DOut,
} from '../api';
import ArtCarousel from './ArtCarousel';
import AddArtDialog from './AddArtDialog';
import ConfirmDialog from './ConfirmDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const GRID_COLS = 2;
const GRID_GAP = 14;
const SCREEN_PADDING = 16;

// Series order: explicit order_index first (nulls last), fetch order after —
// so the cover is piece 1 of the series, not whichever uploaded last.
function sortSeries(pieces: Visual2DOut[]): Visual2DOut[] {
  return [...pieces]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ao = a.p.order_index ?? Number.MAX_SAFE_INTEGER;
      const bo = b.p.order_index ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.i - b.i;
    })
    .map(({ p }) => p);
}

interface PaintingSeriesRowProps {
  isOwner: boolean;
  seriesName: string;
  pieces: Visual2DOut[];
  cardBg: string;
  // Threaded to the in-gallery edit dialog (same wiring as SeriesRow).
  selectedMedium: string;
  username: string;
  creatorUsername: string;
  onRefresh: () => void;
  onMediumMove?: (newMedium: string) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * A painting series as one post: renders like a normal painting tile using
 * the series' first piece as cover, plus a "1/N" stack badge and a
 * "series of N" caption. Tapping opens the series gallery modal.
 */
export default function PaintingSeriesRow({
  isOwner,
  seriesName,
  pieces,
  cardBg,
  selectedMedium,
  username,
  creatorUsername,
  onRefresh,
  onMediumMove,
  onLayout,
}: PaintingSeriesRowProps) {
  const ordered = sortSeries(pieces);
  const cover = ordered[0];
  const seriesId = pieces[0]?.series_id ?? null;
  const [open, setOpen] = useState(false);
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);
  const aspectRatio = measuredRatio ?? cover.aspect_ratio ?? 1;

  return (
    <>
      {open && seriesId && (
        <PaintingSeriesZoomIn
          isOwner={isOwner}
          seriesId={seriesId}
          seriesName={seriesName}
          pieces={ordered}
          selectedMedium={selectedMedium}
          username={username}
          creatorUsername={creatorUsername}
          onClose={() => setOpen(false)}
          onRefresh={onRefresh}
          onMediumMove={onMediumMove}
        />
      )}
      <View style={[styles.artElement, { backgroundColor: cardBg }]} onLayout={onLayout}>
        <Pressable
          style={({ pressed }) => [styles.artVisual, pressed && { opacity: 0.9 }]}
          onPress={() => setOpen(true)}
        >
          <View style={[styles.artVisualInner, { aspectRatio }]}>
            <Image
              source={{ uri: resolveImageUrl(cover.file_path) }}
              placeholder={{ uri: thumbUrl(cover.id) }}
              transition={200}
              style={styles.artImage}
              contentFit="contain"
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) setMeasuredRatio(width / height);
              }}
            />
          </View>
          <View style={styles.stackBadge}>
            <Text style={styles.stackBadgeText}>1/{ordered.length}</Text>
          </View>
        </Pressable>
        <View style={styles.artDetails}>
          <View style={styles.titleRow}>
            <Text style={styles.artTitle}>{seriesName}</Text>
          </View>
          <Text style={styles.seriesCaption}>
            series of {ordered.length}
          </Text>
        </View>
      </View>
    </>
  );
}

interface PaintingSeriesZoomInProps {
  isOwner: boolean;
  seriesId: string;
  seriesName: string;
  pieces: Visual2DOut[];
  selectedMedium: string;
  username: string;
  creatorUsername: string;
  onClose: () => void;
  onRefresh: () => void;
  onMediumMove?: (newMedium: string) => void;
}

/**
 * The series as a full-page editable entity: name up top (owner-renamable —
 * pieces only hold series_id, so every member's label follows), two-column
 * grid in series order with ◀▶ reordering, tap a piece for the zoom
 * carousel, owner edit/remove per piece, and an "add paintings" section
 * pulling in standalone pieces of the medium. Nested modals keep the grid
 * alive underneath, same pattern as the writing SeriesZoomIn.
 */
function PaintingSeriesZoomIn({
  isOwner,
  seriesId,
  seriesName,
  pieces,
  selectedMedium,
  username,
  creatorUsername,
  onClose,
  onRefresh,
  onMediumMove,
}: PaintingSeriesZoomInProps) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Visual2DOut | null>(null);
  // "+" in the header — upload a brand-new painting straight into this series.
  const [showAddNew, setShowAddNew] = useState(false);

  const handleCreateVisual = async (payload: Visual2DIn) => {
    try {
      await add_new_visual_2d(token, payload);
      onRefresh();
      loadStandalone();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'upload failed');
    }
  };

  // Rename
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(seriesName);

  // Optimistic order: applied instantly, confirmed by the parent refetch.
  const [localIds, setLocalIds] = useState<string[] | null>(null);
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  useEffect(() => {
    if (localIds && (localIds.length !== pieces.length || localIds.some((id) => !byId.has(id)))) {
      setLocalIds(null);
    }
  }, [pieces, byId, localIds]);
  const ordered = localIds
    ? (localIds.map((id) => byId.get(id)).filter(Boolean) as Visual2DOut[])
    : pieces;

  // Standalone paintings of this medium that can be pulled into the series.
  const [standalone, setStandalone] = useState<Visual2DOut[]>([]);
  const [addBusy, setAddBusy] = useState<string | null>(null);
  const loadStandalone = () => {
    if (!isOwner) return;
    get_members_visual_2d(username, selectedMedium)
      .then((all) => setStandalone(all.filter((p) => !p.series_id)))
      .catch(() => {});
  };
  useEffect(loadStandalone, [isOwner, username, selectedMedium, pieces.length]);

  const usableW = screenW - SCREEN_PADDING * 2;
  const cellW = (usableW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

  // ---- hold-and-drag reorder --------------------------------------------
  // One pan gesture over the whole grid, armed by a long press. Cells are
  // uniform (1-line titles), so grid position maps straight to index; the
  // grid reflows live as the finger crosses cell pitches and the order
  // commits on release.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const cellHRef = React.useRef(0);
  const orderRef = React.useRef<string[]>([]);
  orderRef.current = ordered.map((p) => p.id);
  const dragRef = React.useRef<{ id: string; lastTx: number; lastTy: number; moved: boolean } | null>(null);

  const commitOrder = async (ids: string[]) => {
    try {
      await set_series_order(seriesId, ids, token);
      onRefresh();
    } catch (err: any) {
      setLocalIds(null);
      Alert.alert('Error', err?.message || 'reorder failed');
    }
  };

  const pitchX = cellW + GRID_GAP;
  const dragPan = Gesture.Pan()
    .enabled(isOwner)
    .runOnJS(true)
    .activateAfterLongPress(300)
    .onStart((e) => {
      const pitchY = cellHRef.current + GRID_GAP;
      if (pitchY <= GRID_GAP) return;
      const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(e.x / pitchX)));
      const rowIdx = Math.max(0, Math.floor(e.y / pitchY));
      const idx = rowIdx * GRID_COLS + col;
      const ids = orderRef.current;
      if (idx >= ids.length) return;
      dragRef.current = { id: ids[idx], lastTx: 0, lastTy: 0, moved: false };
      setDraggingId(ids[idx]);
      setScrollEnabled(false);
    })
    .onUpdate((e) => {
      const st = dragRef.current;
      if (!st) return;
      const pitchY = cellHRef.current + GRID_GAP;
      const ids = [...orderRef.current];
      let i = ids.indexOf(st.id);
      if (i < 0) return;
      let changed = false;
      for (;;) {
        const dx = e.translationX - st.lastTx;
        const dy = e.translationY - st.lastTy;
        if (dy > pitchY * 0.6 && i + GRID_COLS < ids.length) {
          ids.splice(i + GRID_COLS, 0, ids.splice(i, 1)[0]);
          st.lastTy += pitchY;
          i += GRID_COLS;
          changed = true;
          continue;
        }
        if (-dy > pitchY * 0.6 && i - GRID_COLS >= 0) {
          ids.splice(i - GRID_COLS, 0, ids.splice(i, 1)[0]);
          st.lastTy -= pitchY;
          i -= GRID_COLS;
          changed = true;
          continue;
        }
        if (dx > pitchX * 0.6 && i < ids.length - 1) {
          ids.splice(i + 1, 0, ids.splice(i, 1)[0]);
          st.lastTx += pitchX;
          i += 1;
          changed = true;
          continue;
        }
        if (-dx > pitchX * 0.6 && i > 0) {
          ids.splice(i - 1, 0, ids.splice(i, 1)[0]);
          st.lastTx -= pitchX;
          i -= 1;
          changed = true;
          continue;
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
  // Confined to an edge strip so it can't collide with the hold-drag reorder.
  // The sheet follows the finger so the gesture reads.
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
        Animated.timing(slideX, { toValue: screenW, duration: 160, useNativeDriver: true }).start(
          () => onClose(),
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
    if (!name || name === seriesName) {
      setNameDraft(seriesName);
      return;
    }
    try {
      await rename_series(seriesId, name, token);
      onRefresh();
    } catch (err: any) {
      setNameDraft(seriesName);
      Alert.alert('Error', err?.message || 'rename failed');
    }
  };

  const addPiece = async (p: Visual2DOut) => {
    setAddBusy(p.id);
    try {
      await update_visual_2d(p.id, token, {
        title: p.title,
        series_name: nameDraft.trim() || seriesName,
      });
      onRefresh();
      loadStandalone();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'could not add');
    } finally {
      setAddBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await remove_visual_2d(pendingRemove.id, token);
    setPendingRemove(null);
    onRefresh();
    loadStandalone();
    // If that was the last piece the parent stops rendering this series on
    // the next refresh; no need to predict it here.
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      {zoomIndex !== null && ordered[zoomIndex] && (
        <ArtCarousel
          pieces={ordered}
          initialIndex={zoomIndex}
          isOwner={isOwner}
          creatorUsername={creatorUsername}
          onClose={() => setZoomIndex(null)}
        />
      )}
      {editingPiece && (
        // AddArtDialog is a transparent slide-up Modal; mounting it inside
        // this fullScreen modal keeps the gallery alive underneath.
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          piece={editingPiece}
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
          onCreate={handleCreateVisual}
          initialSeries={seriesName}
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
        <View style={styles.header}>
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
                setNameDraft(seriesName);
                setEditingName(true);
              }}
              hitSlop={6}
            >
              <Text style={styles.headerTitle} numberOfLines={2}>{seriesName}</Text>
            </Pressable>
          )}
          <Text style={styles.headerCount}>
            {ordered.length} piece{ordered.length === 1 ? '' : 's'}
          </Text>
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
        <ScrollView
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >
          <GestureDetector gesture={dragPan}>
            <View style={styles.grid}>
              {ordered.map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    {
                      width: cellW,
                      marginRight: (i + 1) % GRID_COLS === 0 ? 0 : GRID_GAP,
                      marginBottom: GRID_GAP,
                    },
                    draggingId === p.id && styles.cellDragging,
                  ]}
                  onLayout={i === 0 ? (e) => { cellHRef.current = e.nativeEvent.layout.height; } : undefined}
                >
                  <Pressable
                    style={({ pressed }) => [styles.cell, pressed && { opacity: 0.92 }]}
                    onPress={() => setZoomIndex(i)}
                  >
                    <Image
                      source={{ uri: resolveImageUrl(p.file_path) }}
                      placeholder={{ uri: thumbUrl(p.id) }}
                      transition={200}
                      style={[styles.cellImage, { width: cellW - 2, height: cellW - 2 }]}
                      contentFit="cover"
                    />
                  </Pressable>
                  {/* One-line titles keep every cell the same height, which the
                      drag's grid-pitch math depends on. */}
                  <Text style={styles.cellTitle} numberOfLines={1}>{p.title}</Text>
                  {isOwner && (
                    <View style={styles.cellButtons}>
                      <Pressable style={styles.btn} onPress={() => setEditingPiece(p)}>
                        <Text style={styles.btnText}>edit</Text>
                      </Pressable>
                      <Pressable style={styles.btn} onPress={() => setPendingRemove(p)}>
                        <Text style={styles.btnText}>remove</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </GestureDetector>

          {isOwner && standalone.length > 0 && (
            <View style={styles.addSection}>
              <Text style={styles.addHeading}>add paintings</Text>
              {standalone.map((p) => (
                <View key={p.id} style={styles.addRow}>
                  <Image
                    source={{ uri: thumbUrl(p.id) }}
                    style={styles.addThumb}
                    contentFit="cover"
                  />
                  <Text style={styles.addTitle} numberOfLines={1}>{p.title}</Text>
                  <Pressable
                    style={[styles.btn, addBusy === p.id && styles.btnDisabled]}
                    onPress={() => addBusy == null && addPiece(p)}
                    hitSlop={4}
                  >
                    <Text style={styles.btnText}>{addBusy === p.id ? '…' : '+ add'}</Text>
                  </Pressable>
                </View>
              ))}
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
  // Tile — mirrors the profile's Visual2DPiece so a series post reads as a
  // normal painting tile with a badge.
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
  stackBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stackBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.black,
  },
  artDetails: {
    paddingHorizontal: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  artTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  seriesCaption: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },

  // Gallery modal
  sheet: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: SCREEN_PADDING,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  headerTitle: {
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
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
  headerCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
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
  gridContent: {
    paddingTop: 14,
    paddingBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    marginBottom: 6,
  },
  cellImage: {
    backgroundColor: Colors.secondary,
  },
  cellTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  cellButtons: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  // The lifted cell while hold-dragging.
  cellDragging: {
    transform: [{ scale: 1.04 }],
    opacity: 0.9,
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
  addSection: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
  },
  addHeading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    marginBottom: 8,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  addThumb: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
  },
  addTitle: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
});
