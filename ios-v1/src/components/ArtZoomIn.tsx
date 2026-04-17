import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  Animated,
  useWindowDimensions,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import { resolveImageUrl } from '../api';
import { Colors, Fonts } from '../constants/theme';

interface ArtZoomInProps {
  isOwner: boolean;
  imgPath: string;
  onClose: () => void;
  onChangePic?: () => void;
}

function getDistance(touches: any[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function ArtZoomIn({ isOwner, imgPath, onClose, onChangePic }: ArtZoomInProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [flipped, setFlipped] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(1);
  const baseDist = useRef(0);
  const lastOffset = useRef({ x: 0, y: 0 });
  const isPinching = useRef(false);

  const uri = resolveImageUrl(imgPath);

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const flippedRef = useRef(false);
  const handleFlip = () => {
    const next = !flippedRef.current;
    flippedRef.current = next;
    setFlipped(next);
    Animated.timing(rotateAnim, {
      toValue: next ? 180 : 0,
      duration: 600,
      useNativeDriver: true,
    }).start();
  };

  const handleClose = () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    onClose();
  };

  const resetZoom = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    baseScale.current = 1;
    lastOffset.current = { x: 0, y: 0 };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          isPinching.current = true;
          baseDist.current = getDistance(evt.nativeEvent.touches);
          baseScale.current = (scale as any).__getValue();
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          isPinching.current = true;
          const dist = getDistance(touches);
          const newScale = Math.max(1, Math.min(5, baseScale.current * (dist / baseDist.current)));
          scale.setValue(newScale);
        } else if (touches.length === 1 && !isPinching.current && baseScale.current > 1) {
          translateX.setValue(lastOffset.current.x + gestureState.dx);
          translateY.setValue(lastOffset.current.y + gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const currentScale = (scale as any).__getValue();
        if (isPinching.current) {
          isPinching.current = false;
          baseScale.current = currentScale;
          if (currentScale <= 1.1) {
            resetZoom();
          }
        } else if (currentScale > 1) {
          lastOffset.current = {
            x: lastOffset.current.x + gestureState.dx,
            y: lastOffset.current.y + gestureState.dy,
          };
        } else {
          // Single tap at 1x = flip, unless they dragged
          if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
            handleFlip();
          }
        }
      },
    })
  ).current;

  const frontRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.darkenOverlay} />
      </Pressable>
      <View style={styles.imageWrapper} pointerEvents="box-none">
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            maxWidth: screenW * 0.9,
            maxHeight: screenH * 0.85,
            width: screenW * 0.9,
            aspectRatio: aspectRatio ?? 1,
            opacity: aspectRatio ? 1 : 0,
            transform: [{ scale }, { translateX }, { translateY }],
          }}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.cardFront,
              { transform: [{ perspective: 1000 }, { rotateY: frontRotate }], backfaceVisibility: 'hidden' },
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
          </Animated.View>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.cardBack,
              { transform: [{ perspective: 1000 }, { rotateY: backRotate }], backfaceVisibility: 'hidden' },
            ]}
          >
            {isOwner && onChangePic && (
              <Pressable
                style={styles.changePicBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onChangePic();
                }}
              >
                <Text style={styles.changePicBtnText}>change pic</Text>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  darkenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
});
