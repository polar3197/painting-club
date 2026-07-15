import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  LayoutChangeEvent,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput } from './AppTextInput';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { get_media, submit_media_request, set_media_visibility, reorder_media, MediaType, MediaTypeKind } from '../api';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface AddMediaDialogProps {
  shown: string[];
  hidden: string[];
  onAdd: (name: string) => void;
  onVisibilityChange: (name: string, hidden: boolean) => void;
  onClose: () => void;
  // Fired after a hold-and-drag reorder persists, with every medium name in
  // its new order (shown and hidden interleaved as displayed).
  onReorder?: (names: string[]) => void;
  // When set, only the "new" pane is shown (no hide/show tab) — used by the
  // Add flow's medium picker.
  onlyNew?: boolean;
}

type Tab = 'hide-show' | 'new';

// The requester classifies their proposed media form so the admin doesn't have
// to. Labels are the human-facing names; values match the backend discriminator.
const TYPE_OPTIONS: { value: MediaTypeKind; label: string }[] = [
  { value: 'visual_2d', label: '2d-visual' },
  { value: 'written_form', label: 'written-form' },
  { value: 'audio', label: 'audio' },
];

export default function AddMediaDialog({
  shown,
  hidden,
  onAdd,
  onVisibilityChange,
  onClose,
  onReorder,
  onlyNew = false,
}: AddMediaDialogProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>(onlyNew ? 'new' : 'hide-show');
  const [media, setMedia] = useState<MediaType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestName, setRequestName] = useState('');
  const [requestType, setRequestType] = useState<MediaTypeKind | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  // Row order, seeded from the server's (position, name) ordering at mount.
  // Toggling hide/show doesn't reshuffle it; hold-and-drag rewrites it.
  const [order, setOrder] = useState<string[]>(() => [...shown, ...hidden]);
  const hiddenSet = new Set(hidden);

  // ---- hold-and-drag reorder (mirrors the album tracklist mechanic) ---------
  // One pan over the whole list, armed by a long press. The touched row lifts,
  // rows reflow as the finger crosses neighbours (step accumulator against
  // measured row heights), and the new order persists on release.
  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const orderRef = useRef<string[]>(order);
  orderRef.current = order;
  const dragRef = useRef<{ name: string; lastTy: number; moved: boolean } | null>(null);

  const commitOrder = async (names: string[]) => {
    try {
      await reorder_media(names, token);
      onReorder?.(names);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'reorder failed');
    }
  };

  const dragPan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(300)
    .onStart((e) => {
      const names = orderRef.current;
      let acc = 0;
      let idx = -1;
      for (let i = 0; i < names.length; i++) {
        const h = heightsRef.current.get(names[i]) ?? 46;
        if (e.y < acc + h) { idx = i; break; }
        acc += h;
      }
      if (idx < 0) return;
      dragRef.current = { name: names[idx], lastTy: 0, moved: false };
      setDraggingName(names[idx]);
      setScrollEnabled(false);
    })
    .onUpdate((e) => {
      const st = dragRef.current;
      if (!st) return;
      const names = [...orderRef.current];
      let i = names.indexOf(st.name);
      if (i < 0) return;
      let changed = false;
      for (;;) {
        const delta = e.translationY - st.lastTy;
        if (delta > 0 && i < names.length - 1) {
          const nextH = heightsRef.current.get(names[i + 1]) ?? 46;
          if (delta > nextH * 0.6) {
            names.splice(i + 1, 0, names.splice(i, 1)[0]);
            st.lastTy += nextH;
            i++;
            changed = true;
            continue;
          }
        } else if (delta < 0 && i > 0) {
          const prevH = heightsRef.current.get(names[i - 1]) ?? 46;
          if (-delta > prevH * 0.6) {
            names.splice(i - 1, 0, names.splice(i, 1)[0]);
            st.lastTy -= prevH;
            i--;
            changed = true;
            continue;
          }
        }
        break;
      }
      if (changed) {
        st.moved = true;
        orderRef.current = names;
        setOrder(names);
      }
    })
    .onEnd(() => {
      const st = dragRef.current;
      if (st?.moved) commitOrder(orderRef.current);
    })
    .onFinalize(() => {
      dragRef.current = null;
      setDraggingName(null);
      setScrollEnabled(true);
    });

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
    if (!name || !requestType) return;
    try {
      await submit_media_request(name, requestType, token);
      setRequestName('');
      setRequestType(null);
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
      {/* Lift the whole dialog above the keyboard — the "propose a media form"
          input is a fixed footer at the bottom of the 520px dialog and would
          otherwise sit behind the keyboard on every screen size. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
              order.length === 0 ? (
                <Text style={styles.empty}>you've got to add an art form before you can hide them. click new. top right.</Text>
              ) : (
                <>
                  <View style={styles.toggleHeaders}>
                    <Text style={styles.shownHeader}>shown</Text>
                    <Text style={styles.hiddenHeader}>hidden</Text>
                  </View>
                  <ScrollView style={styles.panelScroll} scrollEnabled={scrollEnabled}>
                    {/* One long-press-armed pan over the whole list drives the
                        hold-and-drag reorder; quick taps and horizontal swipes
                        still hit each row's own toggle handlers. */}
                    <GestureDetector gesture={dragPan}>
                      <View>
                        {order.map((name) => {
                          const isHidden = hiddenSet.has(name);
                          // 1-based position among the shown (green) tabs only —
                          // matches the tab order on the profile.
                          const shownRank = isHidden
                            ? null
                            : order.filter((n) => !hiddenSet.has(n)).indexOf(name) + 1;
                          return (
                            <ToggleRow
                              key={name}
                              name={name}
                              hidden={isHidden}
                              positionNumber={shownRank}
                              dragging={draggingName === name}
                              onHeight={(h) => heightsRef.current.set(name, h)}
                              onToggle={() => toggle(name, !hiddenSet.has(name))}
                            />
                          );
                        })}
                      </View>
                    </GestureDetector>
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
                    <Pressable
                      style={[styles.requestBtn, (!requestName.trim() || !requestType) && styles.requestBtnDisabled]}
                      onPress={handleRequest}
                      disabled={!requestName.trim() || !requestType}
                    >
                      <Text style={styles.requestBtnText}>request</Text>
                    </Pressable>
                  </View>
                  <View style={styles.typeRow}>
                    {TYPE_OPTIONS.map((opt) => {
                      const selected = requestType === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          style={[styles.typeChip, selected && styles.typeChipSelected]}
                          onPress={() => setRequestType(opt.value)}
                        >
                          <Text style={styles.typeChipText}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
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
      </KeyboardAvoidingView>
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
  positionNumber,
  dragging,
  onHeight,
  onToggle,
}: {
  name: string;
  hidden: boolean;
  // 1-based tab position among the shown (green) rows, or null when hidden.
  positionNumber: number | null;
  dragging: boolean;
  onHeight: (h: number) => void;
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

  const onLayout = (e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
    onHeight(e.nativeEvent.layout.height + 6); // +6 for marginBottom
  };

  // Tap toggles hide/show; a long-press arms the parent's hold-and-drag
  // reorder. No per-row pan gesture — it would intercept the long-press, and
  // tap already covers toggling.
  return (
    <Pressable
      onPress={onToggle}
      onLayout={onLayout}
      style={[
        styles.toggleRow,
        hidden ? styles.toggleRowHidden : styles.toggleRowShown,
        dragging && styles.toggleRowDragging,
      ]}
    >
      {/* Tab-order number on shown rows only — matches the profile ordering,
          renumbering live as rows are dragged or toggled. */}
      {positionNumber != null && (
        <Text style={styles.positionBadge}>{positionNumber}</Text>
      )}
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
  requestBtnDisabled: {
    opacity: 0.4,
  },
  requestBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  typeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingVertical: 6,
    alignItems: 'center',
  },
  typeChipSelected: {
    // Selection is signalled by the fill colour alone — no weight/size shift.
    backgroundColor: Colors.primaryGold,
  },
  typeChipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
    color: Colors.textSecondary,
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
  toggleRowDragging: {
    opacity: 0.9,
    borderWidth: 2,
    ...Shadows.card,
  },
  positionBadge: {
    // Sits in the green area to the right of the name chip (shown rows only).
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    lineHeight: 40,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: '#000',
    zIndex: 1,
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
