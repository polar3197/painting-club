import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  Modal,
  Dimensions,
  // Raw RN input here (not the app-wide AppTextInput wrapper) so the message
  // field can keep autocorrect on. The iOS suggestion bar rides with it unless
  // Predictive is off in the device keyboard settings.
  TextInput,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  get_messages,
  send_message,
  edit_message,
  delete_message,
  leave_group,
  get_participants,
  add_group_members,
  get_member_directory,
  MessageOut,
  MemberDirectoryEntry,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';

const POLL_MS = 4000;

type ThreadParams = {
  conversationId: string;
  title: string;
  type: 'dm' | 'group';
  partnerUsername?: string | null;
};

// Server timestamps are naive UTC (no zone suffix) — tag them as UTC so
// new Date() doesn't misread them as local time.
function parseUtc(s: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// iMessage-style day marker: today / yesterday / "wed, jul 2" (this year) /
// "jul 2, 2025" (older).
function formatDayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'yesterday';
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString([], opts).toLowerCase();
}

// The composer owns its own text state so each keystroke re-renders only this
// bar — when `input` lived on the screen next to the FlatList, every character
// re-rendered all visible message rows.
function MessageInputBar({
  onSend,
  bottomInset,
}: {
  // Sends to the server (and merges the sent message into the thread).
  // Rejections put the text back in the box.
  onSend: (body: string) => Promise<void>;
  bottomInset: number;
}) {
  const [input, setInput] = useState('');

  const submit = async () => {
    const body = input.trim();
    if (!body) return;
    setInput('');
    try {
      await onSend(body);
    } catch (err: any) {
      // Same rule as comments: don't fabricate a local message the server
      // never received — restore the text and surface the error.
      setInput(body);
      appAlert('Message failed', err?.message || 'Could not send your message');
    }
  };

  return (
    <View style={[styles.inputBar, { paddingBottom: 8 + bottomInset }]}>
      <TextInput
        style={styles.input}
        value={input}
        placeholder="message..."
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="sentences"
        autoCorrect
        spellCheck
        onChangeText={setInput}
        // Grows in height with the text (up to maxHeight, then scrolls) instead
        // of scrolling sideways. Return inserts a newline; send with the button.
        multiline
      />
      <Pressable style={styles.submitBtn} onPress={submit}>
        <Text style={styles.submitText}>{'↑'}</Text>
      </Pressable>
    </View>
  );
}

// One conversation, newest message at the bottom (inverted FlatList over
// newest-first data — same order the API returns). While focused, the first
// page is re-fetched on a short interval so replies appear without a manual
// refresh (no push infrastructure yet).
export default function ConversationThread() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { conversationId, title, type, partnerUsername } = route.params as ThreadParams;
  const { currentUser, token } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  // When the keyboard is up it already covers the home-indicator area, so the
  // input bar shouldn't also pad by the bottom safe-area inset — that double
  // count is the dead space between the text box and the keyboard.
  const [kbUp, setKbUp] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKbUp(true));
    const h = Keyboard.addListener(hideEvt, () => setKbUp(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Unseen threshold captured on the FIRST fetch only — later polls must not
  // move it or incoming bubbles would instantly lose their unseen colour.
  const [prevReadAt, setPrevReadAt] = useState<string | null>(null);
  const firstLoadDone = useRef(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Invite-to-group sheet: directory members not already in the thread.
  const [showInvite, setShowInvite] = useState(false);
  const [invitable, setInvitable] = useState<MemberDirectoryEntry[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  // Long-press an own message → edit / delete (author-only). `editing` holds the
  // message being edited; the edit modal is open while it's non-null.
  const [editing, setEditing] = useState<MessageOut | null>(null);
  const [editText, setEditText] = useState('');

  const openInvite = async () => {
    setInvited(new Set());
    setShowInvite(true);
    try {
      const [directory, participants] = await Promise.all([
        get_member_directory(token),
        get_participants(conversationId, token),
      ]);
      const already = new Set(participants.map((p) => p.username));
      setInvitable(directory.filter((m) => !already.has(m.username)));
    } catch {
      setInvitable([]);
    }
  };

  const toggleInvite = (username: string) =>
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });

  const submitInvite = async () => {
    if (invited.size === 0 || inviting) return;
    setInviting(true);
    try {
      await add_group_members(conversationId, Array.from(invited), token);
      setShowInvite(false);
    } catch (err: any) {
      appAlert('Could not add members', err?.message || 'try again');
    } finally {
      setInviting(false);
    }
  };

  const mergeNewest = useCallback((incoming: MessageOut[]) => {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, []);

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await get_messages(conversationId, token);
      if (!firstLoadDone.current) {
        firstLoadDone.current = true;
        setPrevReadAt(page.previous_read_at);
        setMessages(page.messages);
        setNextCursor(page.next_cursor);
      } else {
        mergeNewest(page.messages);
      }
    } catch {
      // polling retries shortly; a one-off failure isn't worth an alert
    }
  }, [conversationId, token, mergeNewest]);

  useEffect(() => {
    if (!isFocused) return;
    loadFirstPage();
    const iv = setInterval(loadFirstPage, POLL_MS);
    return () => clearInterval(iv);
  }, [isFocused, loadFirstPage]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    try {
      const page = await get_messages(conversationId, token, nextCursor);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...page.messages.filter((m) => !known.has(m.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {}
  };

  // Stable identity so the memo-friendly composer never re-renders from
  // thread updates.
  const sendBody = useCallback(
    async (body: string) => {
      const sent = await send_message(conversationId, body, token);
      mergeNewest([sent]);
    },
    [conversationId, token, mergeNewest]
  );

  const doLeave = async () => {
    setConfirmLeave(false);
    try {
      await leave_group(conversationId, token);
      navigation.goBack();
    } catch (err: any) {
      appAlert('Could not leave', err?.message || 'try again');
    }
  };

  // Long-press menu for an own message: native action sheet (the destructive
  // "delete" IS the confirmation — no second dialog).
  const openMessageMenu = (m: MessageOut) => {
    appAlert(
      'message',
      m.body.length > 80 ? m.body.slice(0, 80) + '…' : m.body,
      [
        { text: 'edit', onPress: () => { setEditText(m.body); setEditing(m); } },
        { text: 'delete', style: 'destructive', onPress: () => doDeleteMessage(m) },
        { text: 'cancel', style: 'cancel' },
      ],
    );
  };

  const doDeleteMessage = async (m: MessageOut) => {
    // Optimistic remove; restore (in newest-first order) if the server rejects —
    // same rule as sending: never lie about what the server actually did.
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await delete_message(conversationId, m.id, token);
    } catch (err: any) {
      setMessages((prev) =>
        [m, ...prev].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      );
      appAlert('Could not delete', err?.message || 'try again');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editText.trim();
    if (!body || body === editing.body) { setEditing(null); return; }
    try {
      const updated = await edit_message(conversationId, editing.id, body, token);
      setMessages((prev) =>
        prev.map((x) =>
          x.id === updated.id ? { ...x, body: updated.body, edited_at: updated.edited_at } : x,
        ),
      );
      setEditing(null);
    } catch (err: any) {
      appAlert('Could not edit', err?.message || 'try again');
    }
  };

  const renderMessage = ({ item: m, index }: { item: MessageOut; index: number }) => {
    const isOwn = m.sender_username === currentUser;
    const display = m.sender_firstname || m.sender_username;
    const unseen = !isOwn && (!prevReadAt || m.created_at > prevReadAt);
    const when = parseUtc(m.created_at);

    // Day separator above the first message of each day. Data is newest-first,
    // so the chronologically-previous message sits at index + 1. When older
    // pages are still unfetched, hold off — the marker lands once they load.
    const older = messages[index + 1];
    const showDay = older
      ? !sameDay(when, parseUtc(older.created_at))
      : nextCursor === null;

    return (
      <View>
        {showDay && (
          <View style={styles.daySeparator}>
            <Text style={styles.daySeparatorText}>{formatDayLabel(when)}</Text>
          </View>
        )}
        <View style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
          {/* Sender labels only in groups — in a DM the other party is obvious. */}
          {!isOwn && type === 'group' && (
            <Pressable
              style={styles.msgLabel}
              onPress={() => navigation.navigate('Main', {
                screen: 'SearchTab',
                params: { screen: 'UserProfile', params: { username: m.sender_username } },
              })}
            >
              <Text style={styles.msgLabelName}>{display} {'>'}</Text>
              {m.sender_firstname && <Text style={styles.msgLabelUsername}>@{m.sender_username}</Text>}
            </Pressable>
          )}
          <View style={[styles.msgCol, isOwn ? styles.msgColOwn : styles.msgColOther]}>
            <Pressable
              // Author-only: long-press own bubble to edit/delete. Non-own
              // bubbles have no long-press action.
              onLongPress={isOwn ? () => openMessageMenu(m) : undefined}
              delayLongPress={300}
              style={[styles.msgBubble, isOwn && styles.msgBubbleOwn, unseen && styles.msgBubbleUnseen]}
            >
              <Text style={styles.msgText}>{m.body}</Text>
            </Pressable>
            <Text style={styles.msgTime}>
              {formatTime(when)}{m.edited_at ? ' · edited' : ''}
            </Text>
          </View>
          {isOwn && type === 'group' && (
            <View style={styles.msgLabel}>
              <Text style={styles.msgLabelName}>{'<'}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <ConfirmDialog
        visible={confirmLeave}
        title="leave this group?"
        message={title}
        confirmLabel="leave"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />

      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={Colors.black} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {type === 'dm' && partnerUsername && (
            <Text style={styles.headerSubtitle}>@{partnerUsername}</Text>
          )}
        </View>
        {type === 'group' ? (
          <>
            <Pressable style={styles.leaveBtn} hitSlop={10} onPress={openInvite}>
              <Ionicons name="person-add-outline" size={22} color={Colors.black} />
            </Pressable>
            <Pressable style={styles.leaveBtn} hitSlop={10} onPress={() => setConfirmLeave(true)}>
              <Ionicons name="exit-outline" size={22} color={Colors.black} />
            </Pressable>
          </>
        ) : (
          <View style={styles.leaveBtn} />
        )}
      </View>

      {/* ---- Invite members (groups) ---- */}
      <Modal visible={showInvite} transparent animationType="slide" onRequestClose={() => setShowInvite(false)}>
        <View style={styles.inviteRoot}>
          <Pressable style={styles.inviteBackdrop} onPress={() => setShowInvite(false)} />
          <View style={[styles.inviteSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteTitle}>add to “{title}”</Text>
              <Pressable
                style={[styles.inviteBtn, (invited.size === 0 || inviting) && styles.inviteBtnDisabled]}
                disabled={invited.size === 0 || inviting}
                onPress={submitInvite}
              >
                <Text style={styles.inviteBtnText}>{inviting ? 'adding…' : 'add'}</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.inviteList}>
              {invitable.map((m) => {
                const picked = invited.has(m.username);
                return (
                  <Pressable
                    key={m.username}
                    style={[styles.inviteRow, picked && styles.inviteRowPicked]}
                    onPress={() => toggleInvite(m.username)}
                  >
                    <Text style={styles.inviteName}>
                      {[m.firstname, m.lastname].filter(Boolean).join(' ') || m.username}
                    </Text>
                    <Text style={styles.inviteUsername}>@{m.username}</Text>
                  </Pressable>
                );
              })}
              {invitable.length === 0 && (
                <Text style={styles.inviteEmpty}>everyone's already here</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---- Edit own message ---- */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.editRoot}>
          <Pressable style={styles.editBackdrop} onPress={() => setEditing(null)} />
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>edit message</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditing(null)}>
                <Text style={styles.editCancelText}>cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.editSave, !editText.trim() && styles.editSaveDisabled]}
                onPress={saveEdit}
                disabled={!editText.trim()}
              >
                <Text style={styles.editSaveText}>save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
        <MessageInputBar onSend={sendBody} bottomInset={kbUp ? 0 : insets.bottom} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 4,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  headerSubtitle: {
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
  },
  leaveBtn: {
    padding: 4,
    width: 34,
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 10,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  msgRowOwn: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgLabel: {
    marginHorizontal: 6,
    marginBottom: 2,
  },
  msgLabelName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.black,
  },
  msgLabelUsername: {
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
  },
  daySeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  daySeparatorText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  msgCol: {
    maxWidth: '70%',
  },
  msgColOwn: {
    alignItems: 'flex-end',
  },
  msgColOther: {
    alignItems: 'flex-start',
  },
  msgTime: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
    marginTop: 2,
  },
  msgBubble: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  msgBubbleOwn: {
    backgroundColor: Colors.secondary,
  },
  msgBubbleUnseen: {
    backgroundColor: Colors.accentGolden,
  },
  msgText: {
    fontFamily: Fonts.system,
    fontSize: 16,
  },
  // --- invite sheet ---
  inviteRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inviteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  inviteSheet: {
    backgroundColor: Colors.mainBg,
    borderTopWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
    maxHeight: Dimensions.get('window').height * 0.6,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    flexShrink: 1,
  },
  inviteBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginLeft: 12,
  },
  inviteBtnDisabled: {
    opacity: 0.4,
  },
  inviteBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  inviteList: {
    flexGrow: 0,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  inviteRowPicked: {
    backgroundColor: Colors.accentGolden,
  },
  inviteName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  inviteUsername: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  inviteEmpty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  inputBar: {
    flexDirection: 'row',
    // Bottom-align so the send button stays at the bottom as the field grows.
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#000',
    padding: 8,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.system,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 36,
    maxHeight: 120,
  },
  submitBtn: {
    width: 24,
    height: 24,
    backgroundColor: Colors.greenBright,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // --- edit-message modal ---
  editRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  editBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  editSheet: {
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 16,
    gap: 12,
  },
  editTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  editInput: {
    fontFamily: Fonts.system,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 44,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  editCancel: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  editCancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  editSave: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  editSaveDisabled: { opacity: 0.4 },
  editSaveText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
});
