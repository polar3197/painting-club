import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Unlocks device rotation while the calling screen is mounted (and `enabled`),
 * snapping back to portrait when it closes. The app is globally portrait-only
 * (app.json), but expo-screen-orientation's native module — present in every
 * shipped binary, including build #8 — overrides that at runtime, so this is
 * safe to use from OTA bundles on both runtimes.
 */
export function useLandscapeUnlock(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [enabled]);
}
