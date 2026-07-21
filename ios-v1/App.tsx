import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { setAudioModeAsync } from 'expo-audio';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { UploadProvider } from './src/context/UploadContext';
import { BookmarkProvider } from './src/context/BookmarkContext';
import { Colors } from './src/constants/theme';
import { setAuthExpiredHandler } from './src/api/client';
import { recordScreen, initDeviceTelemetry } from './src/api/observability';
import RootNavigator from './src/navigation';
import UpdateBanner from './src/components/UpdateBanner';
import { AppAlertHost } from './src/components/AppAlert';
import { ToastHost } from './src/components/Toast';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.mainBg,
  },
};

const navigationRef = createNavigationContainerRef();

/** Bridges the API client's 401 signal to auth state + navigation. */
function AuthExpiryBridge() {
  const { logout } = useAuth();
  useEffect(() => {
    setAuthExpiredHandler(() => {
      void logout();
      if (navigationRef.isReady()) {
        (navigationRef as any).reset({ index: 0, routes: [{ name: 'LandingPage' }] });
      }
    });
    return () => setAuthExpiredHandler(null);
  }, [logout]);
  return null;
}

export default function App() {
  // Configure the global audio session once at startup so music keeps playing
  // when the app is backgrounded or the device is on silent. Paired with
  // ios.infoPlist.UIBackgroundModes: ['audio'] in app.json — both are required
  // for background playback to actually continue.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    }).catch(() => {
      // Non-fatal: playback still works in-foreground if the session config fails.
    });
  }, []);

  // Wire device/perf telemetry sources (#6) once at startup. Emitted events only
  // flush once a login token is set, so this is safe before auth.
  useEffect(() => {
    initDeviceTelemetry();
  }, []);

  // One-time reclaim of runaway image cache. Earlier builds cached each art
  // image under its rotating signed URL, so the same pieces accumulated as
  // gigabytes of duplicate disk entries. Now that images carry a stable cacheKey
  // (one entry each), purge the bloated cache a single time so the space comes
  // back; it won't refill. The flag guards it to once per install — bump the key
  // if a future change needs another purge.
  useEffect(() => {
    (async () => {
      try {
        if (await SecureStore.getItemAsync('disk_cache_purged_v2')) return;
        await Image.clearDiskCache();
        await Image.clearMemoryCache();
        await SecureStore.setItemAsync('disk_cache_purged_v2', '1');
      } catch {
        // Non-fatal: worst case the stale cache lingers until the OS evicts it.
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
        <AuthProvider>
          <UploadProvider>
            <BookmarkProvider>
            <NavigationContainer
              theme={navTheme}
              ref={navigationRef}
              // Behavioral trail (#5): record the focused route on every nav
              // change. recordScreen dedupes consecutive repeats and batches,
              // so this is cheap. No-op until a token is set (post-login).
              onStateChange={() => {
                const name = (navigationRef as any).getCurrentRoute()?.name;
                if (name) recordScreen(name);
              }}
            >
              <AuthExpiryBridge />
              <RootNavigator />
              <UpdateBanner />
              <AppAlertHost />
              <ToastHost />
              <StatusBar style="dark" />
            </NavigationContainer>
            </BookmarkProvider>
          </UploadProvider>
        </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
