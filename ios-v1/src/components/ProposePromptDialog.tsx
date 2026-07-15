import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Keyboard,
  Platform,
} from 'react-native';
import { TextInput } from './AppTextInput';
import { useAuth } from '../context/AuthContext';
import { create_prompt_suggestion, get_media, MediaType } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Little swipe-down sheet: member writes a prompt idea, optionally tags a
// medium (or "any medium"), and submits. Lands in the admin "prompts" tab.
export default function ProposePromptDialog({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [media, setMedia] = useState<MediaType[]>([]);
  // null = "any medium" (medium-agnostic suggestion).
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    get_media().then(setMedia).catch(() => {});
  }, []);

  const translateY = useRef(new Animated.Value(0)).current;
  const close = () =>
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);

  // Swipe down on the grab handle to dismiss (mirrors AddArtDialog).
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120) close();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const submit = async () => {
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await create_prompt_suggestion(body, mediaId, token);
      close();
      Alert.alert('sent!', 'your prompt idea is in the queue for review.');
    } catch (err: any) {
      setSubmitting(false);
      Alert.alert('could not send', err?.message || 'something went wrong — try again.');
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area above the sheet also closes it. */}
        <Pressable style={styles.backdropFill} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handleArea} {...pan.panHandlers}>
            <View style={styles.handle} />
          </View>
          {/* iOS insets the scroll content by the keyboard height, so the input
              and submit button ride above the keyboard on a near-full sheet. */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>propose next week's prompt</Text>

            <Text style={styles.label}>medium</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.chip, mediaId === null && styles.chipOn]}
                onPress={() => setMediaId(null)}
              >
                <Text style={styles.chipText}>any medium</Text>
              </Pressable>
              {media.map((m) => (
                <Pressable
                  key={m.id}
                  style={[styles.chip, mediaId === m.id && styles.chipOn]}
                  onPress={() => setMediaId(m.id)}
                >
                  <Text style={styles.chipText}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>the prompt</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="describe the prompt"
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <Pressable
              style={[styles.submit, (!text.trim() || submitting) && styles.submitDisabled]}
              onPress={submit}
              disabled={!text.trim() || submitting}
            >
              <Text style={styles.submitText}>{submitting ? 'submitting…' : 'submit'}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.mainBg,
    borderTopWidth: 1,
    borderColor: '#000',
    // Nearly full-screen; the top sliver stays as a tappable dimmed backdrop.
    height: SCREEN_HEIGHT * 0.92,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
    opacity: 0.25,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 14,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: Colors.primaryGold,
  },
  chipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    // Tall to fill the near-full sheet; grows with the text.
    minHeight: 200,
    padding: 10,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submit: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
});
