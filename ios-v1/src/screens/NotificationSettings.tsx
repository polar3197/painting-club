import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../components/AppAlert';
import AppToggle from '../components/AppToggle';
import { get_notification_prefs, update_notification_prefs } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Which notifications a member wants. Everything is off until they turn it on:
// nobody gets notified by something they never asked for.
//
// The server decides WHICH categories exist and which this member may set
// (admin is staff-only), so this screen renders whatever it's handed rather
// than hard-coding the list — a category added server-side appears here with
// no app release. The copy below is the only thing that needs a key, and an
// unknown key still renders with a sensible fallback.
const COPY: Record<string, { label: string; detail: string }> = {
  comments: { label: 'comments', detail: 'when someone comments on your art' },
  messages: { label: 'messages', detail: "when you're sent a message or added to a thread" },
  events: { label: 'events', detail: "when you're invited to an event, or one you're on changes" },
  // No detail line: the label says it. The row renders label-only when detail
  // is empty, so this needs nothing else.
  announcements: { label: 'announcements', detail: '' },
  admin: { label: 'admin', detail: 'when something needs reviewing: applications, media requests, reports' },
};

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await get_notification_prefs(token);
      setPrefs(r.prefs);
      setAvailable(r.available);
    } catch {
      // Leave the screen empty rather than inventing defaults — showing every
      // switch as "off" when we simply couldn't read them would be a lie, and
      // toggling from a guessed state could write back the wrong thing.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: string, value: boolean) => {
    const previous = prefs;
    // Optimistic: a switch that waits on a round trip feels broken.
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      const r = await update_notification_prefs({ [key]: value }, token);
      setPrefs(r.prefs);
    } catch (err: any) {
      setPrefs(previous);
      appAlert("Couldn't save", err?.message || 'try again');
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>notifications</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {navigation.canGoBack() && (
            <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹ back</Text>
            </Pressable>
          )}
          {available.map((key) => {
            const copy = COPY[key] ?? { label: key, detail: '' };
            return (
              <View key={key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{copy.label}</Text>
                  {!!copy.detail && <Text style={styles.rowDetail}>{copy.detail}</Text>}
                </View>
                <AppToggle value={!!prefs[key]} onValueChange={(v) => toggle(key, v)} />
              </View>
            );
          })}

          {available.length === 0 && (
            <Text style={styles.empty}>couldn't load your settings. pull back and try again.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.mainBg },
  header: {
    paddingHorizontal: 30,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  title: { fontFamily: Fonts.serif, fontSize: FontSizes.xl, color: Colors.black },
  // Inside the scroll, so it travels with the content rather than hovering.
  backBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backBtnText: { fontFamily: Fonts.serif, fontSize: FontSizes.xs, color: Colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 30, paddingTop: 16, gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 14,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  rowDetail: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: 3,
  },
  empty: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.textMuted },
});
