import React, { useEffect } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

/**
 * Floating "update ready — tap to restart" pill. expo-updates downloads new OTA
 * bundles in the background (checkAutomatically: ON_LOAD); normally they only
 * apply on the *next* cold start. This surfaces the pending update and lets the
 * user apply it immediately via reloadAsync() — no two-restart dance.
 *
 * Also proactively checks + fetches on mount so the pill can appear within a
 * single session rather than waiting for the implicit launch check.
 */
export default function UpdateBanner() {
  const insets = useSafeAreaInsets();
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
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        style={styles.pill}
        onPress={() => {
          Updates.reloadAsync().catch(() => {});
        }}
      >
        <Text style={styles.text}>update ready — tap to restart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...Shadows.card,
  },
  text: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
});
