import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const KEY = 'pinch_hint_seen';

export function markPinchHintSeen() {
  SecureStore.setItemAsync(KEY, '1').catch(() => {});
}

// One-time "pinch to zoom" whisper over the search grid: fades in on the
// first-ever visit, sits for ~4s, fades out, never returns (flag persisted;
// a real pinch also retires it immediately via markPinchHintSeen).
export default function PinchHint() {
  const [show, setShow] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((seen) => {
        if (!alive || seen) return;
        setShow(true);
        markPinchHintSeen();
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(4000),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start(() => alive && setShow(false));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [opacity]);

  if (!show) return null;
  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={styles.bubble}>
        <Text style={styles.glyph}>)( ‹—› )(</Text>
        <Text style={styles.text}>pinch to zoom</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 20,
  },
  bubble: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  glyph: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
  },
  text: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
});
