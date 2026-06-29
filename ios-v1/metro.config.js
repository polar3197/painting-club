// Extends Expo's default Metro config. Required by expo-doctor and recommended
// by Sentry for sourcemap upload to work correctly.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const config = getSentryExpoConfig(__dirname);

// ---------------------------------------------------------------------------
// OTA build-#8 compatibility shim.
//
// The live App Store binary (build #8, runtime 1.0.3) predates these native
// modules. To ship JS/UI updates over-the-air WITHOUT a native rebuild, alias
// each missing native package to a harmless JS stub so the bundle never calls
// into a native module the binary lacks (which crash-loops on launch).
//
// REMOVE THIS BLOCK before producing a real native build so the genuine native
// modules are bundled and these features work again.
// ---------------------------------------------------------------------------
const SHIMS = {
  'expo-audio': path.resolve(__dirname, 'src/shims/expo-audio.ts'),
  'expo-linear-gradient': path.resolve(__dirname, 'src/shims/expo-linear-gradient.tsx'),
  'expo-document-picker': path.resolve(__dirname, 'src/shims/expo-document-picker.ts'),
  'react-native-webview': path.resolve(__dirname, 'src/shims/react-native-webview.tsx'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = SHIMS[moduleName];
  if (shim) {
    return { type: 'sourceFile', filePath: shim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
