import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
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
import { resolveImageUrl, block_user, unblock_user } from '../api';
import { useAuth } from '../context/AuthContext';
import ReportDialog from './ReportDialog';
import ConfirmDialog from './ConfirmDialog';
import ContextPopup from './ContextPopup';
import DeleteAccountDialog from './DeleteAccountDialog';
import { Colors, Fonts } from '../constants/theme';

interface ArtZoomInProps {
  isOwner: boolean;
  imgPath: string;
  onClose: () => void;
  onChangePic?: () => void;
  // Set when this is an art piece and the viewer is allowed to report it.
  reportArtId?: string;
  // Set when this is a profile pic and the viewer should be able to block the owner.
  blockableUsername?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

export default function ArtZoomIn({
  isOwner,
  imgPath,
  onClose,
  onChangePic,
  reportArtId,
  blockableUsername,
}: ArtZoomInProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const { token, currentUser, blockedUsernames, noteBlocked, noteUnblocked, logout } = useAuth();
  const [showReport, setShowReport] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const showDeleteAccount = isOwner && !!onChangePic && !!currentUser;

  const isBlocked = blockableUsername ? blockedUsernames.includes(blockableUsername) : false;
  const canReport = !isOwner && !!reportArtId && !!currentUser;
  const canBlock = !isOwner && !!blockableUsername && !!currentUser;
  const showKebab = canReport || canBlock;

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

  // Flip is a separate concern (inner face), kept on the legacy Animated API.
  const rotateAnim = useRef(new RNAnimated.Value(0)).current;
  const flippedRef = useRef(false);
  const [flipped, setFlipped] = useState(false);

  // Zoom transform (reanimated, UI-thread driven).
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const savedTranslationX = useSharedValue(0);
  const savedTranslationY = useSharedValue(0);

  // Image-local coords of the focal point at the moment pinch began.
  // Used to keep that exact pixel under the fingers' midpoint as scale changes.
  const focalImageX = useSharedValue(0);
  const focalImageY = useSharedValue(0);

  // Wrapper size — needed to clamp pan and to convert focal into center-origin coords.
  const wrapperW = useSharedValue(0);
  const wrapperH = useSharedValue(0);

  const uri = resolveImageUrl(imgPath);

  const contentWidth = screenW * 0.9;
  const contentHeight = aspectRatio ? contentWidth / aspectRatio : screenH * 0.85;
  const cappedHeight = Math.min(contentHeight, screenH * 0.85);
  const cappedWidth = aspectRatio ? Math.min(contentWidth, cappedHeight * aspectRatio) : contentWidth;

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const handleFlip = () => {
    const next = !flippedRef.current;
    flippedRef.current = next;
    setFlipped(next);
    RNAnimated.timing(rotateAnim, {
      toValue: next ? 180 : 0,
      duration: 600,
      useNativeDriver: true,
    }).start();
  };

  const handleClose = () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    onClose();
  };

  // --- Gestures ---

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      // Image-local coord (center origin) of the focal point.
      // Inverse of: screenX = center + imageX * savedScale + savedTranslation
      focalImageX.value =
        (e.focalX - wrapperW.value / 2 - savedTranslationX.value) / savedScale.value;
      focalImageY.value =
        (e.focalY - wrapperH.value / 2 - savedTranslationY.value) / savedScale.value;
    })
    .onUpdate((e) => {
      const newScale = savedScale.value * e.scale;
      scale.value = newScale;
      // Keep the grabbed image point under the (possibly moving) focal midpoint.
      const focalCenteredX = e.focalX - wrapperW.value / 2;
      const focalCenteredY = e.focalY - wrapperH.value / 2;
      translationX.value = focalCenteredX - focalImageX.value * newScale;
      translationY.value = focalCenteredY - focalImageY.value * newScale;
    })
    .onEnd(() => {
      let finalScale = scale.value;

      if (finalScale < MIN_SCALE) {
        // Spring back to 1x at center.
        scale.value = withSpring(MIN_SCALE);
        translationX.value = withSpring(0);
        translationY.value = withSpring(0);
        savedScale.value = MIN_SCALE;
        savedTranslationX.value = 0;
        savedTranslationY.value = 0;
        return;
      }

      if (finalScale > MAX_SCALE) {
        // Snap back to max, preserving focal-adjusted translation.
        // Approximate: rescale translation proportionally toward MAX_SCALE.
        const ratio = MAX_SCALE / finalScale;
        const nextX = translationX.value * ratio;
        const nextY = translationY.value * ratio;
        scale.value = withSpring(MAX_SCALE);
        translationX.value = withSpring(nextX);
        translationY.value = withSpring(nextY);
        finalScale = MAX_SCALE;
        savedScale.value = MAX_SCALE;
        savedTranslationX.value = nextX;
        savedTranslationY.value = nextY;
      } else {
        savedScale.value = finalScale;
        savedTranslationX.value = translationX.value;
        savedTranslationY.value = translationY.value;
      }

      // Clamp translation so image can't fly off the wrapper edges.
      const maxX = Math.max(0, (wrapperW.value * finalScale - wrapperW.value) / 2);
      const maxY = Math.max(0, (wrapperH.value * finalScale - wrapperH.value) / 2);
      const clampedX = Math.min(maxX, Math.max(-maxX, savedTranslationX.value));
      const clampedY = Math.min(maxY, Math.max(-maxY, savedTranslationY.value));
      if (clampedX !== savedTranslationX.value) {
        savedTranslationX.value = clampedX;
        translationX.value = withSpring(clampedX);
      }
      if (clampedY !== savedTranslationY.value) {
        savedTranslationY.value = clampedY;
        translationY.value = withSpring(clampedY);
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .onUpdate((e) => {
      if (savedScale.value <= 1.01) return; // no pan at 1x
      translationX.value = savedTranslationX.value + e.translationX;
      translationY.value = savedTranslationY.value + e.translationY;
    })
    .onEnd(() => {
      if (savedScale.value <= 1.01) return;
      // Clamp with spring rubber-band.
      const maxX = Math.max(0, (wrapperW.value * savedScale.value - wrapperW.value) / 2);
      const maxY = Math.max(0, (wrapperH.value * savedScale.value - wrapperH.value) / 2);
      const targetX = Math.min(maxX, Math.max(-maxX, translationX.value));
      const targetY = Math.min(maxY, Math.max(-maxY, translationY.value));
      translationX.value = withSpring(targetX, { damping: 20 });
      translationY.value = withSpring(targetY, { damping: 20 });
      savedTranslationX.value = targetX;
      savedTranslationY.value = targetY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((e, success) => {
      if (!success) return;
      if (savedScale.value > 1.01) {
        // Zoomed: reset to 1x.
        scale.value = withTiming(1, { duration: 220 });
        translationX.value = withTiming(0, { duration: 220 });
        translationY.value = withTiming(0, { duration: 220 });
        savedScale.value = 1;
        savedTranslationX.value = 0;
        savedTranslationY.value = 0;
      } else {
        // At identity: flip the card (owner's "change pic" affordance).
        runOnJS(handleFlip)();
      }
    });

  // Pinch and pan must coexist. Double-tap races both; it wins if it completes first.
  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
      { scale: scale.value },
    ],
  }));

  const frontRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={handleClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.darkenOverlay} />
        </Pressable>

        <View style={styles.imageWrapper} pointerEvents="box-none">
          <GestureDetector gesture={composed}>
            <Animated.View
              onLayout={(e) => {
                wrapperW.value = e.nativeEvent.layout.width;
                wrapperH.value = e.nativeEvent.layout.height;
              }}
              style={[
                {
                  width: cappedWidth,
                  height: aspectRatio ? cappedWidth / aspectRatio : cappedHeight,
                  opacity: aspectRatio ? 1 : 0,
                },
                animatedStyle,
              ]}
            >
              <RNAnimated.View
                style={[
                  StyleSheet.absoluteFill,
                  styles.cardFront,
                  {
                    transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
                    backfaceVisibility: 'hidden',
                  },
                ]}
              >
                <Image
                  source={{ uri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                  onLoad={(e) => {
                    const w = (e as any)?.source?.width;
                    const h = (e as any)?.source?.height;
                    if (w && h) setAspectRatio(w / h);
                  }}
                />
              </RNAnimated.View>
              <RNAnimated.View
                pointerEvents={flipped ? 'auto' : 'none'}
                style={[
                  StyleSheet.absoluteFill,
                  styles.cardBack,
                  {
                    transform: [{ perspective: 1000 }, { rotateY: backRotate }],
                    backfaceVisibility: 'hidden',
                  },
                ]}
              >
                {isOwner && onChangePic && (
                  <View style={styles.ownerActions}>
                    <Pressable
                      style={styles.changePicBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        onChangePic();
                      }}
                    >
                      <Text style={styles.changePicBtnText}>change pic</Text>
                    </Pressable>
                    {showDeleteAccount && (
                      <Pressable
                        style={styles.deleteAccountBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Text style={styles.deleteAccountBtnText}>delete account</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {showKebab && (
                  <Pressable
                    style={styles.backKebab}
                    onPress={(e: any) => {
                      e.stopPropagation?.();
                      setPopupAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                    }}
                    hitSlop={10}
                  >
                    <Text style={styles.backKebabText}>⋮</Text>
                  </Pressable>
                )}
              </RNAnimated.View>
            </Animated.View>
          </GestureDetector>
        </View>

        <ContextPopup
          visible={popupAnchor !== null}
          anchor={popupAnchor}
          onClose={() => setPopupAnchor(null)}
        >
          {canReport && (
            <Pressable
              style={({ pressed }) => [
                { paddingVertical: 10, paddingHorizontal: 14 },
                pressed && { backgroundColor: Colors.secondary },
              ]}
              onPress={() => {
                setPopupAnchor(null);
                setShowReport(true);
              }}
            >
              <Text style={{ fontFamily: Fonts.serif, fontSize: 15 }}>report</Text>
            </Pressable>
          )}
          {canBlock && (
            <Pressable
              style={({ pressed }) => [
                { paddingVertical: 10, paddingHorizontal: 14 },
                pressed && { backgroundColor: Colors.secondary },
              ]}
              onPress={() => {
                setPopupAnchor(null);
                if (isBlocked) setPendingUnblock(blockableUsername!);
                else setPendingBlock(blockableUsername!);
              }}
            >
              <Text style={{ fontFamily: Fonts.serif, fontSize: 15 }}>
                {isBlocked ? `unblock @${blockableUsername}` : `block @${blockableUsername}`}
              </Text>
            </Pressable>
          )}
        </ContextPopup>

        {reportArtId && (
          <ReportDialog
            visible={showReport}
            targetType="art"
            targetId={reportArtId}
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
        {showDeleteAccount && (
          <DeleteAccountDialog
            visible={showDeleteDialog}
            username={currentUser ?? ''}
            onClose={() => setShowDeleteDialog(false)}
            onDeleted={async () => {
              setShowDeleteDialog(false);
              onClose();
              await logout();
            }}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  darkenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  imageWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFront: {
    borderWidth: 1,
    borderColor: '#000',
  },
  cardBack: {
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerActions: {
    alignItems: 'center',
    gap: 10,
  },
  changePicBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.accentGolden,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  changePicBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 16,
  },
  deleteAccountBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.redCoral,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  deleteAccountBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    color: Colors.white,
  },
  backKebab: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backKebabText: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    color: Colors.textTertiary,
    fontWeight: '700',
  },
});
