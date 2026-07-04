import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { TextInput } from './AppTextInput';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { export_my_data, delete_account } from '../api';

interface Props {
  visible: boolean;
  username: string;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteAccountDialog({ visible, username, onClose, onDeleted }: Props) {
  const { token } = useAuth();
  const [typed, setTyped] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const matches = typed.trim() === username && username.length > 0;

  const reset = () => {
    setTyped('');
    setDownloaded(false);
    setDownloading(false);
    setDeleting(false);
  };

  const handleClose = () => {
    if (deleting || downloading) return;
    reset();
    onClose();
  };

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const data = await export_my_data(token);
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, 'painting-club-export.json');
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'save your data',
          UTI: 'public.json',
        });
      }
      setDownloaded(true);
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'could not export your data');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !matches) return;
    setDeleting(true);
    try {
      await delete_account(token);
      reset();
      onDeleted();
    } catch (err: any) {
      Alert.alert('Could not delete account', err?.message || 'try again');
      setDeleting(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>delete account</Text>
          <Text style={styles.message}>
            your art, comments, and profile will be permanently removed. this can't be undone.
          </Text>

          <Pressable
            style={[styles.downloadRow, downloaded && styles.downloadRowDone]}
            onPress={handleDownload}
            disabled={downloading || deleting}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={Colors.textPrimary} />
            ) : (
              <Text style={styles.downloadText}>
                {downloaded
                  ? 'data downloaded ✓ (save images before deleting)'
                  : 'download a copy of my data'}
              </Text>
            )}
          </Pressable>

          <Text style={styles.fieldLabel}>type your username to confirm</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={username}
            placeholderTextColor={Colors.textMuted}
            editable={!deleting}
          />

          <View style={styles.buttons}>
            <Pressable
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={deleting || downloading}
            >
              <Text style={styles.cancelText}>cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.deleteBtn, (!matches || deleting) && styles.deleteBtnDisabled]}
              onPress={handleDelete}
              disabled={!matches || deleting}
            >
              <Text style={styles.deleteText}>
                {deleting ? 'deleting...' : 'delete forever'}
              </Text>
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
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 22,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    marginBottom: 10,
  },
  message: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 18,
  },
  downloadRow: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginBottom: 18,
  },
  downloadRowDone: {
    backgroundColor: Colors.secondary,
  },
  downloadText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  fieldLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 6,
    color: Colors.textPrimary,
    marginBottom: 22,
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
    color: Colors.black,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.redCoral,
  },
  deleteBtnDisabled: {
    opacity: 0.4,
  },
  deleteText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
    color: Colors.white,
  },
});
