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
  Alert,
} from 'react-native';
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
import { resolveImageUrl, block_user, unblock_user, Visual2DOut } from '../api';
import { useAuth } from '../context/AuthContext';
import ReportDialog from './ReportDialog';
import ConfirmDialog from './ConfirmDialog';
import ContextPopup from './ContextPopup';
import { Colors, Fonts } from '../constants/theme';

// Horizontal inset of the artwork from each screen edge (per side). Bump for
// more margin; the page stays full-width so paging snap is unaffected.
const IMAGE_H_PAD = 18;

interface ArtCarouselProps {
  pieces: Visual2DOut[];
  initialIndex: number;
  isOwner: boolean;
  // Username of the profile these pieces belong to (used for block/unblock).
  creatorUsername: string;
  // Receives the index of the piece on screen when the viewer is dismissed, so
  // the profile can scroll to land on whatever you were last looking at.
  onClose: (lastIndex: number) => void;
}

/**
 * Full-screen swipeable viewer for a profile's 2D pieces. The outer horizontal
 * ScrollView pages between pieces (native momentum + snap, so a drag slides the
 * neighbor into frame and clicks into place). Each page is its OWN zoomable
 * ScrollView — iOS gives us pinch-to-zoom for free via maximumZoomScale, and
 * panning a zoomed image stays inside that page. While any page is zoomed we
 * disable the outer paging so a pan moves the image instead of changing pages.
 */
export default function ArtCarousel({ pieces, initialIndex, isOwner, creatorUsername, onClose }: ArtCarouselProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { token, currentUser, blockedUsernames, noteBlocked, noteUnblocked } = useAuth();

  const outerRef = useRef<ScrollView>(null);
  const didInit = useRef(false);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);

  const current = pieces[index];
  // The viewer is opened from someone's profile; reporting/blocking only makes
  // sense when it isn't yours and you're signed in.
  const canReport = !isOwner && !!currentUser && !!current;
  const blockUsername = !isOwner ? creatorUsername : undefined;
  const canBlock = !!blockUsername && !!currentUser;
  const isBlocked = blockUsername ? blockedUsernames.includes(blockUsername) : false;
  const showKebab = canReport || canBlock;

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
    if (i !== index && i >= 0 && i < pieces.length) setIndex(i);
  };

  // Close, handing back the piece currently on screen so the caller can sync.
  const dismiss = () => onClose(index);

  // Pull-down-to-dismiss. The vertical pan yields to horizontal paging
  // (failOffsetX) and is disabled while a page is zoomed so the zoom ScrollView
  // keeps its own vertical pan. The content slides down and the backdrop fades.
  const dragY = useSharedValue(0);
  const dismissPan = Gesture.Pan()
    .enabled(!zoomed)
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
      Alert.alert('Could not block', err?.message || 'try again');
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
      Alert.alert('Could not unblock', err?.message || 'try again');
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
              {pieces.map((p, i) => (
                <ZoomablePage
                  key={p.id}
                  uri={resolveImageUrl(p.file_path)}
                  width={screenW}
                  height={screenH}
                  active={i === index}
                  onZoomChange={setZoomed}
                />
              ))}
            </ScrollView>

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
  width,
  height,
  active,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const wasZoomed = useRef(false);

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
      contentContainerStyle={styles.pageContent}
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
        source={{ uri }}
        // Inset from the screen edges so wide pieces don't run full-bleed.
        // contentFit="contain" keeps every piece's own proportions; the page
        // itself stays screen-width so paging still snaps cleanly.
        style={{ width: width - IMAGE_H_PAD * 2, height }}
        contentFit="contain"
      />
    </ScrollView>
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
});
