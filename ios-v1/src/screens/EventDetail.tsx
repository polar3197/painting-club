import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '../components/AppAlert';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  EventOut,
  MemberDirectoryEntry,
  get_event,
  delete_event,
  add_event_invites,
  remove_event_invite,
  add_event_hosts,
  remove_event_host,
  get_member_directory,
  resolveImageUrl,
} from '../api';
import { formatEventWhen } from '../utils/date';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type AddMode = 'invite' | 'host';

// Full event view. Hosts get edit/delete plus guest management (invite members
// or promote co-hosts); everyone else sees a read-only card.
export default function EventDetail() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { token, currentUser } = useAuth();
  const eventId: string = route.params.eventId;

  const [event, setEvent] = useState<EventOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // top-right kebab (edit/delete)
  const [pickerMode, setPickerMode] = useState<AddMode | null>(null);
  // Staged member set the picker edits locally. Seeded from the server on open;
  // nothing is sent until "done" (which commits the diff). "cancel" discards it,
  // so cancelling makes no changes at all.
  const [working, setWorking] = useState<string[]>([]);
  const [directory, setDirectory] = useState<MemberDirectoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  // Picker sheet animation. We drive the entrance + keyboard-ride ourselves
  // (Modal animationType="none") so the backdrop FADES in instead of the whole
  // dark scrim wiping up the screen, and the sheet rides the keyboard 1:1.
  // pickerMounted keeps the Modal in the tree through the exit animation.
  const [pickerMounted, setPickerMounted] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const openAnim = useRef(new Animated.Value(0)).current; // 0 closed → 1 open

  const load = useCallback(async () => {
    try {
      setEvent(await get_event(eventId, token));
    } catch (err: any) {
      appAlert('could not load event', err?.message || 'try again');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [eventId, token, navigation]);

  // Refetch on focus so returning from edit shows fresh fields.
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const openPicker = async (mode: AddMode) => {
    setPickerMode(mode);
    setSearch('');
    setWorking(mode === 'host' ? event?.hosts ?? [] : event?.invited ?? []);
    setPickerMounted(true);
    Animated.timing(openAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    if (directory.length === 0) {
      try {
        setDirectory(await get_member_directory(token));
      } catch {
        setDirectory([]);
      }
    }
  };

  // Slide + fade the sheet out, THEN unmount — so the exit is animated too.
  const closePicker = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(openAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) {
          setPickerMounted(false);
          setPickerMode(null);
        }
      },
    );
  }, [openAnim]);

  // Track keyboard height to pad the sheet content up above it. The sheet's
  // background itself always reaches the screen bottom (behind the keyboard),
  // so only the content position depends on this — no scrim gap to animate.
  useEffect(() => {
    if (!pickerMounted) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [pickerMounted]);

  // "done": diff the staged working set against the server's current members
  // and apply the adds/removes. Closes immediately (optimistic); errors surface
  // via alert and a reload. "cancel" never calls this, so it changes nothing.
  const commitPicker = () => {
    if (!event) {
      closePicker();
      return;
    }
    const mode = pickerMode;
    const orig = mode === 'host' ? event.hosts : event.invited || [];
    const toAdd = working.filter((u) => !orig.includes(u));
    const toRemove = orig.filter((u) => !working.includes(u));
    closePicker();
    if (toAdd.length === 0 && toRemove.length === 0) return;
    (async () => {
      try {
        if (mode === 'host') {
          if (toAdd.length) await add_event_hosts(eventId, toAdd, token);
          for (const u of toRemove) await remove_event_host(eventId, u, token);
        } else {
          if (toAdd.length) await add_event_invites(eventId, toAdd, token);
          for (const u of toRemove) await remove_event_invite(eventId, u, token);
        }
      } catch (err: any) {
        appAlert('could not save', err?.message || 'try again');
      } finally {
        await load();
      }
    })();
  };

  const removeHost = async (username: string) => {
    if (busy || !event) return;
    setBusy(true);
    try {
      await remove_event_host(eventId, username, token);
      await load();
    } catch (err: any) {
      appAlert('could not remove', err?.message || 'try again');
    } finally {
      setBusy(false);
    }
  };

  const removeInvite = async (username: string) => {
    if (busy || !event) return;
    setBusy(true);
    try {
      await remove_event_invite(eventId, username, token);
      await load();
    } catch (err: any) {
      appAlert('could not remove', err?.message || 'try again');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setShowDelete(false);
    try {
      await delete_event(eventId, token);
      navigation.goBack();
    } catch (err: any) {
      appAlert('could not delete', err?.message || 'try again');
    }
  };

  if (loading || !event) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  const canEdit = event.can_edit;
  // Members not selectable in this mode: those already staged (working) plus the
  // other role (can't invite a host, can't host an invitee) — matching the
  // prior behaviour, just measured against the staged set now.
  const otherSet = pickerMode === 'host' ? event.invited || [] : event.hosts;
  const excluded = new Set([...working, ...otherSet]);
  const filtered = directory.filter((m) => {
    if (excluded.has(m.username)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${m.firstname || ''} ${m.lastname || ''} ${m.username}`.toLowerCase();
    return name.includes(q);
  });

  // Entrance slide only. The sheet is anchored at the SCREEN BOTTOM and its
  // cream background runs the whole way down behind the keyboard, so there is
  // no scrim gap or corner cut-out to patch — the content is simply padded up
  // above the keyboard via sheetPadBottom.
  const sheetTranslateY = openAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.75, 0],
  });
  // Constant height (independent of the keyboard) so the sheet always reaches
  // the screen bottom; the list is flex:1 inside, so it filters within a fixed
  // window instead of shrinking. The picker autofocuses, so pad up by an
  // estimate before the real keyboard height lands (corrected on show).
  const effectiveKb = kbHeight > 0 ? kbHeight : SCREEN_HEIGHT * 0.4;
  const sheetTotalHeight = SCREEN_HEIGHT - insets.top - 24;
  const sheetPadBottom = effectiveKb + 12;


  return (
    <View style={styles.container}>
      <ConfirmDialog
        visible={showDelete}
        title="delete this event?"
        confirmLabel="yes, delete"
        cancelLabel="keep it"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={confirmDelete}
        onCancel={() => setShowDelete(false)}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {event.image_path ? (
          <Image source={{ uri: resolveImageUrl(event.image_path) }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverBlank, event.color ? { backgroundColor: event.color } : null]} />
        )}

        <View style={[styles.body, { paddingTop: event.image_path ? 20 : insets.top + 20 }]}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.when}>{formatEventWhen(event.event_date, event.event_time)}</Text>
          <Text style={styles.meta}>
            {event.is_public ? 'public' : 'invite-only'} · hosted by @{event.creator_username}
          </Text>

          {!!event.description && <Text style={styles.description}>{event.description}</Text>}

          {/* Hosts */}
          <Text style={styles.sectionLabel}>hosts</Text>
          <View style={styles.chipWrap}>
            {event.hosts.map((h) => (
              <View key={h} style={styles.chip}>
                <Text style={styles.chipText}>@{h}</Text>
                {canEdit && h !== event.creator_username && (
                  <Pressable hitSlop={6} onPress={() => removeHost(h)}>
                    <Text style={styles.chipX}>×</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {canEdit && (
              <Pressable style={styles.addChip} onPress={() => openPicker('host')}>
                <Text style={styles.addChipText}>+ co-host</Text>
              </Pressable>
            )}
          </View>

          {/* Invited — hosts only (server hides the list from invitees) */}
          {canEdit && (
            <>
              <Text style={styles.sectionLabel}>invited</Text>
              <View style={styles.chipWrap}>
                {(event.invited || []).map((u) => (
                  <View key={u} style={styles.chip}>
                    <Text style={styles.chipText}>@{u}</Text>
                    <Pressable hitSlop={6} onPress={() => removeInvite(u)}>
                      <Text style={styles.chipX}>×</Text>
                    </Pressable>
                  </View>
                ))}
                {(event.invited || []).length === 0 && (
                  <Text style={styles.emptyChips}>no one invited yet</Text>
                )}
                <Pressable style={styles.addChip} onPress={() => openPicker('invite')}>
                  <Text style={styles.addChipText}>+ invite</Text>
                </Pressable>
              </View>
            </>
          )}

        </View>
      </ScrollView>

      {/* Edit/delete moved into a top-right kebab overlaying the cover. */}
      {canEdit && (
        <>
          {menuOpen && (
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          )}
          <View style={[styles.kebabWrap, { top: insets.top + 8 }]}>
            <Pressable
              style={styles.kebabBtn}
              hitSlop={8}
              onPress={() => setMenuOpen((v) => !v)}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={Colors.white} />
            </Pressable>
            {menuOpen && (
              <View style={styles.kebabMenu}>
                <Pressable
                  style={styles.kebabItem}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate('EventEdit', { eventId });
                  }}
                >
                  <Text style={styles.kebabItemText}>edit</Text>
                </Pressable>
                <View style={styles.kebabDivider} />
                <Pressable
                  style={styles.kebabItem}
                  onPress={() => {
                    setMenuOpen(false);
                    setShowDelete(true);
                  }}
                >
                  <Text style={[styles.kebabItemText, { color: Colors.redCoral }]}>delete</Text>
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}

      {/* Member picker */}
      <Modal
        visible={pickerMounted}
        transparent
        animationType="none"
        onRequestClose={closePicker}
      >
        <View style={styles.pickerRoot}>
          {/* Backdrop fades in (opacity) instead of the whole scrim wiping up
              the screen with the modal slide. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.pickerBackdrop, { opacity: openAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          </Animated.View>
          <Animated.View
            style={[
              styles.pickerSheet,
              {
                height: sheetTotalHeight,
                paddingBottom: sheetPadBottom,
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <Text style={styles.pickerTitle}>
              {pickerMode === 'host' ? 'add a co-host' : 'invite a member'}
            </Text>
            <TextInput
              style={styles.pickerSearch}
              value={search}
              onChangeText={setSearch}
              placeholder="search members"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoFocus
            />
            {working.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.invitedStrip}
                contentContainerStyle={styles.invitedStripContent}
                keyboardShouldPersistTaps="handled"
              >
                {working.map((u) => {
                  const locked = pickerMode === 'host' && u === event.creator_username;
                  return (
                    <View key={u} style={styles.invitedCard}>
                      <Text style={styles.invitedCardText} numberOfLines={1}>@{u}</Text>
                      {!locked && (
                        <Pressable
                          hitSlop={6}
                          onPress={() => setWorking((w) => w.filter((x) => x !== u))}
                        >
                          <Text style={styles.invitedCardX}>×</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.emptyChips}>no members to add</Text>
              ) : (
                filtered.map((m) => (
                  <Pressable
                    key={m.username}
                    style={styles.pickerRow}
                    onPress={() =>
                      setWorking((w) => (w.includes(m.username) ? w : [...w, m.username]))
                    }
                  >
                    <Text style={styles.pickerName}>
                      {m.firstname || m.lastname
                        ? `${m.firstname || ''} ${m.lastname || ''}`.trim()
                        : m.username}
                    </Text>
                    <Text style={styles.pickerUser}>@{m.username}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View style={styles.pickerActions}>
              <Pressable style={[styles.pickerActionBtn, styles.pickerCancelBtn]} onPress={closePicker}>
                <Text style={styles.pickerActionText}>cancel</Text>
              </Pressable>
              <Pressable style={[styles.pickerActionBtn, styles.pickerConfirmBtn]} onPress={commitPicker}>
                <Text style={styles.pickerActionText}>done</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    width: '100%',
    height: 220,
  },
  coverBlank: {
    backgroundColor: Colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  body: {
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
  },
  when: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
    marginTop: 6,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  description: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    lineHeight: 24,
    marginTop: 18,
  },
  sectionLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 24,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  chipX: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  addChip: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addChipText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textPrimary,
  },
  emptyChips: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textMuted,
  },
  pickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Dark scrim, faded in via openAnim (see the picker Modal). Swap this View's
  // content for an expo-blur <BlurView> to get a real blur instead of a scrim.
  pickerBackdrop: {
    backgroundColor: Colors.overlay,
  },
  pickerSheet: {
    backgroundColor: Colors.mainBg,
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  pickerTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
    marginBottom: 12,
  },
  pickerSearch: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    marginBottom: 10,
  },
  pickerList: {
    flex: 1,
  },
  invitedStrip: {
    flexGrow: 0,
    marginBottom: 10,
  },
  invitedStripContent: {
    gap: 8,
    paddingRight: 4,
  },
  invitedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  invitedCardText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
    maxWidth: 140,
  },
  invitedCardX: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  kebabWrap: {
    position: 'absolute',
    right: 12,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  kebabBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabMenu: {
    marginTop: 6,
    minWidth: 130,
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
  },
  kebabItem: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  kebabItemText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  kebabDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  pickerName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  pickerUser: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  pickerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  pickerActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickerCancelBtn: {
    backgroundColor: Colors.secondary,
  },
  pickerConfirmBtn: {
    backgroundColor: Colors.primaryGold,
  },
  pickerActionText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
