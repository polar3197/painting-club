import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type R = RouteProp<HomeStackParamList, 'ComingSoon'>;

// Placeholder for not-yet-built features. Back is the native swipe gesture.
export default function ComingSoon() {
  const insets = useSafeAreaInsets();
  const title = useRoute<R>().params?.title;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.center}>
        <Text style={styles.wip}>WIP coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wip: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textMuted,
  },
});
