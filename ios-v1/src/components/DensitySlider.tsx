import React, { useRef, useState, useEffect } from 'react';
import { View, Animated, PanResponder, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Colors } from '../constants/theme';

const THUMB = 22;
const TRACK_H = 4;

// Continuous-drag slider: the thumb slides freely with the finger (it never snaps
// or catches on a stop), but the emitted value is one of the discrete column
// counts. The LEFT end is `max` (most columns / smallest tiles), the RIGHT end is
// 1. JS-only (PanResponder + RN Animated) so it runs on any build.
export default function DensitySlider({
  value,
  max,
  onChange,
}: {
  value: number; // current column target, 1..max
  max: number; // leftmost value (the formula cap, e.g. 4)
  onChange: (v: number) => void;
}) {
  const [trackW, setTrackW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  // Live geometry/value/position for the (once-created) PanResponder.
  const usableRef = useRef(0);
  const maxRef = useRef(max);
  maxRef.current = max;
  const valueRef = useRef(value);
  valueRef.current = value;
  const xRef = useRef(0); // current thumb x (numeric mirror of the Animated value)
  const startXRef = useRef(0);
  const initedRef = useRef(false);

  useEffect(() => {
    const id = x.addListener(({ value: v }) => {
      xRef.current = v;
    });
    return () => x.removeListener(id);
  }, [x]);

  const valueToX = (v: number, u: number, m: number) => {
    const s = Math.max(1, m);
    if (s <= 1) return 0;
    const idx = m - v; // v=max -> 0 (left), v=1 -> s-1 (right)
    return (Math.max(0, Math.min(s - 1, idx)) / (s - 1)) * u;
  };

  const xToValue = (px: number, u: number, m: number) => {
    const s = Math.max(1, m);
    if (s <= 1 || u <= 0) return m;
    const clamped = Math.max(0, Math.min(u, px));
    const idx = Math.round((clamped / u) * (s - 1));
    return m - idx;
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackW(w);
    usableRef.current = Math.max(0, w - THUMB);
    // Position the thumb from the initial value once — after that it's purely
    // finger-driven, so it never springs back to a stop.
    if (!initedRef.current) {
      initedRef.current = true;
      x.setValue(valueToX(valueRef.current, usableRef.current, maxRef.current));
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2,
      onPanResponderGrant: () => {
        startXRef.current = xRef.current;
      },
      onPanResponderMove: (_, g) => {
        const u = usableRef.current;
        const nx = Math.max(0, Math.min(u, startXRef.current + g.dx));
        x.setValue(nx);
        // Emit live as the thumb crosses each threshold so the grid updates as
        // you slide. The grid reflows in place (no FlatList remount — see
        // ArtGallery/People), so a live change stays smooth.
        const v = xToValue(nx, u, maxRef.current);
        if (v !== valueRef.current) {
          valueRef.current = v;
          onChange(v);
        }
      },
      // No release snap: the thumb stays where the finger left it.
    }),
  ).current;

  return (
    <View style={styles.wrap} onLayout={onLayout} {...pan.panHandlers}>
      <View style={styles.track} />
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: x }] }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tall enough to give the thumb a comfortable drag target; the visible track
  // is centered within it.
  wrap: {
    height: 32,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: '#000',
    opacity: 0.25,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
  },
});
