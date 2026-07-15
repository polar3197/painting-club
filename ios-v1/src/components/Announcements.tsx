import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { get_announcements, AnnouncementOut } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeFeed'>;

// How many announcements the inline Home card shows before "see all".
const PREVIEW_COUNT = 3;

// Read-only inline Home announcements card: shows the most recent few, each
// tapping through to its discussion. Rendered ONLY when there's at least one
// announcement (stays invisible otherwise). Authoring lives in the contributor
// Settings menu, not here — everyone just reads.
export default function Announcements() {
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  const isFocused = useIsFocused();
  const [items, setItems] = useState<AnnouncementOut[]>([]);

  const load = useCallback(() => {
    get_announcements(token)
      .then(setItems)
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  // Invisible until there's something to announce.
  if (items.length === 0) return null;

  // Minimal: just the latest announcement's title as a thin one-line banner
  // (no "announcements" header). Tap → its discussion. "+N" hints at more.
  const latest = items[0];
  const more = items.length - 1;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => navigation.navigate('AnnouncementDetail', { id: latest.id })}
    >
      <Text style={styles.marker}>◆</Text>
      <Text style={styles.title} numberOfLines={1}>{latest.title}</Text>
      {more > 0 && (
        <Pressable hitSlop={8} onPress={() => navigation.navigate('AnnouncementsFeed')}>
          <Text style={styles.more}>+{more}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Shadows.card,
  },
  marker: {
    fontSize: 10,
    color: Colors.redBright,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  more: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
  },
});
