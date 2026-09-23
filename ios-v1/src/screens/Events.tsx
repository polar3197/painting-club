import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { readCached, writeCached } from '../utils/jsonCache';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
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
// "saturday, september 26" for a YYYY-MM-DD.
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toLowerCase();
}

// `embedded`: in the swipe hub the seam band above already names the panel
// "events", so the heading is dropped and only the add button stays.
export default function Events({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { token } = useAuth();
  // Paint last-known events on the very first frame so the board isn't blank
  // while the request is in flight (same trick the profile and feeds use).
  const [events, setEvents] = useState<EventOut[]>(() => readCached<EventOut[]>('events') ?? []);

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
      const rows = await list_events(token);
      setEvents(rows);
      writeCached('events', rows);
    } catch {
      // keep what's on screen
    }
  }, [token]);

  // Load on mount. The navigation 'focus' listener below used to be the ONLY
  // trigger, which worked while Events was a screen you pushed to — the event
  // fired on the push. As a panel inside the swipe hub it mounts while the hub
  // is ALREADY focused, so 'focus' had fired before this effect ever ran and
  // never fired again: the board stayed empty on the first swipe down to it,
  // and only filled once something else re-focused the hub (opening an event
  // and coming back, or leaving the tab and returning).
  useEffect(() => {
    load();
  }, [load]);

  // Still refresh on focus, so returning from creating or editing an event
  // shows it without a manual pull.
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

  // Upcoming dates (today on), soonest first — the list under the calendar.
  const upcomingDates = useMemo(
    () => Object.keys(byDate).filter((d) => d >= today).sort(),
    [byDate, today],
  );
  const listRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  useEffect(() => {
    const y = sectionY.current[selected];
    if (y != null) listRef.current?.scrollTo({ y, animated: true });
  }, [selected]);

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


  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* In the hub the seam band names the panel, so no header at all. */}
      {!embedded && (
        <View style={styles.header}>
          <Text style={styles.title}>events</Text>
        </View>
      )}

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

      {/* Every upcoming event, sectioned by date. Tapping a day in the
          calendar jumps the list to that date. */}
      <ScrollView
        ref={listRef}
        style={styles.list}
        // room for the floating "+" under the last event
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {upcomingDates.length === 0 ? (
          <Text style={styles.empty}>no upcoming events</Text>
        ) : (
          upcomingDates.map((date) => (
            <View
              key={date}
              onLayout={(ev) => { sectionY.current[date] = ev.nativeEvent.layout.y; }}
            >
              <Text style={[styles.sectionHead, date === selected && styles.sectionHeadOn]}>
                {date === today ? 'today' : dayLabel(date)}
              </Text>
              {byDate[date].map((e) => (
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
              ))}
            </View>
          ))
        )}
      </ScrollView>
      {/* Add an event: the same floating gold circle as the profile's "+". */}
      <Pressable
        style={[styles.addFab, { bottom: insets.bottom + 6 }]}
        onPress={() => navigation.navigate('EventEdit', {})}
        hitSlop={8}
      >
        <Text style={styles.addFabPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  addFab: {
    position: 'absolute',
    left: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.black,
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  addFabPlus: {
    fontFamily: Fonts.mono,
    fontSize: 28,
    lineHeight: 30,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: Colors.black,
  },
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
  sectionHead: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    color: Colors.black,
    marginTop: 4,
    marginBottom: 6,
  },
  sectionHeadOn: {
    textDecorationLine: 'underline',
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
  // Bottom-left back button — under half the screen width, in the thumb zone.
  backBtn: {
    alignSelf: 'flex-start',
    width: '40%',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  backBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    textAlign: 'center',
  },
});
