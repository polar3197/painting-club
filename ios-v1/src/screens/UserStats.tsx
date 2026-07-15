import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { UsageSummary, get_usage_summary } from '../api';

const WINDOW_DAYS = 14;

// Contributor "user stats": logins + active members per day, and which screens
// get the most traffic. Read-only, backed by /usage/summary. Reached from
// Settings (contributor-gated).
export default function UserStats() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await get_usage_summary(WINDOW_DAYS, token));
      setError(false);
    } catch {
      setError(true);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  const maxLogins = Math.max(1, ...(data?.logins_per_day.map((d) => d.count) || [1]));
  const maxActive = Math.max(1, ...(data?.active_per_day.map((d) => d.count) || [1]));
  const maxScreen = Math.max(1, ...(data?.top_screens.map((s) => s.count) || [1]));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>user stats</Text>
      <Text style={styles.sub}>last {data?.days ?? WINDOW_DAYS} days</Text>

      {error && !data ? (
        <Text style={styles.empty}>couldn't load stats. pull to retry.</Text>
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile label="logins" value={data?.total_logins ?? 0} />
            <Tile label="events" value={data?.total_events ?? 0} />
          </View>

          <Section title="logins per day">
            {(data?.logins_per_day.length ?? 0) === 0 ? (
              <Text style={styles.empty}>no logins yet</Text>
            ) : (
              data!.logins_per_day.map((d) => (
                <BarRow key={d.date} label={shortDate(d.date)} count={d.count} max={maxLogins} />
              ))
            )}
          </Section>

          <Section title="active members per day">
            {(data?.active_per_day.length ?? 0) === 0 ? (
              <Text style={styles.empty}>no activity yet</Text>
            ) : (
              data!.active_per_day.map((d) => (
                <BarRow key={d.date} label={shortDate(d.date)} count={d.count} max={maxActive} accent={Colors.greenHover} />
              ))
            )}
          </Section>

          <Section title="top screens">
            {(data?.top_screens.length ?? 0) === 0 ? (
              <Text style={styles.empty}>no screen traffic yet</Text>
            ) : (
              data!.top_screens.map((s) => (
                <BarRow key={s.screen} label={s.screen} count={s.count} max={maxScreen} accent={Colors.primaryGold} />
              ))
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BarRow({
  label,
  count,
  max,
  accent = Colors.blue,
}: {
  label: string;
  count: number;
  max: number;
  accent?: string;
}) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round((count / max) * 100)}%`, backgroundColor: accent }]} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
}

// "2026-07-14" -> "07/14"
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
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
  },
  tiles: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tileValue: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
  },
  tileLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
    marginBottom: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  barLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textPrimary,
    width: 92,
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  barFill: {
    height: '100%',
  },
  barCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    width: 34,
    textAlign: 'right',
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 8,
  },
});
