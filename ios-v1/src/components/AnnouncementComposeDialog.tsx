import React, { useRef } from 'react';
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
  // Raw RN input (not the app-wide AppTextInput) so the title/body keep
  // autocorrect + spellcheck on — matches ConversationThread's message field.
  TextInput,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { create_announcement } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Swipe-down compose sheet for a new announcement (contributor-gated by the
// caller). Mirrors ProposePromptDialog's sheet mechanics.
export default function AnnouncementComposeDialog({
  onClose,
  onPosted,
}: {
  onClose: () => void;
  onPosted: () => void;
}) {
  const { token } = useAuth();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const translateY = useRef(new Animated.Value(0)).current;
  const close = () =>
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);

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
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || submitting) return;
    setSubmitting(true);
    try {
      await create_announcement(t, b, token);
      onPosted();
      close();
    } catch (err: any) {
      setSubmitting(false);
      Alert.alert('could not post', err?.message || 'something went wrong — try again.');
    }
  };

  const canSubmit = !!title.trim() && !!body.trim() && !submitting;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handleArea} {...pan.panHandlers}>
            <View style={styles.handle} />
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>new announcement</Text>

            <Text style={styles.label}>title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="what's happening"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
            />

            <Text style={styles.label}>details</Text>
            <TextInput
              style={styles.bodyInput}
              value={body}
              onChangeText={setBody}
              placeholder="the announcement"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              multiline
            />

            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>{submitting ? 'posting…' : 'post'}</Text>
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
  titleInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    padding: 10,
    marginBottom: 16,
  },
  bodyInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
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
