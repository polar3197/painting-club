import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import {
  EventOut,
  create_event,
  get_event,
  update_event,
  upload_event_image,
  resolveImageUrl,
} from '../api';
import { todayLocalISO } from '../utils/date';

// Accent swatches a host can tag an event with. First = the Home event ball blue.
const SWATCHES = ['#1E73BE', '#E30022', '#0c8c6e', '#d2a046', '#7c5cc4', '#111111'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

type Picked = { uri: string; name: string; type: string } | null;

// Create (no eventId) or edit (eventId) an event's core fields. Guest/co-host
// management lives on EventDetail since those endpoints need an existing event.
export default function EventEdit() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { token } = useAuth();
  const eventId: string | undefined = route.params?.eventId;
  const isEdit = !!eventId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayLocalISO());
  const [time, setTime] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        const e = await get_event(eventId!, token);
        if (!alive) return;
        setTitle(e.title);
        setDescription(e.description || '');
        setDate(e.event_date);
        setTime(e.event_time ? e.event_time.slice(0, 5) : '');
        setIsPublic(e.is_public);
        setColor(e.color);
        setExistingImage(e.image_path);
      } catch (err: any) {
        Alert.alert('could not load event', err?.message || 'try again');
        navigation.goBack();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isEdit, eventId, token, navigation]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      name: asset.uri.split('/').pop() || 'event.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
  };

  const save = async () => {
    const t = title.trim();
    if (!t) {
      Alert.alert('title required', 'give the event a name.');
      return;
    }
    if (!DATE_RE.test(date)) {
      Alert.alert('check the date', 'use YYYY-MM-DD, e.g. ' + todayLocalISO() + '.');
      return;
    }
    if (time.trim() && !TIME_RE.test(time.trim())) {
      Alert.alert('check the time', 'use 24-hour HH:MM, e.g. 19:00 — or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: t,
        description: description.trim() || null,
        event_date: date,
        event_time: time.trim() || null,
        is_public: isPublic,
        color,
      };
      let id = eventId;
      if (isEdit) {
        await update_event(eventId!, body, token);
      } else {
        const created: EventOut = await create_event(body, token);
        id = created.id;
      }
      if (picked && id) {
        await upload_event_image(id, picked, token);
      }
      if (isEdit) {
        navigation.goBack();
      } else {
        // Replace so back from the new event's detail returns to the list.
        navigation.replace('EventDetail', { eventId: id });
      }
    } catch (err: any) {
      Alert.alert('could not save', err?.message || 'try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  const previewUri = picked?.uri || (existingImage ? resolveImageUrl(existingImage) : null);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{isEdit ? 'edit event' : 'new event'}</Text>

        <Text style={styles.label}>title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="what's happening"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="details, where, what to bring…"
          placeholderTextColor={Colors.textMuted}
          multiline
        />

        <View style={styles.rowTwo}>
          <View style={styles.half}>
            <Text style={styles.label}>date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>time</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="HH:MM (optional)"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>public</Text>
            <Text style={styles.hint}>
              {isPublic ? 'anyone in the club can see it' : 'only hosts + invited members'}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: Colors.greenHover, false: Colors.textMuted }}
          />
        </View>

        <Text style={styles.label}>accent</Text>
        <View style={styles.swatchRow}>
          <Pressable
            style={[styles.swatch, styles.swatchNone, !color && styles.swatchOn]}
            onPress={() => setColor(null)}
          >
            <Text style={styles.swatchNoneText}>—</Text>
          </Pressable>
          {SWATCHES.map((c) => (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>

        <Text style={styles.label}>cover image</Text>
        <Pressable style={styles.cover} onPress={pickImage}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.coverImg} />
          ) : (
            <Text style={styles.coverPlaceholder}>tap to add a cover</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'saving…' : isEdit ? 'save' : 'create event'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
    gap: 6,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  label: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 14,
    marginBottom: 4,
  },
  hint: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  multiline: {
    height: 96,
    textAlignVertical: 'top',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  swatch: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: '#000',
  },
  swatchNone: {
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchNoneText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  swatchOn: {
    borderWidth: 3,
  },
  cover: {
    height: 160,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  saveBtn: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
