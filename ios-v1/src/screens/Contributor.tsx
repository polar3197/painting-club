import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AnnouncementComposeDialog from '../components/AnnouncementComposeDialog';
import { AnnouncementOut, get_announcements, delete_announcement } from '../api';

// Contributor-only hub (Settings → "contributor"): the single place to author
// and moderate announcements. Compose lives here (not on Home — Home's card is
// read-only). Tap an item to view its discussion; long-press to delete.
export default function Contributor() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [items, setItems] = useState<AnnouncementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementOut | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await get_announcements(token));
    } catch {
      // keep what's on screen
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setItems((prev) => prev.filter((a) => a.id !== target.id));
    try {
      await delete_announcement(target.id, token);
    } catch {
      load();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ConfirmDialog
        visible={!!pendingDelete}
        title="delete this announcement?"
        confirmLabel="yes, delete"
        cancelLabel="keep it"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <View style={styles.header}>
        <Text style={styles.title}>contributor</Text>
        <Pressable style={styles.addBtn} onPress={() => setComposing(true)}>
          <Text style={styles.addBtnText}>+ announcement</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.sub}>your announcements — tap to open, hold to delete</Text>
          {items.length === 0 ? (
            <Text style={styles.empty}>no announcements yet. tap + to post one.</Text>
          ) : (
            items.map((a) => (
              <Pressable
                key={a.id}
                style={styles.row}
                onPress={() => navigation.navigate('AnnouncementDetail', { id: a.id })}
                onLongPress={() => setPendingDelete(a)}
                delayLongPress={400}
              >
                <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
                <Text style={styles.rowBody} numberOfLines={2}>{a.body}</Text>
                <Text style={styles.rowMeta}>
                  {a.comment_count > 0
                    ? `${a.comment_count} ${a.comment_count === 1 ? 'reply' : 'replies'}`
                    : 'no replies yet'}
                </Text>
              </Pressable>
            ))
          )}
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
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addBtnText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  sub: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    padding: 12,
    marginBottom: 8,
    gap: 3,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  rowBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
