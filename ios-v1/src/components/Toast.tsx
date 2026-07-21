import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// App-styled transient toast that drops in from the top, holds briefly, then
// fades out. Render <ToastHost /> once at the app root; a module-level setter
// bridges the imperative call to the host's state (same pattern as appAlert), so
// any file can call showToast without prop-drilling.
//   showToast('bookmarked')

const HOLD_MS = 1400;

let pushToast: ((msg: string) => void) | null = null;

export function showToast(message: string) {
  if (pushToast) pushToast(message);
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pushToast = (msg: string) => setMessage(msg);
    return () => {
      pushToast = null;
    };
  }, []);

  useEffect(() => {
    if (message === null) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMessage(null);
      });
    }, HOLD_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [message, anim]);

  if (message === null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: insets.top + 8 },
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
  },
  text: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    backgroundColor: Colors.accentGolden,
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 18,
    paddingVertical: 9,
    overflow: 'hidden',
  },
});
