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

  const preview = items.slice(0, PREVIEW_COUNT);
  const extra = items.length - preview.length;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.headerText}>announcements</Text>
      </View>

      <View style={styles.body}>
        {preview.map((a) => (
          <Pressable
            key={a.id}
            style={styles.item}
            onPress={() => navigation.navigate('AnnouncementDetail', { id: a.id })}
          >
            <Text style={styles.itemTitle} numberOfLines={1}>{a.title}</Text>
            <Text style={styles.itemBody} numberOfLines={2}>{a.body}</Text>
            {a.comment_count > 0 && (
              <Text style={styles.itemMeta}>
                {a.comment_count} {a.comment_count === 1 ? 'reply' : 'replies'}
              </Text>
            )}
          </Pressable>
        ))}

        {extra > 0 && (
          <Pressable
            style={styles.seeAll}
            onPress={() => navigation.navigate('AnnouncementsFeed')}
          >
            <Text style={styles.seeAllText}>see all {items.length} →</Text>
          </Pressable>
        )}
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
    backgroundColor: Colors.mainBg,
  },
  header: {
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  postBtn: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  body: {
    backgroundColor: Colors.greenMuted,
  },
  item: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    backgroundColor: Colors.mainBg,
    marginHorizontal: 8,
    marginTop: 8,
  },
  itemTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  itemBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  emptyItem: {
    padding: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'dashed',
    backgroundColor: Colors.mainBg,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  seeAll: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  seeAllText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
});
