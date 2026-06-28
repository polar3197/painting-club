import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { setAudioModeAsync } from 'expo-audio';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { UploadProvider } from './src/context/UploadContext';
import { Colors } from './src/constants/theme';
import { setAuthExpiredHandler } from './src/api/client';
import RootNavigator from './src/navigation';
import UpdateBanner from './src/components/UpdateBanner';

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <UploadProvider>
            <NavigationContainer theme={navTheme} ref={navigationRef}>
              <AuthExpiryBridge />
              <RootNavigator />
              <UpdateBanner />
              <StatusBar style="dark" />
            </NavigationContainer>
          </UploadProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
