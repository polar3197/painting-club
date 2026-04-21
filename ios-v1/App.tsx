import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Colors } from './src/constants/theme';
import { setAuthExpiredHandler } from './src/api/client';
import RootNavigator from './src/navigation';

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navTheme} ref={navigationRef}>
            <AuthExpiryBridge />
            <RootNavigator />
            <StatusBar style="dark" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
