import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from 'react-native-gesture-handler';
import { get_media, submit_media_request, set_media_visibility, MediaType } from '../api';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface AddMediaDialogProps {
  shown: string[];
  hidden: string[];
  onAdd: (name: string) => void;
  onVisibilityChange: (name: string, hidden: boolean) => void;
  onClose: () => void;
}

type Tab = 'hide-show' | 'new';

export default function AddMediaDialog({
  shown,
  hidden,
  onAdd,
  onVisibilityChange,
  onClose,
}: AddMediaDialogProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('hide-show');
  const [media, setMedia] = useState<MediaType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestName, setRequestName] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    get_media()
      .then(setMedia)
      .catch((e) => setError(e?.message || 'failed to load media'));
  }, []);

  const existing = new Set([...shown, ...hidden]);
  const available = (media ?? []).filter((m) => !existing.has(m.name));

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

  const toggle = async (name: string, makeHidden: boolean) => {
    try {
      await set_media_visibility(name, makeHidden, token);
      onVisibilityChange(name, makeHidden);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'failed');
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.titleRow}>
            <Pressable onPress={() => setTab('hide-show')}>
              <Text style={[styles.title, tab !== 'hide-show' && styles.titleInactive]}>
                hide/show artform
              </Text>
            </Pressable>
            <Pressable onPress={() => setTab('new')}>
              <Text style={[styles.title, tab !== 'new' && styles.titleInactive]}>
                new artform
              </Text>
            </Pressable>
          </View>

          {tab === 'hide-show' ? (
            shown.length === 0 && hidden.length === 0 ? (
              <Text style={styles.empty}>no artforms on your profile yet — switch to "new artform"</Text>
            ) : (
              <ScrollView style={styles.panelScroll}>
                {[
                  ...shown.map((n) => ({ name: n, isHidden: false })),
                  ...hidden.map((n) => ({ name: n, isHidden: true })),
                ].map((row) => (
                  <ToggleRow
                    key={row.name}
                    name={row.name}
                    hidden={row.isHidden}
                    onToggle={() => toggle(row.name, !row.isHidden)}
                  />
                ))}
              </ScrollView>
            )
          ) : (
            <ScrollView style={styles.panelScroll}>
              {error && <Text style={styles.error}>{error}</Text>}
              {!error && media === null && (
                <ActivityIndicator color={Colors.darkerGold} style={{ marginVertical: 12 }} />
              )}
              {!error && media !== null && available.length === 0 && (
                <Text style={styles.empty}>all artforms already on your profile</Text>
              )}
              {!error && available.length > 0 && (
                <View>
                  {available.map((m) => (
                    <Pressable
                      key={m.id}
                      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                      onPress={() => {
                        onAdd(m.name);
                        onClose();
                      }}
                    >
                      <Text style={styles.itemText}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.requestSection}>
                <Text style={styles.requestLabel}>propose a media form:</Text>
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
            </ScrollView>
          )}

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

/**
 * A single-row toggle. Row background = green (shown) or red (hidden). Artform
 * name sits in a cream chip, tappable. Swipe left/right also flips it.
 */
function ToggleRow({
  name,
  hidden,
  onToggle,
}: {
  name: string;
  hidden: boolean;
  onToggle: () => void;
}) {
  const onGesture = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.END) {
      if (Math.abs(e.nativeEvent.translationX) > 30) onToggle();
    }
  };

  return (
    <PanGestureHandler onHandlerStateChange={onGesture}>
      <View>
        <Pressable
          onPress={onToggle}
          style={[styles.toggleRow, hidden ? styles.toggleRowHidden : styles.toggleRowShown]}
        >
          <Text style={styles.toggleStateLabel}>{hidden ? 'hidden' : 'shown'}</Text>
          <View style={styles.toggleChip}>
            <Text style={styles.toggleChipText}>{name}</Text>
          </View>
        </Pressable>
      </View>
    </PanGestureHandler>
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
    width: '88%',
    maxHeight: '82%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 18,
    ...Shadows.card,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 8,
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  titleInactive: {
    opacity: 0.4,
  },
  panelScroll: {
    marginBottom: 10,
  },
  error: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.redCoral,
    marginBottom: 8,
  },
  empty: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginVertical: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  itemPressed: {
    backgroundColor: Colors.primaryGold,
  },
  itemText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  requestSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 10,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  toggleRowShown: {
    backgroundColor: Colors.greenBright,
  },
  toggleRowHidden: {
    backgroundColor: Colors.redLight,
  },
  toggleStateLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
    color: '#333',
  },
  toggleChip: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  toggleChipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
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
});
