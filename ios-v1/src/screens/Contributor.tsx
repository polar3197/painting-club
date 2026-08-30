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
import qrcode from 'qrcode-generator';
import {
  AnnouncementOut,
  get_announcements,
  delete_announcement,
  get_signup_invites,
  create_signup_invite,
  getJoinUrl,
} from '../api';

// The standing club QR, drawn as plain Views from a pure-JS module matrix —
// no native QR/svg dependency, so it ships over OTA. Cell size is floored to
// whole points to keep module edges crisp.
const QR_SIZE = 240;
const QrPanel = ({ modules }: { modules: boolean[][] }) => {
  const n = modules.length;
  const cell = Math.max(2, Math.floor(QR_SIZE / n));
  // Merge each row's cells into same-color runs: ~10x fewer Views.
  const rows = modules.map((row) => {
    const runs: { dark: boolean; len: number }[] = [];
    for (const dark of row) {
      const last = runs[runs.length - 1];
      if (last && last.dark === dark) last.len += 1;
      else runs.push({ dark, len: 1 });
    }
    return runs;
  });
  return (
    <View style={[styles.qrPanel, { padding: cell * 2 }]}>
      {rows.map((runs, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {runs.map((run, i) => (
            <View
              key={i}
              style={{ width: cell * run.len, height: cell, backgroundColor: run.dark ? '#000' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

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

  // The club's standing signup QR (same logic as the web contributor page):
  // reuse the newest live invite token, mint one the first time. Scanning
  // lands on paintingclub.art/join?i=<token> — instant account.
  const [qrModules, setQrModules] = useState<boolean[][] | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invites = await get_signup_invites(token);
        const live = invites.find((i) =>
          !i.revoked &&
          (i.expires_at === null || new Date(i.expires_at + 'Z') > new Date()) &&
          (i.max_uses === null || i.uses < i.max_uses)
        ) ?? await create_signup_invite({ label: 'club qr' }, token);
        const qr = qrcode(0, 'M');
        qr.addData(getJoinUrl(live.token));
        qr.make();
        const n = qr.getModuleCount();
        const rows: boolean[][] = [];
        for (let r = 0; r < n; r++) {
          const row: boolean[] = [];
          for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
          rows.push(row);
        }
        if (!cancelled) setQrModules(rows);
      } catch {
        if (!cancelled) setQrError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

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
          <Text style={styles.sectionTitle}>club QR — scan to join</Text>
          {qrModules ? (
            <QrPanel modules={qrModules} />
          ) : (
            <Text style={styles.empty}>{qrError ? "couldn't load the QR" : 'loading…'}</Text>
          )}

          <Text style={[styles.sectionTitle, styles.sectionGap]}>announcements</Text>
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
  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  sectionGap: {
    marginTop: 24,
  },
  qrPanel: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 4,
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
