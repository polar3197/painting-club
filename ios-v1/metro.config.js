// Extends Expo's default Metro config. Required by expo-doctor and recommended
// by Sentry for sourcemap upload to work correctly.
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Web-only alias: expo-secure-store has no browser implementation, so browser
// bundles get the localStorage shim instead. Native platforms resolve normally.
const WEB_SHIMS = {
  'expo-secure-store': path.resolve(__dirname, 'src/shims/expo-secure-store.web.ts'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { filePath: WEB_SHIMS[moduleName], type: 'sourceFile' };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
