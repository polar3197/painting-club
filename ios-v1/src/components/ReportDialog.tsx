import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { appAlert } from './AppAlert';
import { TextInput } from './AppTextInput';
import { useAuth } from '../context/AuthContext';
import { submit_report } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface Props {
  visible: boolean;
  targetType: 'art' | 'comment';
  targetId: string | null;
  onClose: () => void;
}

export default function ReportDialog({ visible, targetType, targetId, onClose }: Props) {
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      await submit_report(targetType, targetId, reason.trim() || null, token);
      setReason('');
      onClose();
    } catch (err: any) {
      appAlert('Could not send', err?.message || 'try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdropFill} onPress={handleCancel}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.title}>report this {targetType === 'art' ? 'piece' : 'comment'}</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="anything to add? (optional)"
              placeholderTextColor={Colors.textMuted}
              multiline
              autoCapitalize="sentences"
            />
            <View style={styles.buttons}>
              <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={submitting}>
                <Text style={styles.cancelText}>cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, submitting && styles.disabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Text style={styles.submitText}>{submitting ? 'sending...' : 'send'}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  backdropFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 20,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.white,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
  submitBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  submitText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
});
