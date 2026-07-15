import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { get_announcements, AnnouncementOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';
import AnnouncementComposeDialog from '../components/AnnouncementComposeDialog';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'AnnouncementsFeed'>;

function parseUtc(s: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

function formatWhen(s: string): string {
  const d = parseUtc(s);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString([], opts).toLowerCase();
}

// The full announcements list, reached from the Home card's "see all".
export default function AnnouncementsFeed() {
  const navigation = useNavigation<Nav>();
  const { token, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [items, setItems] = useState<AnnouncementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const isContributor = currentRole === 'contributor' || currentRole === 'admin';

  const load = useCallback(() => {
    get_announcements(token)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={Colors.black} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>announcements</Text>
        </View>
        {isContributor ? (
          <Pressable style={styles.headerAction} hitSlop={10} onPress={() => setComposing(true)}>
            <Ionicons name="add" size={26} color={Colors.black} />
          </Pressable>
        ) : (
          <View style={styles.headerAction} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>nothing announced yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
          {items.map((a) => (
            <Pressable
              key={a.id}
              style={styles.row}
              onPress={() => navigation.navigate('AnnouncementDetail', { id: a.id })}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
              <Text style={styles.rowBody} numberOfLines={2}>{a.body}</Text>
              <Text style={styles.rowMeta}>
                {(a.author_firstname || a.author_username || 'someone')} · {formatWhen(a.created_at)}
                {a.comment_count > 0
                  ? ` · ${a.comment_count} ${a.comment_count === 1 ? 'reply' : 'replies'}`
                  : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {composing && (
        <AnnouncementComposeDialog
          onClose={() => setComposing(false)}
          onPosted={load}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  headerAction: { padding: 4, width: 34, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  row: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 12,
    marginBottom: 10,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.black,
  },
  rowBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 6,
  },
});
