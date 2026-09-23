import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_SECTIONS } from '../constants/aboutContent';
import type { AboutSectionKey } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'About'>;

// Painter's palette, same as the web About page (ABOUT_SECTIONS in
// src/ui/.../About.tsx): each section is a tint inside a fuller-strength border.
const SECTION_COLORS: Record<AboutSectionKey, { bg: string; border: string; fg: string }> = {
  ethos: { bg: 'rgb(122, 162, 224)', border: 'rgb(13, 43, 107)', fg: '#000' }, // light phthalo in phthalo blue
  art: { bg: 'rgb(251, 236, 93)', border: 'rgb(255, 193, 0)', fg: '#000' }, // cad yellow light in cad yellow medium
  aims: { bg: 'rgb(244, 130, 100)', border: 'rgb(229, 60, 57)', fg: '#000' }, // cad red light in cad red
};

// The Pi paint club runs on, under the sections.
const PI_PHOTO: number | null = require('../../assets/imgs/raspberry-pi.jpg');

// The "about the app" hub: three full-width boxes (ethos / art / aims) that
// together fill the page. Back to Home is the native swipe gesture.
export default function About() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  return (
    // bottom padding clears the rounded screen corners / home indicator
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8 }]}>
      <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>‹ back</Text>
      </Pressable>
      <Text style={styles.pageTitle}>about painting club</Text>
      <View style={styles.row}>
        {ABOUT_SECTIONS.map((s) => {
          const c = SECTION_COLORS[s.key];
          return (
            <Pressable
              key={s.key}
              style={[styles.sectionBtn, { backgroundColor: c.bg, borderColor: c.border }]}
              onPress={() => navigation.navigate('AboutSection', { section: s.key })}
            >
              <Text style={[styles.sectionBtnText, { color: c.fg }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* The sections take 3/5 of the space; the Pi gets the rest. */}
      {PI_PHOTO != null && (
        <View style={styles.piWrap}>
          <Text style={styles.piCaption}>all of paint club is run off of a raspberry pi 4</Text>
          <Image source={PI_PHOTO} style={styles.piPhoto} resizeMode="contain" />
        </View>
      )}
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
  backBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  backBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  row: {
    // sections ~55% / Pi box ~45% (was 3/5 : 2/5)
    flex: 11,
    flexDirection: 'row',
    gap: 6,
  },
  sectionBtn: {
    flex: 1,
    // 5px border in the section's fuller colour + soft shadow, as on the web
    borderWidth: 5,
    borderColor: '#000',
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgb(17, 17, 26)',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  // A quiet card in the app's own chrome: cream fill, thin black border.
  piWrap: {
    flex: 9,
    marginTop: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  piCaption: {
    fontFamily: Fonts.serif,
    fontSize: 12,
    color: Colors.black,
    textAlign: 'left',
    marginBottom: 8,
  },
  piPhoto: {
    flex: 1,
    width: '100%',
  },
  sectionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    color: Colors.black,
  },
});
