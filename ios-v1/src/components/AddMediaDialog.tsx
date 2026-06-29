import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from 'react-native-gesture-handler';
import { get_media, submit_media_request, set_media_visibility, MediaType } from '../api';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface AddMediaDialogProps {
  shown: string[];
  hidden: string[];
  onAdd: (name: string) => void;
  onVisibilityChange: (name: string, hidden: boolean) => void;
  onClose: () => void;
  // When set, only the "new" pane is shown (no hide/show tab) — used by the
  // Add flow's medium picker.
  onlyNew?: boolean;
}

type Tab = 'hide-show' | 'new';

export default function AddMediaDialog({
  shown,
  hidden,
  onAdd,
  onVisibilityChange,
  onClose,
  onlyNew = false,
}: AddMediaDialogProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>(onlyNew ? 'new' : 'hide-show');
  const [media, setMedia] = useState<MediaType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestName, setRequestName] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  // Freeze order at mount so toggles don't reshuffle.
  const initialOrder = useMemo(() => [...shown, ...hidden], []); // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenSet = new Set(hidden);

  useEffect(() => {
    get_media()
      .then(setMedia)
      .catch((e) => setError(e?.message || 'failed to load media'));
  }, []);

  // The standalone "new" picker (Add flow) lets you pick a medium you've hidden
  // as well as brand-new ones, so only exclude the currently-shown ones. The
  // profile dialog keeps hidden media out of "new" since its hide/show tab
  // already manages them.
  const existing = onlyNew ? new Set(shown) : new Set([...shown, ...hidden]);
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
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.titleRow}>
            {onlyNew ? (
              <Text numberOfLines={1} style={styles.title}>new</Text>
            ) : (
              <>
                <Pressable onPress={() => setTab('hide-show')}>
                  <Text
                    numberOfLines={1}
                    style={[styles.title, tab !== 'hide-show' && styles.titleInactive]}
                  >
                    hide/show
                  </Text>
                </Pressable>
                <Pressable onPress={() => setTab('new')}>
                  <Text
                    numberOfLines={1}
                    style={[styles.title, tab !== 'new' && styles.titleInactive]}
                  >
                    new
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.panelArea}>
            {tab === 'hide-show' ? (
              initialOrder.length === 0 ? (
                <Text style={styles.empty}>you've got to add an art form before you can hide them. click new. top right.</Text>
              ) : (
                <>
                  <View style={styles.toggleHeaders}>
                    <Text style={styles.shownHeader}>shown</Text>
                    <Text style={styles.hiddenHeader}>hidden</Text>
                  </View>
                  <ScrollView style={styles.panelScroll}>
                    {initialOrder.map((name) => (
                      <ToggleRow
                        key={name}
                        name={name}
                        hidden={hiddenSet.has(name)}
                        onToggle={() => toggle(name, !hiddenSet.has(name))}
                      />
                    ))}
                  </ScrollView>
                </>
              )
            ) : (
              <>
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
                </ScrollView>

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
              </>
            )}
          </View>

          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>close</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Fixed-width chip (5/12 of row) that slides left<->right on toggle. Row bg
 * goes green(shown) <-> red(hidden). Tap row or swipe chip to flip.
 */
const CHIP_GUTTER = 4;

function ToggleRow({
  name,
  hidden,
  onToggle,
}: {
  name: string;
  hidden: boolean;
  onToggle: () => void;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const chipWidth = rowWidth * (5 / 12);
  // Travel between the left gutter and the right gutter.
  const travel = Math.max(0, rowWidth - chipWidth - 2 * CHIP_GUTTER);

  const translate = useRef(new Animated.Value(hidden ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hidden, translate]);

  const translateX = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  const onGesture = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.END) {
      if (Math.abs(e.nativeEvent.translationX) > 30) onToggle();
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  };

  return (
    <PanGestureHandler onHandlerStateChange={onGesture}>
      <Pressable
        onPress={onToggle}
        onLayout={onLayout}
        style={[styles.toggleRow, hidden ? styles.toggleRowHidden : styles.toggleRowShown]}
      >
        {rowWidth > 0 && (
          <Animated.View
            style={[
              styles.toggleChip,
              {
                width: chipWidth,
                left: CHIP_GUTTER,
                transform: [{ translateX }],
              },
            ]}
          >
            <Text style={styles.toggleChipText} numberOfLines={1}>{name}</Text>
          </Animated.View>
        )}
      </Pressable>
    </PanGestureHandler>
  );
}

const DIALOG_HEIGHT = 520;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '88%',
    height: DIALOG_HEIGHT,
    maxHeight: '88%',
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
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  titleInactive: {
    opacity: 0.4,
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
  },
  panelScroll: {
    flex: 1,
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
  toggleHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  shownHeader: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: '#000',
  },
  hiddenHeader: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: '#000',
  },
  toggleRow: {
    position: 'relative',
    height: 40,
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 6,
    overflow: 'hidden',
  },
  toggleRowShown: {
    backgroundColor: Colors.greenBright,
  },
  toggleRowHidden: {
    backgroundColor: Colors.redLight,
  },
  toggleChip: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  toggleChipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
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
