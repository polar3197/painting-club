import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { EventOut, list_events, resolveImageUrl } from '../api';
import { formatEventTime, todayLocalISO } from '../utils/date';

const WEEKDAYS = ['s', 'm', 't', 'w', 't', 'f', 's'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

// Events as a month calendar. Days with events show a dot; tap a day to see that
// day's events below. Reached from the bouncing "events" ball on Home.
export default function Events() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { token } = useAuth();
  const [events, setEvents] = useState<EventOut[]>([]);

  const focusDate: string | undefined = route.params?.focusDate;
  const today = todayLocalISO();
  // Land on focusDate when we were handed one (new event), else today.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (focusDate || today).split('-').map(Number);
    return { y, m0: m - 1 };
  });
  const [selected, setSelected] = useState<string>(focusDate || today);

  // Creating an event pops back here with its date. Jump to that day and month,
  // then clear the param so it's one-shot — otherwise a later visit would keep
  // yanking the calendar back to an old event instead of leaving it put.
  useEffect(() => {
    if (!focusDate) return;
    const [y, m] = focusDate.split('-').map(Number);
    setCursor({ y, m0: m - 1 });
    setSelected(focusDate);
    navigation.setParams({ focusDate: undefined });
  }, [focusDate, navigation]);

  const load = useCallback(async () => {
    try {
      setEvents(await list_events(token));
    } catch {
      // keep what's on screen
    }
  }, [token]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // date (YYYY-MM-DD) -> events on that day, sorted by time.
  const byDate = useMemo(() => {
    const map: Record<string, EventOut[]> = {};
    for (const e of events) {
      (map[e.event_date] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''));
    }
    return map;
  }, [events]);

  // Build the month grid: leading blanks + day numbers.
  const cells = useMemo(() => {
    const firstDow = new Date(cursor.y, cursor.m0, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m0 + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const step = (delta: number) => {
    setCursor((c) => {
      let m0 = c.m0 + delta;
      let y = c.y;
      if (m0 < 0) { m0 = 11; y -= 1; }
      if (m0 > 11) { m0 = 0; y += 1; }
      return { y, m0 };
    });
  };

  const selectedEvents = byDate[selected] || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>events</Text>
        <Pressable style={styles.addBtn} hitSlop={12} onPress={() => navigation.navigate('EventEdit', {})}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <Pressable hitSlop={12} onPress={() => step(-1)}>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{MONTHS[cursor.m0]} {cursor.y}</Text>
        <Pressable hitSlop={12} onPress={() => step(1)}>
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const iso = ymd(cursor.y, cursor.m0, d);
          const has = !!byDate[iso];
          const isToday = iso === today;
          const isSel = iso === selected;
          return (
            <Pressable key={i} style={styles.cell} onPress={() => setSelected(iso)}>
              <View style={[styles.dayInner, isSel && styles.daySel, isToday && !isSel && styles.dayToday]}>
                <Text style={[styles.dayNum, isSel && styles.dayNumSel]}>{d}</Text>
                {has && <View style={[styles.dot, isSel && styles.dotSel]} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Selected day's events */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {selectedEvents.length === 0 ? (
          <Text style={styles.empty}>no events on this day</Text>
        ) : (
          selectedEvents.map((e) => (
            <Pressable
              key={e.id}
              style={styles.row}
              onPress={() => navigation.navigate('EventDetail', { eventId: e.id })}
            >
              {e.image_path ? (
                <Image source={{ uri: resolveImageUrl(e.image_path) }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbBlank]} />
              )}
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {e.event_time ? formatEventTime(e.event_time) : 'all day'}
                  {' · '}{e.is_public ? 'public' : 'invite-only'}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
  },
  addBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    lineHeight: 32,
    color: Colors.black,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  navArrow: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    color: Colors.black,
    paddingHorizontal: 12,
  },
  monthLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    width: CELL as any,
    textAlign: 'center',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    paddingBottom: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.15)',
    paddingTop: 4,
  },
  cell: {
    width: CELL as any,
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySel: {
    backgroundColor: Colors.black,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: Colors.darkerGold,
  },
  dayNum: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  dayNumSel: {
    color: Colors.white,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.redBright,
    marginTop: 1,
  },
  dotSel: {
    backgroundColor: Colors.white,
  },
  list: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#000',
    marginTop: 10,
    paddingTop: 12,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    marginBottom: 8,
    overflow: 'hidden',
  },
  thumb: {
    width: 60,
    height: 60,
  },
  thumbBlank: {
    backgroundColor: Colors.secondary,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  rowMain: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 3,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
  },
});
