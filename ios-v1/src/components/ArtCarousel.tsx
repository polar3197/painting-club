import React, { useRef, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { appAlert } from './AppAlert';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveImageUrl, stableCacheKey, thumbSource, displaySource, block_user, unblock_user } from '../api';
import { useAuth } from '../context/AuthContext';
import ReportDialog from './ReportDialog';
import ConfirmDialog from './ConfirmDialog';
import ContextPopup from './ContextPopup';
import { Colors, Fonts } from '../constants/theme';

// Horizontal inset of the artwork from each screen edge (per side). Bump for
// more margin; the page stays full-width so paging snap is unaffected.
const IMAGE_H_PAD = 18;

// Vertical bands reserved (below the safe-area insets) for the caption boxes so
// the image never reaches into them. The image is contained in the space left
// between these bands.
const TITLE_BAND = 80;
const NAME_BAND = 56;

export type CarouselPiece = { id: string; file_path: string };
// A horizontal slot in the viewer: a single piece, or a collection you scroll
// through vertically. Legacy callers pass `pieces` (all solo); the profile passes
// `elements` so its series collapse into one vertical-scroll slot.
export type CarouselElement =
  | { kind: 'piece'; piece: CarouselPiece }
  | { kind: 'collection'; pieces: CarouselPiece[] };

interface ArtCarouselProps {
  // Minimal shape so both profile pieces (Visual2DOut) and prompt submissions
  // (ArtResult) can be passed.
  pieces: CarouselPiece[];
  // When provided, drives the horizontal pager instead of `pieces`: collections
  // become one slot rendered as a vertical sub-pager. Absent => all solo.
  elements?: CarouselElement[];
  // Starting piece within the initial element, when it's a collection.
  initialPieceIndex?: number;
  initialIndex: number;
  isOwner: boolean;
  // Username of the profile these pieces belong to (used for block/unblock).
  // When the pieces have mixed creators (e.g. a prompt gallery), pass `captions`
  // instead — block/report then targets the current piece's creator.
  creatorUsername: string;
  onClose: () => void;
  // Optional per-piece caption: title shown above the image, creator below.
  // aspectRatio (w/h) lets the boxes hug the contain-fitted image's edges.
  captions?: { title: string; creator: string; aspectRatio?: number }[];
  // Hide the report/block kebab (e.g. the prompt gallery).
  hideKebab?: boolean;
}

/**
 * Full-screen swipeable viewer for a profile's 2D pieces. The outer horizontal
 * ScrollView pages between pieces (native momentum + snap, so a drag slides the
 * neighbor into frame and clicks into place). Each page is its OWN zoomable
 * ScrollView — iOS gives us pinch-to-zoom for free via maximumZoomScale, and
 * panning a zoomed image stays inside that page. While any page is zoomed we
 * disable the outer paging so a pan moves the image instead of changing pages.
 */
export default function ArtCarousel({ pieces, elements, initialPieceIndex, initialIndex, isOwner, creatorUsername, onClose, captions, hideKebab }: ArtCarouselProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { token, currentUser, blockedUsernames, noteBlocked, noteUnblocked } = useAuth();

  // Normalize to elements: legacy `pieces` become all-solo slots.
  const els: CarouselElement[] = elements ?? pieces.map((p) => ({ kind: 'piece', piece: p }));

  const outerRef = useRef<ScrollView>(null);
  const didInit = useRef(false);
  const [index, setIndex] = useState(initialIndex);
  // Active sub-piece within the current collection slot, and whether that slot is
  // scrolled to its top (solo slots are always "at top"). These gate pull-down
  // dismiss so it only fires from the top of a collection.
  const [subIndex, setSubIndex] = useState(initialPieceIndex ?? 0);
  const [atTop, setAtTop] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);

  const activeEl = els[index];
  const current =
    activeEl?.kind === 'collection'
      ? activeEl.pieces[Math.min(subIndex, activeEl.pieces.length - 1)]
      : activeEl?.piece;
  // The viewer is opened from someone's profile; reporting/blocking only makes
  // sense when it isn't yours and you're signed in.
  const canReport = !isOwner && !!currentUser && !!current;
  const blockUsername = !isOwner ? (captions?.[index]?.creator ?? creatorUsername) : undefined;
  const caption = captions?.[index];

  // Reserve fixed top/bottom bands for the caption boxes so the image is
  // contained in the middle region and the boxes never overlap it — whatever
  // the aspect ratio. Bands are only reserved when captions are shown.
  const imgTopInset = caption ? insets.top + TITLE_BAND : 0;
  const imgBottomInset = caption ? insets.bottom + NAME_BAND : 0;
  const canBlock = !!blockUsername && !!currentUser;
  const isBlocked = blockUsername ? blockedUsernames.includes(blockUsername) : false;
  const showKebab = (canReport || canBlock) && !hideKebab;

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
    if (i !== index && i >= 0 && i < els.length) {
      setIndex(i);
      // Landing on a new slot: reset to its top piece so a collection opens at 1/N
      // and pull-down dismiss is armed again.
      setSubIndex(0);
      setAtTop(true);
    }
  };

  const dismiss = onClose;

  // Pull-down-to-dismiss. The vertical pan yields to horizontal paging
  // (failOffsetX) and is disabled while a page is zoomed so the zoom ScrollView
  // keeps its own vertical pan. The content slides down and the backdrop fades.
  const dragY = useSharedValue(0);
  const dismissPan = Gesture.Pan()
    // Solo slots dismiss from anywhere; a collection only dismisses from its top
    // piece (otherwise a downward drag scrolls up within the collection).
    .enabled(!zoomed && atTop)
    // Activate as soon as the drag is even slightly downward, and bail to the
    // horizontal pager only if the movement is clearly sideways.
    .activeOffsetY(6)
    .failOffsetX([-12, 12])
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      // The slightest downward swipe dismisses — a tiny drag or any downward
      // flick is enough; anything less just snaps back.
      if (e.translationY > 24 || e.velocityY > 250) {
        dragY.value = withTiming(screenH, { duration: 200 }, () => runOnJS(dismiss)());
      } else {
        dragY.value = withSpring(0, { damping: 20 });
      }
    });

  // Tap anywhere on the image/letterbox to dismiss. Wraps only the pager
  // ScrollView, so the kebab + captions (rendered on top as siblings) keep
  // their own touches. Disabled while zoomed so a tap doesn't fight the zoom;
  // a horizontal drag pages and a pinch zooms (a discrete tap yields to both).
  const dismissTap = Gesture.Tap()
    .enabled(!zoomed)
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success) runOnJS(dismiss)();
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(dragY.value / 500, 0.7),
  }));

  const confirmBlock = async () => {
    if (!pendingBlock) return;
    const u = pendingBlock;
    setPendingBlock(null);
    try {
      await block_user(u, token);
      noteBlocked(u);
    } catch (err: any) {
      appAlert('Could not block', err?.message || 'try again');
    }
  };

  const confirmUnblock = async () => {
    if (!pendingUnblock) return;
    const u = pendingUnblock;
    setPendingUnblock(null);
    try {
      await unblock_user(u, token);
      noteUnblocked(u);
    } catch (err: any) {
      appAlert('Could not unblock', err?.message || 'try again');
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFillObject, backdropStyle]} pointerEvents="none">
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.darken} />
        </Animated.View>

        <GestureDetector gesture={dismissPan}>
          <Animated.View style={[styles.root, contentStyle]}>
            <GestureDetector gesture={dismissTap}>
              <ScrollView
                ref={outerRef}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed}
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: initialIndex * screenW, y: 0 }}
                onMomentumScrollEnd={onMomentumEnd}
                // Belt-and-suspenders: jump to the tapped piece once the strip has
                // laid out, in case the initial contentOffset didn't take.
                onLayout={() => {
                  if (!didInit.current) {
                    didInit.current = true;
                    if (initialIndex > 0) {
                      outerRef.current?.scrollTo({ x: initialIndex * screenW, animated: false });
                    }
                  }
                }}
                style={StyleSheet.absoluteFillObject}
              >
                {els.map((el, i) =>
                  el.kind === 'piece' ? (
                    <ZoomablePage
                      key={el.piece.id}
                      uri={resolveImageUrl(el.piece.file_path)}
                      // The 512px thumb is already cached from the grid/profile, so
                      // it paints instantly as a placeholder — swiping shows the
                      // soft thumb and sharpens to full-res instead of blank→pop.
                      thumb={thumbSource(el.piece.id, el.piece.file_path)}
                      display={displaySource(el.piece.id, el.piece.file_path)}
                      width={screenW}
                      height={screenH}
                      topInset={imgTopInset}
                      bottomInset={imgBottomInset}
                      active={i === index}
                      onZoomChange={setZoomed}
                    />
                  ) : (
                    <CollectionPage
                      key={el.pieces[0]?.id ?? `col-${i}`}
                      pieces={el.pieces}
                      width={screenW}
                      height={screenH}
                      active={i === index}
                      initialPieceIndex={i === initialIndex ? initialPieceIndex ?? 0 : 0}
                      onZoomChange={setZoomed}
                      onActiveChange={(sub, top) => {
                        if (i === index) {
                          setSubIndex(sub);
                          setAtTop(top);
                        }
                      }}
                    />
                  ),
                )}
              </ScrollView>
            </GestureDetector>

            {showKebab && (
              <Pressable
                style={styles.kebab}
                hitSlop={10}
                onPress={(e: any) =>
                  setPopupAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
                }
              >
                <Text style={styles.kebabText}>⋮</Text>
              </Pressable>
            )}

            {caption && !zoomed && (
              <>
                <View style={[styles.captionTop, { top: insets.top + 8 }]} pointerEvents="none">
                  <Text style={styles.captionTitle} numberOfLines={2}>{caption.title}</Text>
                </View>
                <View style={[styles.captionBox, { bottom: insets.bottom + 8 }]} pointerEvents="none">
                  <Text style={styles.captionCreator} numberOfLines={1}>{caption.creator}</Text>
                </View>
              </>
            )}
          </Animated.View>
        </GestureDetector>

        <ContextPopup
          visible={popupAnchor !== null}
          anchor={popupAnchor}
          onClose={() => setPopupAnchor(null)}
        >
          {canReport && (
            <Pressable
              style={({ pressed }) => [styles.popupItem, pressed && { backgroundColor: Colors.secondary }]}
              onPress={() => {
                setPopupAnchor(null);
                setShowReport(true);
              }}
            >
              <Text style={styles.popupText}>report</Text>
            </Pressable>
          )}
          {canBlock && (
            <Pressable
              style={({ pressed }) => [styles.popupItem, pressed && { backgroundColor: Colors.secondary }]}
              onPress={() => {
                setPopupAnchor(null);
                if (isBlocked) setPendingUnblock(blockUsername!);
                else setPendingBlock(blockUsername!);
              }}
            >
              <Text style={styles.popupText}>
                {isBlocked ? `unblock @${blockUsername}` : `block @${blockUsername}`}
              </Text>
            </Pressable>
          )}
        </ContextPopup>

        {current && (
          <ReportDialog
            visible={showReport}
            targetType="art"
            targetId={current.id}
            onClose={() => setShowReport(false)}
          />
        )}
        <ConfirmDialog
          visible={pendingBlock !== null}
          title={pendingBlock ? `block @${pendingBlock}?` : ''}
          message={
            pendingBlock
              ? `If you block @${pendingBlock}, they can no longer comment on your pieces. You'll still see anything they post elsewhere — in case they're talking about you in another comment section. If something more serious comes up, use the report button or reach out to Charlie directly.`
              : ''
          }
          confirmLabel="block"
          cancelLabel="nope"
          confirmColor={Colors.redLight}
          cancelColor={Colors.greenBright}
          onConfirm={confirmBlock}
          onCancel={() => setPendingBlock(null)}
        />
        <ConfirmDialog
          visible={pendingUnblock !== null}
          title={pendingUnblock ? `unblock @${pendingUnblock}?` : ''}
          message="They'll be able to comment on your pieces again."
          confirmLabel="unblock"
          cancelLabel="nope"
          confirmColor={Colors.greenBright}
          cancelColor={Colors.redLight}
          onConfirm={confirmUnblock}
          onCancel={() => setPendingUnblock(null)}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * One page: an iOS zoomable ScrollView wrapping the image. Reports its zoom
 * state up so the parent can freeze paging while zoomed. Resets to 1x whenever
 * it stops being the active page (so a stale zoom never blocks paging).
 */
function ZoomablePage({
  uri,
  thumb,
  display,
  width,
  height,
  topInset = 0,
  bottomInset = 0,
  active,
  onZoomChange,
}: {
  uri: string;
  thumb?: { uri: string; headers?: Record<string, string>; cacheKey?: string };
  // Mid-res (~1600px) display derivative — preferred over the original `uri`
  // for normal viewing since it lands 50-100x faster. On load error (backend
  // predates the route, gen failed) we fall back to the original, so callers
  // can pass it unconditionally regardless of backend version.
  display?: { uri: string; headers?: Record<string, string>; cacheKey?: string };
  width: number;
  height: number;
  topInset?: number;
  bottomInset?: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const wasZoomed = useRef(false);
  const [displayFailed, setDisplayFailed] = useState(false);
  const useDisplay = !!display && !displayFailed;

  // When this page scrolls offscreen, snap it back to 1x.
  React.useEffect(() => {
    if (!active && wasZoomed.current) {
      ref.current?.scrollResponderZoomTo?.({ x: 0, y: 0, width, height, animated: false });
      wasZoomed.current = false;
      onZoomChange(false);
    }
  }, [active, width, height, onZoomChange]);

  return (
    <ScrollView
      ref={ref}
      style={{ width, height }}
      contentContainerStyle={[styles.pageContent, { paddingTop: topInset, paddingBottom: bottomInset }]}
      minimumZoomScale={1}
      maximumZoomScale={4}
      bouncesZoom
      // Don't bounce/claim a vertical drag when the image fits (1x) — that's
      // what let the page eat the pull-down before the dismiss gesture could
      // activate. Scrolling a *zoomed* image still works (content > frame).
      alwaysBounceVertical={false}
      alwaysBounceHorizontal={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
      scrollEventThrottle={16}
      onScroll={(e) => {
        const z = e.nativeEvent.zoomScale > 1.01;
        if (z !== wasZoomed.current) {
          wasZoomed.current = z;
          onZoomChange(z);
        }
      }}
    >
      <Image
        source={useDisplay ? display : { uri, cacheKey: stableCacheKey(uri) }}
        // Cached 512px thumb shows immediately under the loading image, and
        // the crossfade (slower than the grid's) reads as a sharpen rather than a
        // snap when the display derivative (or fallback original) lands.
        placeholder={thumb}
        placeholderContentFit="contain"
        transition={450}
        onError={useDisplay ? () => setDisplayFailed(true) : undefined}
        // Inset from the screen edges so wide pieces don't run full-bleed.
        // contentFit="contain" keeps every piece's own proportions; the page
        // itself stays screen-width so paging still snaps cleanly. Height is the
        // screen minus the reserved caption bands so the image never overlaps them.
        style={{ width: width - IMAGE_H_PAD * 2, height: height - topInset - bottomInset }}
        contentFit="contain"
      />
    </ScrollView>
  );
}

/**
 * A collection slot: its pieces stacked as a full-height vertical pager. Opens at
 * the top (1/N), scroll down for the next; each piece keeps pinch-zoom. Reports
 * (subIndex, atTop) up so the parent arms pull-down dismiss only at the top piece.
 * Tap-to-dismiss (handled by the parent) stays available on every piece as a
 * guaranteed exit.
 */
function CollectionPage({
  pieces,
  width,
  height,
  active,
  initialPieceIndex,
  onZoomChange,
  onActiveChange,
}: {
  pieces: CarouselPiece[];
  width: number;
  height: number;
  active: boolean;
  initialPieceIndex: number;
  onZoomChange: (zoomed: boolean) => void;
  onActiveChange: (subIndex: number, atTop: boolean) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const [zoomedHere, setZoomedHere] = useState(false);
  const [sub, setSub] = useState(initialPieceIndex);
  const didInit = useRef(false);

  const scrollToInitial = () => {
    if (didInit.current) return;
    didInit.current = true;
    if (initialPieceIndex > 0) {
      ref.current?.scrollTo({ y: initialPieceIndex * height, animated: false });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.max(0, Math.min(pieces.length - 1, Math.round(y / height)));
    if (i !== sub) setSub(i);
    if (active) onActiveChange(i, y < 20);
  };

  // When this slot becomes the active one, re-report its real position (it may
  // have been left scrolled from a previous visit).
  React.useEffect(() => {
    if (active) onActiveChange(sub, sub === 0);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleZoom = (z: boolean) => {
    setZoomedHere(z);
    onZoomChange(z);
  };

  return (
    <View style={{ width, height }}>
      <ScrollView
        ref={ref}
        style={{ width, height }}
        pagingEnabled
        scrollEnabled={!zoomedHere}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={scrollToInitial}
      >
        {pieces.map((p, i) => (
          <ZoomablePage
            key={p.id}
            uri={resolveImageUrl(p.file_path)}
            thumb={thumbSource(p.id, p.file_path)}
            display={displaySource(p.id, p.file_path)}
            width={width}
            height={height}
            active={active && i === sub}
            onZoomChange={handleZoom}
          />
        ))}
      </ScrollView>

      {pieces.length > 1 && !zoomedHere && (
        <View style={styles.collMarker} pointerEvents="none">
          <Text style={styles.collMarkerText}>
            {Math.min(sub, pieces.length - 1) + 1}/{pieces.length}
          </Text>
        </View>
      )}

      {/* Blurred edge affordances hinting there's more of the collection above /
          below the current piece. */}
      {pieces.length > 1 && !zoomedHere && sub > 0 && (
        <BlurView intensity={22} tint="dark" style={styles.collPeekTop} pointerEvents="none" />
      )}
      {pieces.length > 1 && !zoomedHere && sub < pieces.length - 1 && (
        <BlurView intensity={22} tint="dark" style={styles.collPeekBottom} pointerEvents="none">
          <Text style={styles.collPeekChevron}>⌄</Text>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  darken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  // Collection viewer: n/N marker + blurred edge affordances.
  collMarker: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  collMarkerText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: '#fff',
  },
  collPeekTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    overflow: 'hidden',
  },
  collPeekBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  collPeekChevron: {
    fontFamily: Fonts.serif,
    fontSize: 26,
    lineHeight: 28,
    color: 'rgba(255,255,255,0.85)',
  },
  pageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kebab: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabText: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  popupItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  popupText: {
    fontFamily: Fonts.serif,
    fontSize: 15,
  },
  captionTop: {
    // Full width above the image (matches the image's side inset).
    position: 'absolute',
    left: IMAGE_H_PAD,
    right: IMAGE_H_PAD,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  captionBox: {
    // Creator pinned to the bottom-right, below the image.
    position: 'absolute',
    right: IMAGE_H_PAD,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  captionTitle: {
    fontFamily: Fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  captionCreator: {
    fontFamily: Fonts.serif,
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
