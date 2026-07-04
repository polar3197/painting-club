import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { TextInput } from './AppTextInput';
import { AudioOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface AudioFormProps {
  onDataChange: (data: Record<string, any>) => void;
  initialData?: AudioOut;
  rightSlot?: React.ReactNode;
}

export default function AudioForm({ onDataChange, initialData, rightSlot }: AudioFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title ?? '',
    date: initialData?.date ?? '',
    keywords: initialData?.keywords?.join(', ') ?? '',
    comments_enabled: initialData?.comments_enabled ?? true,
  });

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
        value={form.date ?? ''}
        placeholder="date (YYYY-MM-DD)"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        onChangeText={(v) => update({ date: v })}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
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
  rightSlot: { marginLeft: 'auto' },
  toggleLabel: { fontFamily: Fonts.mono, fontSize: FontSizes.xs },
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
