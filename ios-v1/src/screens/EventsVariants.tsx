import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useNavPref } from '../context/NavPrefContext';
import { EventOut, list_events, resolveImageUrl } from '../api';
import { formatEventTime, todayLocalISO } from '../utils/date';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import Events from './Events';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { y, m, d, wd: WD[dt.getDay()], mon: MONTHS[m - 1], dt };
}
function daysUntil(iso: string): number {
  const { dt } = parts(iso);
  const n = new Date();
  const t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((dt.getTime() - t0.getTime()) / 86400000);
}
function countdown(n: number): string {
  if (n < 0) return 'past';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 7) return `in ${n} days`;
  if (n < 14) return 'next week';
  return `in ${Math.round(n / 7)} weeks`;
}

function useUpcoming() {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    list_events(token)
      .then((e) => { if (alive) setEvents(e); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);
  const today = todayLocalISO();
  const upcoming = [...events]
    .filter((e) => e.event_date >= today)
    .sort((a, b) => (a.event_date + (a.event_time ?? '')).localeCompare(b.event_date + (b.event_time ?? '')));
  return { upcoming, loading };
}

function Header({ onAdd, insetTop }: { onAdd: () => void; insetTop: number }) {
  return (
    <View style={[styles.header, { paddingTop: insetTop + 8 }]}>
      <Text style={styles.h1}>events</Text>
      <Pressable style={styles.addBtn} hitSlop={12} onPress={onAdd}>
        <Text style={styles.addTxt}>+</Text>
      </Pressable>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <View style={styles.shell}>{children}</View>;
}

function Empty() {
  return <Text style={styles.empty}>no upcoming events</Text>;
}

// ── A: upcoming feed — rich cards, everything at a glance ──────────────────
export function EventsA() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { upcoming, loading } = useUpcoming();
  return (
    <Shell>
      <Header insetTop={insets.top} onAdd={() => nav.navigate('EventEdit', {})} />
      {loading ? <ActivityIndicator color={Colors.darkerGold} style={{ marginTop: 30 }} /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {upcoming.length === 0 ? <Empty /> : upcoming.map((e) => {
            const p = parts(e.event_date);
            return (
              <Pressable key={e.id} style={styles.cardA} onPress={() => nav.navigate('EventDetail', { eventId: e.id })}>
                {e.image_path
                  ? <Image source={{ uri: resolveImageUrl(e.image_path) }} style={styles.cardAImg} />
                  : <View style={[styles.cardAImg, styles.blank]} />}
                <View style={styles.cardABody}>
                  <Text style={styles.cardATitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.cardAMeta}>{p.wd} {p.mon} {p.d}{e.event_time ? ` · ${formatEventTime(e.event_time)}` : ''}</Text>
                  <Text style={styles.cardAHost} numberOfLines={1}>@{e.hosts[0] ?? e.creator_username} · {countdown(daysUntil(e.event_date))}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Shell>
  );
}

// ── B: agenda timeline — date rail on the left ────────────────────────────
export function EventsB() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { upcoming, loading } = useUpcoming();
  return (
    <Shell>
      <Header insetTop={insets.top} onAdd={() => nav.navigate('EventEdit', {})} />
      {loading ? <ActivityIndicator color={Colors.darkerGold} style={{ marginTop: 30 }} /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, paddingLeft: 8 }}>
          {upcoming.length === 0 ? <Empty /> : upcoming.map((e) => {
            const p = parts(e.event_date);
            return (
              <Pressable key={e.id} style={styles.timelineRow} onPress={() => nav.navigate('EventDetail', { eventId: e.id })}>
                <View style={styles.dateBadge}>
                  <Text style={styles.badgeDay}>{p.d}</Text>
                  <Text style={styles.badgeMon}>{p.mon}</Text>
                </View>
                <View style={styles.rail}><View style={styles.railDot} /></View>
                <View style={styles.timelineCard}>
                  <Text style={styles.tlTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.tlMeta}>{p.wd}{e.event_time ? ` · ${formatEventTime(e.event_time)}` : ' · all day'} · {e.is_public ? 'public' : 'invite'}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Shell>
  );
}

// ── C: featured hero + compact list ───────────────────────────────────────
export function EventsC() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { upcoming, loading } = useUpcoming();
  const hero = upcoming[0];
  const rest = upcoming.slice(1);
  return (
    <Shell>
      <Header insetTop={insets.top} onAdd={() => nav.navigate('EventEdit', {})} />
      {loading ? <ActivityIndicator color={Colors.darkerGold} style={{ marginTop: 30 }} /> : !hero ? <Empty /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <Pressable style={styles.hero} onPress={() => nav.navigate('EventDetail', { eventId: hero.id })}>
            {hero.image_path
              ? <Image source={{ uri: resolveImageUrl(hero.image_path) }} style={styles.heroImg} />
              : <View style={[styles.heroImg, styles.blank]} />}
            <View style={styles.heroOverlay}>
              <Text style={styles.heroCount}>{countdown(daysUntil(hero.event_date))}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
              <Text style={styles.heroMeta}>{parts(hero.event_date).mon} {parts(hero.event_date).d}{hero.event_time ? ` · ${formatEventTime(hero.event_time)}` : ''}</Text>
            </View>
          </Pressable>
          {rest.map((e) => {
            const p = parts(e.event_date);
            return (
              <Pressable key={e.id} style={styles.miniRow} onPress={() => nav.navigate('EventDetail', { eventId: e.id })}>
                <Text style={styles.miniDate}>{p.mon} {p.d}</Text>
                <Text style={styles.miniTitle} numberOfLines={1}>{e.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Shell>
  );
}

// Picker: renders the selected events prototype, or the shipped calendar.
export default function EventsPanel() {
  const { eventsVariant } = useNavPref();
  if (eventsVariant === 'A') return <EventsA />;
  if (eventsVariant === 'B') return <EventsB />;
  if (eventsVariant === 'C') return <EventsC />;
  return <Events />;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.mainBg, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  h1: { fontFamily: Fonts.serif, fontSize: FontSizes.xl, color: Colors.black },
  addBtn: { borderWidth: 1, borderColor: Colors.black, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary },
  addTxt: { fontSize: 22, color: Colors.black, lineHeight: 24 },
  empty: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 40 },
  blank: { backgroundColor: Colors.secondary },
  // A
  cardA: { borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.artCardBg, marginBottom: 12, overflow: 'hidden' },
  cardAImg: { width: '100%', height: 130 },
  cardABody: { padding: 10 },
  cardATitle: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black },
  cardAMeta: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  cardAHost: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.darkerGold, marginTop: 3 },
  // B
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 4 },
  dateBadge: { width: 46, alignItems: 'center', paddingTop: 8 },
  badgeDay: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.black },
  badgeMon: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary },
  rail: { width: 20, alignItems: 'center' },
  railDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.darkerGold, marginTop: 12, borderWidth: 1, borderColor: Colors.black },
  timelineCard: { flex: 1, borderLeftWidth: 2, borderLeftColor: Colors.primaryGold, paddingLeft: 12, paddingVertical: 10 },
  tlTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  tlMeta: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  // C
  hero: { borderWidth: 1, borderColor: Colors.black, marginBottom: 14, overflow: 'hidden' },
  heroImg: { width: '100%', height: 220 },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.42)' },
  heroCount: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.accentGolden, marginBottom: 2 },
  heroTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.lg, color: Colors.white },
  heroMeta: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.white, marginTop: 3, opacity: 0.9 },
  miniRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  miniDate: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.darkerGold, width: 64 },
  miniTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black, flex: 1 },
});
