import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markBackendUp, useBackendDown } from '../api/backendHealth';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:80/api';

// Same copy as the profile screen's fallback so the message reads consistently
// wherever the backend is unreachable.
const PI_DOWN_MESSAGE =
  'Sorry guys, the power source to the raspberry pi this app runs on is weak and it keeps dying. Will be getting it more power soon.';

/**
 * Full-bleed "the Pi is down" notice. While it's mounted it quietly re-probes a
 * lightweight public endpoint so the app heals itself the moment the Pi is back
 * — no manual refresh needed (the content behind the gate just reappears).
 */
export function BackendDownNotice() {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/media`);
        if (r.ok) markBackendUp();
      } catch {
        // still unreachable — keep waiting
      }
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[styles.centered, { paddingTop: insets.top }]}>
      <Text style={styles.text}>{PI_DOWN_MESSAGE}</Text>
    </View>
  );
}

/**
 * Wrap a screen (or a whole tab's navigator) so it shows the notice while the
 * backend is unreachable and its normal content otherwise.
 */
export function BackendGate({ children }: { children: React.ReactNode }) {
  const down = useBackendDown();
  if (down) return <BackendDownNotice />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: Colors.mainBg,
  },
  text: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    textAlign: 'center',
    lineHeight: 26,
  },
});
