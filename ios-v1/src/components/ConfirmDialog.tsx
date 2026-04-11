import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'confirm',
  cancelLabel = 'cancel',
  confirmColor = Colors.redCoral,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, { backgroundColor: confirmColor }]} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '80%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 24,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '500',
    marginBottom: 10,
  },
  message: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.white,
  },
  cancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
  },
  confirmBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
    color: Colors.white,
  },
});
