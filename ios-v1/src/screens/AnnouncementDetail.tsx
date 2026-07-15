import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
  // Raw RN input (not AppTextInput) so the comment field keeps autocorrect on.
  TextInput,
} from 'react-native';
import { useNavigation, useRoute, useIsFocused, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  get_announcement,
  add_announcement_comment,
  delete_announcement,
  delete_announcement_comment,
  AnnouncementDetailOut,
  AnnouncementCommentOut,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';
import type { HomeStackParamList } from '../navigation/types';

type DetailRoute = RouteProp<HomeStackParamList, 'AnnouncementDetail'>;

// Server timestamps are naive UTC — tag as UTC so new Date() reads them right.
function parseUtc(s: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

function formatWhen(s: string): string {
  const d = parseUtc(s);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleString([], opts).toLowerCase();
}

export default function AnnouncementDetail() {
  const navigation = useNavigation<any>();
  const { id } = useRoute<DetailRoute>().params;
  const { token, currentUser, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [data, setData] = useState<AnnouncementDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDeleteAnn, setConfirmDeleteAnn] = useState(false);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null);

  const isContributor = currentRole === 'contributor' || currentRole === 'admin';

  const load = useCallback(async () => {
    try {
      const d = await get_announcement(id, token);
      setData(d);
      setNotFound(false);
    } catch (err: any) {
      // The API client throws Error(detail); our 404 detail is "Announcement not found".
      if (/not found/i.test(String(err?.message || ''))) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const canDeleteAnnouncement =
    !!data && (data.author_username === currentUser || isContributor);

  const canDeleteComment = (c: AnnouncementCommentOut) =>
    c.username === currentUser || isContributor;

  const submitComment = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      const c = await add_announcement_comment(id, text, token);
      setData((prev) =>
        prev
          ? { ...prev, comments: [...prev.comments, c], comment_count: prev.comment_count + 1 }
          : prev,
      );
    } catch (err: any) {
      setInput(text);
      Alert.alert('comment failed', err?.message || 'could not post your comment');
    } finally {
      setSending(false);
    }
  };

  const doDeleteAnnouncement = async () => {
    setConfirmDeleteAnn(false);
    try {
      await delete_announcement(id, token);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('could not delete', err?.message || 'try again');
    }
  };

  const doDeleteComment = async (commentId: string) => {
    setConfirmDeleteComment(null);
    try {
      await delete_announcement_comment(id, commentId, token);
      setData((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.filter((c) => c.id !== commentId),
              comment_count: Math.max(0, prev.comment_count - 1),
            }
          : prev,
      );
    } catch (err: any) {
      Alert.alert('could not delete', err?.message || 'try again');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <ConfirmDialog
        visible={confirmDeleteAnn}
        title="delete this announcement?"
        message="its whole discussion goes with it."
        confirmLabel="delete"
        onConfirm={doDeleteAnnouncement}
        onCancel={() => setConfirmDeleteAnn(false)}
      />
      <ConfirmDialog
        visible={confirmDeleteComment !== null}
        title="delete this comment?"
        confirmLabel="delete"
        onConfirm={() => confirmDeleteComment && doDeleteComment(confirmDeleteComment)}
        onCancel={() => setConfirmDeleteComment(null)}
      />

      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={Colors.black} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>announcement</Text>
        </View>
        {canDeleteAnnouncement ? (
          <Pressable style={styles.headerAction} hitSlop={10} onPress={() => setConfirmDeleteAnn(true)}>
            <Ionicons name="trash-outline" size={22} color={Colors.black} />
          </Pressable>
        ) : (
          <View style={styles.headerAction} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : notFound || !data ? (
        <View style={styles.center}>
          <Text style={styles.muted}>this announcement is gone.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.annTitle}>{data.title}</Text>
            <Text style={styles.annMeta}>
              {data.author_firstname || data.author_username || 'someone'} · {formatWhen(data.created_at)}
            </Text>
            <Text style={styles.annBody}>{data.body}</Text>

            <View style={styles.divider} />
            <Text style={styles.discussionLabel}>
              {data.comment_count === 0
                ? 'no replies yet'
                : `${data.comment_count} ${data.comment_count === 1 ? 'reply' : 'replies'}`}
            </Text>

            {data.comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentAuthor}>
                    {c.firstname || c.username}
                  </Text>
                  <Text style={styles.commentTime}>{formatWhen(c.created_at)}</Text>
                  {canDeleteComment(c) && (
                    <Pressable hitSlop={8} onPress={() => setConfirmDeleteComment(c.id)}>
                      <Text style={styles.commentDelete}>delete</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
            <TextInput
              style={styles.input}
              value={input}
              placeholder="add a reply…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              onChangeText={setInput}
              multiline
            />
            <Pressable
              style={[styles.submitBtn, (!input.trim() || sending) && styles.submitDisabled]}
              onPress={submitComment}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.submitText}>{'↑'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
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
  backBtn: { padding: 4 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  headerAction: { padding: 4, width: 34, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  body: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 24 },
  annTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.black,
  },
  annMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  annBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    lineHeight: 22,
    color: Colors.textPrimary,
    marginTop: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#000',
    marginVertical: 18,
  },
  discussionLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  commentRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 10,
    marginBottom: 8,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  commentAuthor: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.black,
  },
  commentTime: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
    flex: 1,
  },
  commentDelete: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: 'rgb(180, 60, 60)',
  },
  commentText: {
    fontFamily: Fonts.system,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  inputBar: {
    flexDirection: 'row',
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
    width: 34,
    height: 34,
    backgroundColor: Colors.greenBright,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: 16, fontWeight: '700' },
});
