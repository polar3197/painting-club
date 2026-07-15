import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { PromptSummary, list_prompts, activate_prompt } from '../api';

// Contributor tool (Settings → "weekly prompt"): pick which prompt is the active
// week's prompt from the available ones. Tapping a prompt confirms, then
// activates it (deactivating the current one).
export default function WeeklyPromptSwitch() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PromptSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await list_prompts(token);
      // Active first, then newest.
      list.sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
      setPrompts(list);
    } catch {
      // keep what's on screen
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmSwitch = async () => {
    const target = pending;
    setPending(null);
    if (!target || busy) return;
    setBusy(true);
    try {
      await activate_prompt(target.id, token);
      await load();
    } catch (err: any) {
      Alert.alert('could not switch', err?.message || 'try again');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ConfirmDialog
        visible={!!pending}
        title={pending ? `make “${pending.title}” the week's prompt?` : ''}
        confirmLabel="switch"
        cancelLabel="cancel"
        confirmColor={Colors.primaryGold}
        cancelColor={Colors.secondary}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={confirmSwitch}
        onCancel={() => setPending(null)}
      />

      <Text style={styles.title}>weekly prompt</Text>
      <Text style={styles.sub}>tap a prompt to make it this week's</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {prompts.length === 0 ? (
          <Text style={styles.empty}>no prompts yet.</Text>
        ) : (
          prompts.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.row, p.is_active && styles.rowActive]}
              disabled={p.is_active || busy}
              onPress={() => setPending(p)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={2}>{p.title}</Text>
                <Text style={styles.rowMeta}>{p.media_name}</Text>
              </View>
              {p.is_active && <Text style={styles.activeTag}>active</Text>}
            </Pressable>
          ))
        )}
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  sub: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 14,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    padding: 14,
    marginBottom: 8,
  },
  rowActive: {
    backgroundColor: Colors.greenBright,
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
  },
  activeTag: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.black,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 10,
  },
});
