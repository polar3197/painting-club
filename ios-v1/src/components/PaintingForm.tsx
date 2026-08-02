import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { TextInput } from './AppTextInput';
import { Visual2DOut } from '../api';
import { todayLocalISO } from '../utils/date';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface PaintingFormProps {
  onDataChange: (data: Record<string, any>) => void;
  initialData?: Visual2DOut;
  // Seed the series field on create (e.g. "+" inside a series' gallery).
  initialSeries?: string;
  // Optional node rendered on the right side of the comments-toggle row.
  // AddArtDialog uses this to inline the submit button next to the toggle.
  rightSlot?: React.ReactNode;
  // The dialog renders toggles + submit in its pinned footer instead.
  hideToggles?: boolean;
}

export default function PaintingForm({ onDataChange, initialData, initialSeries, rightSlot, hideToggles }: PaintingFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title ?? '',
    location: initialData?.location ?? '',
    // New pieces default to today (device-local) so profiles naturally order
    // newest-first; editing keeps whatever the piece already has.
    date: initialData ? initialData.date ?? '' : todayLocalISO(),
    song: initialData?.song ?? '',
    song_artist: initialData?.song_artist ?? '',
    width: initialData?.width ?? null as number | null,
    height: initialData?.height ?? null as number | null,
    keywords: initialData?.keywords?.join(', ') ?? '',
    series: (initialData as any)?.series_name ?? initialSeries ?? '',
    comments_enabled: initialData?.comments_enabled ?? true,
    is_wip: initialData?.is_wip ?? false,
  });

  // Seeded fields only reach the parent through onDataChange — push the
  // initial state up once so an untouched-but-seeded form still submits whole.
  React.useEffect(() => {
    onDataChange(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const thumbPos = useRef(new Animated.Value(form.comments_enabled ? 18 : 0)).current;

  const update = (patch: Record<string, any>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onDataChange(next);
  };

  const toggleComments = () => {
    const next = !form.comments_enabled;
    Animated.timing(thumbPos, { toValue: next ? 18 : 0, duration: 200, useNativeDriver: true }).start();
    update({ comments_enabled: next });
  };

  const wipThumbPos = useRef(new Animated.Value(form.is_wip ? 18 : 0)).current;
  const toggleWip = () => {
    const next = !form.is_wip;
    Animated.timing(wipThumbPos, { toValue: next ? 18 : 0, duration: 200, useNativeDriver: true }).start();
    update({ is_wip: next });
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={form.title}
        placeholder="title *"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ title: v })}
      />
      <TextInput
        style={styles.input}
        value={form.location}
        placeholder="location"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ location: v })}
      />
      <TextInput
        style={styles.input}
        value={form.date}
        placeholder="date (YYYY-MM-DD)"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ date: v })}
      />
      <TextInput
        style={styles.input}
        value={form.series}
        placeholder="series (optional)"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ series: v })}
      />
      <TextInput
        style={styles.input}
        value={form.song}
        placeholder="song"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ song: v })}
      />
      {/* song_artist stays in form state (existing values survive edits) but
          the input is gone — "artist" on a visual piece read as the artwork's
          artist and confused people. */}
      <TextInput
        style={styles.input}
        value={form.width != null ? String(form.width) : ''}
        placeholder="width"
        placeholderTextColor={Colors.textMuted}
        keyboardType="numeric"
        onChangeText={(v) => update({ width: v ? Number(v) : null })}
      />
      <TextInput
        style={styles.input}
        value={form.height != null ? String(form.height) : ''}
        placeholder="height"
        placeholderTextColor={Colors.textMuted}
        keyboardType="numeric"
        onChangeText={(v) => update({ height: v ? Number(v) : null })}
      />
      {/* Keywords input temporarily hidden — restore by removing the guard. */}
      {false && (
        <TextInput
          style={styles.input}
          value={form.keywords}
          placeholder="keywords (comma separated)"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          onChangeText={(v) => update({ keywords: v })}
        />
      )}

      {/* Marking WIP is an edit-time action — new pieces start finished. */}
      {!hideToggles && initialData != null && (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>wip</Text>
          <Pressable
            style={[
              styles.toggleTrack,
              { backgroundColor: form.is_wip ? Colors.greenBright : Colors.redLight },
            ]}
            onPress={toggleWip}
          >
            <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: wipThumbPos }] }]} />
          </Pressable>
        </View>
      )}

      {!hideToggles && (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>comments</Text>
          <Pressable
            style={[
              styles.toggleTrack,
              { backgroundColor: form.comments_enabled ? Colors.greenBright : Colors.redLight },
            ]}
            onPress={toggleComments}
          >
            <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbPos }] }]} />
          </Pressable>
          {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rightSlot: {
    // Pushes the submit button (or whatever) to the far right of the comments row.
    marginLeft: 'auto',
  },
  toggleLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
  toggleTrack: {
    width: 36,
    height: 18,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 12,
    height: 12,
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
  },
});
