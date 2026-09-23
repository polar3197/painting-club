import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function toISO(y: number, m: number, d: number): string { return `${y}-${pad(m + 1)}-${pad(d)}`; }

// Pure-JS month calendar (no native picker → ships over OTA). Tap a day to pick
// it; ‹ › move between months. `value` is a YYYY-MM-DD string.
export default function CalendarPicker({
  visible, value, onSelect, onClose,
}: { visible: boolean; value: string; onSelect: (iso: string) => void; onClose: () => void }) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const initial = parsed ? new Date(`${parsed}T00:00:00`) : new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const firstDay = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => {
    let m = view.m + delta, y = view.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setView({ y, m });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Pressable onPress={() => step(-1)} hitSlop={10}><Text style={styles.nav}>‹</Text></Pressable>
            <Text style={styles.month}>{MONTHS[view.m]} {view.y}</Text>
            <Pressable onPress={() => step(1)} hitSlop={10}><Text style={styles.nav}>›</Text></Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) => {
              const iso = d ? toISO(view.y, view.m, d) : '';
              const selected = d != null && iso === parsed;
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  disabled={d == null}
                  onPress={() => { onSelect(iso); onClose(); }}
                >
                  {d != null && (
                    <View style={[styles.day, selected && styles.daySelected]}>
                      <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{d}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, backgroundColor: Colors.mainBg, borderWidth: 2, borderColor: Colors.black, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { fontFamily: Fonts.serif, fontSize: 28, color: Colors.black, paddingHorizontal: 10 },
  month: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, paddingBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: Colors.primaryGold, borderWidth: 1, borderColor: Colors.black },
  dayText: { fontFamily: Fonts.mono, fontSize: 15, color: Colors.black },
  dayTextSelected: { fontWeight: '700' },
});
