import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  useWindowDimensions,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';
import { resolveImageUrl } from '../api';
import { Colors, Fonts } from '../constants/theme';

interface ArtZoomInProps {
  isOwner: boolean;
  imgPath: string;
  onClose: () => void;
  onChangePic?: () => void;
  initialAspect?: number;
}

export default function ArtZoomIn({ isOwner, imgPath, onClose, onChangePic, initialAspect }: ArtZoomInProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [flipped, setFlipped] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(
    initialAspect && initialAspect > 0 ? { w: initialAspect, h: 1 } : null
  );
  const rotateAnim = useRef(new RNAnimated.Value(0)).current;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const uri = resolveImageUrl(imgPath);

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  useEffect(() => {
    RNImage.getSize(uri, (w, h) => setImgSize({ w, h }), () => setImgSize({ w: 1, h: 1 }));
  }, [uri]);

  const flippedRef = useRef(false);
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

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(1, Math.min(5, next));
    })
    .onEnd(() => {
      if (scale.value <= 1.1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (savedScale.value > 1) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(5)
    .onEnd((_e, success) => {
      if (success && savedScale.value === 1) {
        runOnJS(handleFlip)();
      }
    });

  const outerGesture = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
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

  const maxW = screenW * 0.9;
  const maxH = screenH * 0.85;
  let displayW = 0;
  let displayH = 0;
  if (imgSize) {
    const ratio = imgSize.w / imgSize.h;
    if (ratio > maxW / maxH) {
      displayW = maxW;
      displayH = maxW / ratio;
    } else {
      displayH = maxH;
      displayW = maxH * ratio;
    }
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <View style={styles.blurOverlay} />
        </Pressable>
        <GestureDetector gesture={outerGesture}>
          <View style={styles.imageWrapper} pointerEvents="box-none" collapsable={false}>
            {imgSize && (
              <GestureDetector gesture={tap}>
                <Animated.View
                  style={[
                    {
                      width: displayW,
                      height: displayH,
                    },
                    animatedStyle,
                  ]}
                >
                  <RNAnimated.View
                    style={[
                      StyleSheet.absoluteFill,
                      { transform: [{ perspective: 1000 }, { rotateY: frontRotate }], backfaceVisibility: 'hidden' },
                    ]}
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  </RNAnimated.View>
                  <RNAnimated.View
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
                  </RNAnimated.View>
                </Animated.View>
              </GestureDetector>
            )}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  blurOverlay: {
    flex: 1,
  },
  imageWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
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
