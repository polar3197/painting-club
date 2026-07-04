import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { get_messages, send_message, leave_group, MessageOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';

const POLL_MS = 4000;

type ThreadParams = {
  conversationId: string;
  title: string;
  type: 'dm' | 'group';
  partnerUsername?: string | null;
};

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

  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Unseen threshold captured on the FIRST fetch only — later polls must not
  // move it or incoming bubbles would instantly lose their unseen colour.
  const [prevReadAt, setPrevReadAt] = useState<string | null>(null);
  const firstLoadDone = useRef(false);
  const [input, setInput] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

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

  const submit = async () => {
    const body = input.trim();
    if (!body) return;
    setInput('');
    try {
      const sent = await send_message(conversationId, body, token);
      mergeNewest([sent]);
    } catch (err: any) {
      // Same rule as comments: don't fabricate a local message the server
      // never received — restore the text and surface the error.
      setInput(body);
      Alert.alert('Message failed', err?.message || 'Could not send your message');
    }
  };

  const doLeave = async () => {
    setConfirmLeave(false);
    try {
      await leave_group(conversationId, token);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not leave', err?.message || 'try again');
    }
  };

  const renderMessage = ({ item: m }: { item: MessageOut }) => {
    const isOwn = m.sender_username === currentUser;
    const display = m.sender_firstname || m.sender_username;
    const unseen = !isOwn && (!prevReadAt || m.created_at > prevReadAt);
    return (
      <View style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
        {!isOwn && (
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
        <View style={[styles.msgBubble, isOwn && styles.msgBubbleOwn, unseen && styles.msgBubbleUnseen]}>
          <Text style={styles.msgText}>{m.body}</Text>
        </View>
        {isOwn && (
          <View style={styles.msgLabel}>
            <Text style={styles.msgLabelName}>{'<'}</Text>
          </View>
        )}
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
          <Pressable style={styles.leaveBtn} hitSlop={10} onPress={() => setConfirmLeave(true)}>
            <Ionicons name="exit-outline" size={22} color={Colors.black} />
          </Pressable>
        ) : (
          <View style={styles.leaveBtn} />
        )}
      </View>

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
        <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            value={input}
            placeholder="message..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            onChangeText={setInput}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          <Pressable style={styles.submitBtn} onPress={submit}>
            <Text style={styles.submitText}>{'↑'}</Text>
          </Pressable>
        </View>
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
  msgBubble: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '70%',
  },
  msgBubbleOwn: {
    backgroundColor: Colors.secondary,
  },
  msgBubbleUnseen: {
    backgroundColor: Colors.accentGolden,
  },
  msgText: {
    fontFamily: Fonts.serif,
    fontSize: 15,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#000',
    padding: 8,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 6,
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
});
