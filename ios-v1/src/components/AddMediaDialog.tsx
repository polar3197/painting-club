import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { get_media, submit_media_request, MediaType } from '../api';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface AddMediaDialogProps {
  existing: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}

export default function AddMediaDialog({ existing, onPick, onClose }: AddMediaDialogProps) {
  const { token } = useAuth();
  const [media, setMedia] = useState<MediaType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestName, setRequestName] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  const handleRequest = async () => {
    const name = requestName.trim();
    if (!name) return;
    try {
      await submit_media_request(name, token);
      setRequestName('');
      setRequestSent(true);
      setTimeout(() => setRequestSent(false), 2000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'request failed');
    }
  };

  useEffect(() => {
    get_media()
      .then(setMedia)
      .catch((e) => setError(e?.message || 'failed to load media'));
  }, []);

  const available = (media ?? []).filter((m) => !existing.includes(m.name));

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>add artform</Text>

          {error && <Text style={styles.error}>{error}</Text>}
          {!error && media === null && (
            <ActivityIndicator color={Colors.darkerGold} style={{ marginVertical: 16 }} />
          )}
          {!error && media !== null && available.length === 0 && (
            <Text style={styles.empty}>all artforms already on your profile</Text>
          )}
          {!error && available.length > 0 && (
            <ScrollView style={styles.list}>
              {available.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => {
                    onPick(m.name);
                    onClose();
                  }}
                >
                  <Text style={styles.itemText}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.requestSection}>
            <Text style={styles.requestLabel}>don't see it? request a new artform:</Text>
            <View style={styles.requestRow}>
              <TextInput
                style={styles.requestInput}
                value={requestName}
                placeholder="artform name"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                onChangeText={setRequestName}
              />
              <Pressable style={styles.requestBtn} onPress={handleRequest}>
                <Text style={styles.requestBtnText}>request</Text>
              </Pressable>
            </View>
            {requestSent && <Text style={styles.requestSentMsg}>request sent</Text>}
          </View>

          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>close</Text>
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
    maxHeight: '70%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 20,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '500',
    marginBottom: 12,
  },
  error: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.redCoral,
    marginBottom: 12,
  },
  empty: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginVertical: 16,
  },
  list: {
    maxHeight: 320,
    marginBottom: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  itemPressed: {
    backgroundColor: Colors.primaryGold,
  },
  itemText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  requestSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#000',
    marginBottom: 8,
  },
  requestLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  requestRow: {
    flexDirection: 'row',
    gap: 8,
  },
  requestInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: FontSizes.xs,
  },
  requestBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
  },
  requestBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
  },
  requestSentMsg: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
    color: Colors.greenBright,
    marginTop: 6,
  },
});
