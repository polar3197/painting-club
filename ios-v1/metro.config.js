// Extends Expo's default Metro config. Required by expo-doctor and recommended
// by Sentry for sourcemap upload to work correctly.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
