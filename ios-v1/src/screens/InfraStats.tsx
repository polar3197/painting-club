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
import { InfraHealthOut, get_infra_health } from '../api';

const REFRESH_MS = 15000;

// Contributor "infra stats": live Raspberry Pi host health — CPU / memory /
// disk / temperature / uptime, plus the size of the Docker static-files volume
// (uploaded art + profile images), which is what actually fills the Pi's disk.
// Read-only, backed by /infra/health. Reached from Settings.
export default function InfraStats() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<InfraHealthOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await get_infra_health(token));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => clearInterval(iv);
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
      <Text style={styles.sub}>
        raspberry pi · {data?.kernel || 'host'}{data?.uptime_seconds != null ? ` · up ${fmtUptime(data.uptime_seconds)}` : ''}
      </Text>

      {error && !data ? (
        <Text style={styles.empty}>couldn't reach the pi. pull to retry.</Text>
      ) : data && !data.host_metrics_available ? (
        <Text style={styles.empty}>
          host metrics unavailable here (the api isn't running on the pi).
        </Text>
      ) : data ? (
        <>
          <Section title="cpu">
            <Meter label="usage" percent={data.cpu.percent} value={data.cpu.percent != null ? `${data.cpu.percent}%` : '—'} />
            <Row label="cores" value={data.cpu.cores != null ? String(data.cpu.cores) : '—'} />
            <Row
              label="load (1 · 5 · 15m)"
              value={[data.cpu.load_1, data.cpu.load_5, data.cpu.load_15].map((l) => (l != null ? l.toFixed(2) : '—')).join('  ')}
            />
          </Section>

          <Section title="memory">
            <Meter label="used" percent={data.memory.percent} value={`${fmtBytes(data.memory.used)} / ${fmtBytes(data.memory.total)}`} />
            <Row label="available" value={fmtBytes(data.memory.available)} />
          </Section>

          <Section title="disk (sd card)">
            <Meter label="used" percent={data.disk.percent} value={`${fmtBytes(data.disk.used)} / ${fmtBytes(data.disk.total)}`} />
            <Row label="free" value={fmtBytes(data.disk.free)} />
          </Section>

          <Section title="people's content">
            <Text style={styles.note}>
              uploaded art + profile images (the static-files volume) — this rides on the disk above.
            </Text>
            <Row label="size" value={fmtBytes(data.content.bytes)} />
            <Row
              label="files"
              value={
                data.content.files != null
                  ? `${data.content.files.toLocaleString()}${data.content.truncated ? '+' : ''}`
                  : '—'
              }
            />
          </Section>

          {data.temperature_c != null && (
            <Section title="temperature">
              <Row label="cpu temp" value={`${data.temperature_c}°C`} />
            </Section>
          )}
        </>
      ) : null}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// A labelled percent meter with a threshold-coloured fill.
function Meter({ label, percent, value }: { label: string; percent: number | null; value: string }) {
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.meterValue}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meterColor(percent) }]} />
      </View>
    </View>
  );
}

function meterColor(p: number | null): string {
  if (p == null) return 'rgba(0,0,0,0.2)';
  if (p >= 90) return Colors.redBright;
  if (p >= 70) return Colors.primaryGold;
  return Colors.greenMuted;
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / 1e6;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
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
  note: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
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
  meterWrap: {
    marginBottom: 14,
  },
  meterHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  meterValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
    marginLeft: 12,
  },
  barTrack: {
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: '#000',
  },
  barFill: {
    height: '100%',
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 16,
  },
});
