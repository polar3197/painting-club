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
import { TelemetrySummary, get_telemetry_summary } from '../api';

const WINDOW_DAYS = 14;

// Contributor "infra stats": device/perf telemetry — event counts by kind,
// app-version spread, crashes per day, and a recent crash/warning list.
// Read-only, backed by /telemetry/summary. Reached from Settings.
export default function InfraStats() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await get_telemetry_summary(WINDOW_DAYS, token));
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

  const maxCrash = Math.max(1, ...(data?.crashes_per_day.map((d) => d.count) || [1]));
  const hasAny =
    (data?.counts_by_kind.length ?? 0) > 0 ||
    (data?.recent.length ?? 0) > 0;

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
      <Text style={styles.title}>infra stats</Text>
      <Text style={styles.sub}>last {data?.days ?? WINDOW_DAYS} days</Text>

      {error && !data ? (
        <Text style={styles.empty}>couldn't load stats. pull to retry.</Text>
      ) : !hasAny ? (
        <Text style={styles.empty}>no telemetry yet. crashes and memory warnings show up here.</Text>
      ) : (
        <>
          <Section title="events by kind">
            {data!.counts_by_kind.map((k) => (
              <Row key={k.kind} label={k.kind} value={k.count} />
            ))}
          </Section>

          {data!.app_versions.length > 0 && (
            <Section title="app versions">
              {data!.app_versions.map((v) => (
                <Row key={v.version} label={v.version} value={v.count} />
              ))}
            </Section>
          )}

          <Section title="crashes per day">
            {data!.crashes_per_day.length === 0 ? (
              <Text style={styles.empty}>no crashes 🎉</Text>
            ) : (
              data!.crashes_per_day.map((d) => (
                <View key={d.date} style={styles.barRow}>
                  <Text style={styles.barLabel}>{shortDate(d.date)}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round((d.count / maxCrash) * 100)}%` }]} />
                  </View>
                  <Text style={styles.barCount}>{d.count}</Text>
                </View>
              ))
            )}
          </Section>

          {data!.recent.length > 0 && (
            <Section title="recent crashes & warnings">
              {data!.recent.map((r, i) => (
                <View key={i} style={styles.recentRow}>
                  <View style={styles.recentHead}>
                    <Text style={[styles.recentKind, r.kind === 'crash' && styles.recentCrash]}>
                      {r.kind}
                    </Text>
                    <Text style={styles.recentMeta}>
                      {[r.device_model, r.os_version && `iOS ${r.os_version}`, r.app_version && `v${r.app_version}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {!!r.detail && (
                    <Text style={styles.recentDetail} numberOfLines={3}>{r.detail}</Text>
                  )}
                  {!!r.occurred_at && (
                    <Text style={styles.recentTime}>{r.occurred_at.replace('T', ' ').slice(0, 16)}</Text>
                  )}
                </View>
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
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

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

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
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  rowLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
    flex: 1,
  },
  rowValue: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    marginLeft: 12,
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
    width: 60,
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
    backgroundColor: Colors.redBright,
  },
  barCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    width: 34,
    textAlign: 'right',
  },
  recentRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  recentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  recentKind: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  recentCrash: {
    color: Colors.redBright,
    fontWeight: '700',
  },
  recentMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  recentDetail: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  recentTime: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 16,
  },
});
