import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
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
  const [pickerMode, setPickerMode] = useState<AddMode | null>(null);
  const [directory, setDirectory] = useState<MemberDirectoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEvent(await get_event(eventId, token));
    } catch (err: any) {
      Alert.alert('could not load event', err?.message || 'try again');
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
    if (directory.length === 0) {
      try {
        setDirectory(await get_member_directory(token));
      } catch {
        setDirectory([]);
      }
    }
  };

  const addMember = async (username: string) => {
    if (busy || !event) return;
    setBusy(true);
    try {
      if (pickerMode === 'host') {
        await add_event_hosts(eventId, [username], token);
      } else {
        await add_event_invites(eventId, [username], token);
      }
      await load();
    } catch (err: any) {
      Alert.alert('could not add', err?.message || 'try again');
    } finally {
      setBusy(false);
    }
  };

  const removeHost = async (username: string) => {
    if (busy || !event) return;
    setBusy(true);
    try {
      await remove_event_host(eventId, username, token);
      await load();
    } catch (err: any) {
      Alert.alert('could not remove', err?.message || 'try again');
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
      Alert.alert('could not remove', err?.message || 'try again');
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
      Alert.alert('could not delete', err?.message || 'try again');
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
  const already = new Set([...event.hosts, ...(event.invited || [])]);
  const filtered = directory.filter((m) => {
    if (already.has(m.username)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${m.firstname || ''} ${m.lastname || ''} ${m.username}`.toLowerCase();
    return name.includes(q);
  });

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

          {canEdit && (
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
                onPress={() => navigation.navigate('EventEdit', { eventId })}
              >
                <Text style={styles.actionBtnText}>edit</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.redCoral }]}
                onPress={() => setShowDelete(true)}
              >
                <Text style={styles.actionBtnText}>delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Member picker */}
      <Modal
        visible={pickerMode !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerMode(null)}
      >
        <View style={styles.pickerRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerMode(null)} />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
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
            />
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.emptyChips}>no members to add</Text>
              ) : (
                filtered.map((m) => (
                  <Pressable
                    key={m.username}
                    style={styles.pickerRow}
                    disabled={busy}
                    onPress={() => addMember(m.username)}
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
            <Pressable style={styles.pickerDone} onPress={() => setPickerMode(null)}>
              <Text style={styles.pickerDoneText}>done</Text>
            </Pressable>
          </View>
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
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  pickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  pickerSheet: {
    backgroundColor: Colors.mainBg,
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingHorizontal: 24,
    paddingTop: 18,
    maxHeight: '70%',
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
    flexGrow: 0,
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
  pickerDone: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerDoneText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
