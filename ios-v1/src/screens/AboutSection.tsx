import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
  // Raw RN input (not AppTextInput) so the editor keeps autocorrect + spellcheck.
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { get_doc, update_doc, DocOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_SECTIONS } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type SectionRoute = RouteProp<HomeStackParamList, 'AboutSection'>;

// One About section, now backed by the editable `doc` API (slug == section key).
// Any member reads the doc as a clean blog page; contributors get an inline
// editor (title + body) that PUTs back to /docs/{slug}.
export default function AboutSection() {
  const insets = useSafeAreaInsets();
  const { section } = useRoute<SectionRoute>().params;
  const { token, currentRole } = useAuth();

  const fallbackLabel = ABOUT_SECTIONS.find((s) => s.key === section)?.label ?? section;
  const isContributor = currentRole === 'contributor' || currentRole === 'admin';

  const [doc, setDoc] = useState<DocOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await get_doc(section, token);
      setDoc(d);
    } catch {
      // leave doc null → empty state below
    } finally {
      setLoading(false);
    }
  }, [section, token]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    if (!doc) return;
    setDraftTitle(doc.title);
    setDraftBody(doc.body);
    setEditing(true);
  };

  const save = async () => {
    const title = draftTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const updated = await update_doc(section, title, draftBody, token);
      setDoc(updated);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('could not save', err?.message || 'try again');
    } finally {
      setSaving(false);
    }
  };

  // Body renders as a blog page: blank-line-separated paragraphs, in order.
  const paragraphs = (doc?.body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (loading) {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.editContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.editLabel}>title</Text>
          <TextInput
            style={styles.titleInput}
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="section title"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
          />

          <Text style={styles.editLabel}>body</Text>
          <TextInput
            style={styles.bodyInput}
            value={draftBody}
            onChangeText={setDraftBody}
            placeholder="write this section…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            multiline
          />

          <View style={styles.editActions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => setEditing(false)}
              disabled={saving}
            >
              <Text style={styles.cancelText}>cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, (!draftTitle.trim() || saving) && styles.saveDisabled]}
              onPress={save}
              disabled={!draftTitle.trim() || saving}
            >
              <Text style={styles.saveText}>{saving ? 'saving…' : 'save'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 60 },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>{doc?.title || fallbackLabel}</Text>
        {isContributor && (
          <Pressable hitSlop={8} onPress={startEdit}>
            <Text style={styles.editLink}>edit</Text>
          </Pressable>
        )}
      </View>

      {paragraphs.length === 0 ? (
        <Text style={styles.empty}>
          {section === 'art' ? 'currently artless' : section === 'aims' ? 'currently aimless' : 'nothing here yet'}
        </Text>
      ) : (
        paragraphs.map((p, i) => (
          <Text key={i} style={styles.body}>{p}</Text>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: 24,
    gap: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    color: Colors.black,
    flex: 1,
  },
  editLink: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.darkerGold,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 12,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  // --- editor ---
  editContent: {
    paddingHorizontal: 20,
  },
  editLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    padding: 10,
    marginBottom: 18,
  },
  bodyInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    lineHeight: 22,
    minHeight: 320,
    padding: 10,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  saveBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
