import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import AppToggle from '../components/AppToggle';
import { TextInput } from '../components/AppTextInput';
import CalendarPicker from '../components/CalendarPicker';

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
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
  const [showCal, setShowCal] = useState(false);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState('4'); // additional weekly copies
  const [isPublic, setIsPublic] = useState(false);
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
        setExistingImage(e.image_path);
      } catch (err: any) {
        appAlert('could not load event', err?.message || 'try again');
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
      appAlert('title required', 'give the event a name.');
      return;
    }
    if (!DATE_RE.test(date)) {
      appAlert('check the date', 'use YYYY-MM-DD, e.g. ' + todayLocalISO() + '.');
      return;
    }
    if (time.trim() && !TIME_RE.test(time.trim())) {
      appAlert('check the time', 'use 24-hour HH:MM, e.g. 19:00 — or leave it blank.');
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
      if (!isEdit && repeatWeekly) {
        const weeks = Math.max(0, Math.min(52, parseInt(repeatWeeks || '0', 10) || 0));
        for (let i = 1; i <= weeks; i++) {
          await create_event({ ...body, event_date: addDaysISO(date, 7 * i) }, token);
        }
      }
      if (isEdit) {
        navigation.goBack();
      } else {
        // Land back on the calendar, opened to the new event's day, rather than
        // dropping the creator into its detail page. navigate (not replace) pops
        // to the Events screen already under us instead of stacking a second one.
        navigation.navigate('Events', { focusDate: date });
      }
    } catch (err: any) {
      appAlert('could not save', err?.message || 'try again');
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
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
            <Pressable style={styles.input} onPress={() => setShowCal(true)}>
              <Text style={date ? styles.inputValue : styles.inputPlaceholder}>{date || 'pick a date'}</Text>
            </Pressable>
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
          <AppToggle value={isPublic} onValueChange={setIsPublic} />
        </View>

        {!isEdit && (
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>repeat weekly</Text>
              <Text style={styles.hint}>
                {repeatWeekly ? `also creates the next ${repeatWeeks || '0'} weeks` : 'one-off event'}
              </Text>
            </View>
            {repeatWeekly && (
              <TextInput
                style={styles.weeksInput}
                value={repeatWeeks}
                onChangeText={(t) => setRepeatWeeks(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="4"
                placeholderTextColor={Colors.textMuted}
              />
            )}
            <AppToggle value={repeatWeekly} onValueChange={setRepeatWeekly} />
          </View>
        )}

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

        <CalendarPicker
          visible={showCal}
          value={date}
          onSelect={setDate}
          onClose={() => setShowCal(false)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  scroll: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    gap: 4,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 8,
  },
  label: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 8,
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
    paddingVertical: 8,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  inputValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  inputPlaceholder: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textMuted,
  },
  weeksInput: {
    width: 46,
    borderWidth: 1,
    borderColor: Colors.black,
    backgroundColor: Colors.white,
    textAlign: 'center',
    paddingVertical: 6,
    marginRight: 10,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  multiline: {
    height: 72,
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
    marginTop: 4,
    gap: 12,
  },
  cover: {
    height: 104,
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
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingVertical: 12,
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
