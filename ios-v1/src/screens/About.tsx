import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_SECTIONS } from '../constants/aboutContent';
import type { AboutSectionKey } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'About'>;

// Artist-paint palette: phthalo blue, alizarin crimson, cadmium yellow light.
// The two dark panels take light text so the labels stay readable.
const SECTION_COLORS: Record<AboutSectionKey, { bg: string; fg: string }> = {
  ethos: { bg: 'rgb(13, 43, 107)', fg: '#fff' }, // phthalo blue
  art: { bg: 'rgb(251, 236, 93)', fg: '#000' }, // cadmium yellow light
  aims: { bg: 'rgb(229, 60, 57)', fg: '#fff' }, // bright warm red
};

// The "about the app" hub: three full-width boxes (ethos / art / aims) that
// together fill the page. Back to Home is the native swipe gesture.
export default function About() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.pageTitle}>about painting club</Text>
      <View style={styles.row}>
        {ABOUT_SECTIONS.map((s) => {
          const c = SECTION_COLORS[s.key];
          return (
            <Pressable
              key={s.key}
              style={[styles.sectionBtn, { backgroundColor: c.bg }]}
              onPress={() => navigation.navigate('AboutSection', { section: s.key })}
            >
              <Text style={[styles.sectionBtnText, { color: c.fg }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 12,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  sectionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    color: Colors.black,
  },
});
