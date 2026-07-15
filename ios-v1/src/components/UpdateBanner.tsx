import React, { useEffect } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

/**
 * "update ready — tap to restart" button. expo-updates downloads new OTA
 * bundles in the background (checkAutomatically: ON_LOAD); normally they only
 * apply on the *next* cold start. This surfaces the pending update and lets the
 * user apply it immediately via reloadAsync() — no two-restart dance.
 *
 * Rendered once at the app root (above the navigator), so it floats dead-center
 * over whatever page is showing. `box-none` lets taps pass through to the
 * content behind it; only the button itself is interactive.
 *
 * Also proactively checks + fetches on mount so the button can appear within a
 * single session rather than waiting for the implicit launch check.
 */
export default function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    // Disabled in dev/Expo Go where updates aren't served.
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline / transient — the automatic launch check will retry.
      }
    })();
  }, []);

  if (!isUpdatePending) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        style={styles.button}
        onPress={() => {
          Updates.reloadAsync().catch(() => {});
        }}
      >
        <Text style={styles.title}>update ready</Text>
        <Text style={styles.subtitle}>tap to restart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  button: {
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 20,
    alignItems: 'center',
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.black,
  },
  subtitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    marginTop: 2,
  },
});
