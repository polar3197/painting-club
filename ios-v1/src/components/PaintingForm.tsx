import React, { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Visual2DOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface PaintingFormProps {
  onDataChange: (data: Record<string, any>) => void;
  initialData?: Visual2DOut;
}

export default function PaintingForm({ onDataChange, initialData }: PaintingFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title ?? '',
    location: initialData?.location ?? '',
    date: initialData?.date ?? '',
    song: initialData?.song ?? '',
    song_artist: initialData?.song_artist ?? '',
    width: initialData?.width ?? null as number | null,
    height: initialData?.height ?? null as number | null,
    keywords: initialData?.keywords?.join(', ') ?? '',
    comments_enabled: initialData?.comments_enabled ?? false,
    file: null as { uri: string; name: string; type: string } | null,
  });

  const thumbPos = useRef(new Animated.Value(form.comments_enabled ? 18 : 0)).current;

  const update = (patch: Record<string, any>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onDataChange(next);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = uri.split('/').pop() || 'image.jpg';
      const type = asset.mimeType || 'image/jpeg';
      update({ file: { uri, name, type } });
    }
  };

  const toggleComments = () => {
    const next = !form.comments_enabled;
    Animated.timing(thumbPos, { toValue: next ? 18 : 0, duration: 200, useNativeDriver: true }).start();
    update({ comments_enabled: next });
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.dropbox} onPress={pickImage}>
        {form.file ? (
          <Image source={{ uri: form.file.uri }} style={styles.previewImage} contentFit="contain" />
        ) : (
          <Text style={styles.dropboxText}>tap to select art</Text>
        )}
      </Pressable>

      <TextInput
        style={styles.input}
        value={form.title}
        placeholder="title"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ title: v })}
      />
      <TextInput
        style={styles.input}
        value={form.location}
        placeholder="location"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ location: v })}
      />
      <TextInput
        style={styles.input}
        value={form.date}
        placeholder="date (YYYY-MM-DD)"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ date: v })}
      />
      <TextInput
        style={styles.input}
        value={form.song}
        placeholder="song"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ song: v })}
      />
      <TextInput
        style={styles.input}
        value={form.song_artist}
        placeholder="artist"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ song_artist: v })}
      />
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
      <TextInput
        style={styles.input}
        value={form.keywords}
        placeholder="keywords (comma separated)"
        placeholderTextColor={Colors.textMuted}
        onChangeText={(v) => update({ keywords: v })}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  dropbox: {
    height: 200,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    marginBottom: 8,
  },
  dropboxText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
  },
  previewImage: {
    width: '100%',
    height: '100%',
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
