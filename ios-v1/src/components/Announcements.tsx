import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

const ANNOUNCEMENTS = [
  "Painting Club meets Sunday 02/15 @ 3pm @ charlie's house for indoor still life",
];

export default function Announcements() {
  const { currentUser } = useAuth();

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.headerText}>announcements</Text>
      </View>
      <View style={styles.body}>
        {!currentUser && (
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        )}
        {ANNOUNCEMENTS.map((item, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 3,
    borderColor: '#000',
    ...Shadows.card,
    marginTop: 20,
  },
  header: {
    backgroundColor: Colors.mainBg,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  headerText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  body: {
    backgroundColor: Colors.greenMuted,
    overflow: 'hidden',
  },
  item: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    backgroundColor: Colors.mainBg,
    margin: 8,
  },
  itemText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
});
