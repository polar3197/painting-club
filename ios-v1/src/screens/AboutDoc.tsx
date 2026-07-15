import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  // Raw RN input (not AppTextInput) so the doc editor keeps autocorrect + spellcheck.
  TextInput,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { get_doc, create_doc, update_doc, delete_doc, DocOut } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type DocRoute = RouteProp<HomeStackParamList, 'AboutDoc'>;

// A single About doc. Members read it as a clean blog page; contributors get an
// inline editor (title + body) plus delete. `create` mode opens a blank editor
// that POSTs a new doc into the section.
export default function AboutDoc() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { slug, section, create } = useRoute<DocRoute>().params;
  const { token, currentRole } = useAuth();
  const isContributor = currentRole === 'contributor';

  const [doc, setDoc] = useState<DocOut | null>(null);
  const [loading, setLoading] = useState(!create);
  const [editing, setEditing] = useState(!!create);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (create || !slug) return;
    let alive = true;
    (async () => {
      try {
        const d = await get_doc(slug, token);
        if (!alive) return;
        setDoc(d);
        setDraftTitle(d.title);
        setDraftBody(d.body);
      } catch {
        if (alive) appAlert('could not load', 'try again');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [create, slug, token]);

  const save = async () => {
    const title = draftTitle.trim();
    if (!title) {
      appAlert('title required', 'give the doc a title.');
      return;
    }
    setSaving(true);
    try {
      if (create) {
        await create_doc(section as string, title, draftBody, token);
      } else if (slug) {
        await update_doc(slug, title, draftBody, token);
      }
      navigation.goBack();
    } catch (err: any) {
      appAlert('could not save', err?.message || 'try again');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setShowDelete(false);
    if (!slug) return;
    try {
      await delete_doc(slug, token);
      navigation.goBack();
    } catch (err: any) {
      appAlert('could not delete', err?.message || 'try again');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  // --- Editor (create or edit) ---
  if (editing) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>{create ? 'new doc' : 'editing'}</Text>
          <TextInput
            style={styles.titleInput}
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="title"
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            style={styles.bodyInput}
            value={draftBody}
            onChangeText={setDraftBody}
            placeholder="write the doc… (blank lines separate paragraphs)"
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          <View style={styles.editActions}>
            {!create && (
              <Pressable
                style={[styles.btn, { backgroundColor: Colors.secondary }]}
                onPress={() => {
                  setEditing(false);
                  if (doc) { setDraftTitle(doc.title); setDraftBody(doc.body); }
                }}
              >
                <Text style={styles.btnText}>cancel</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.btn, { backgroundColor: Colors.primaryGold }, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
            >
              <Text style={styles.btnText}>{saving ? 'saving…' : create ? 'create' : 'save'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // --- Read view ---
  return (
    <View style={styles.container}>
      <ConfirmDialog
        visible={showDelete}
        title="delete this doc?"
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
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.docTitle}>{doc?.title}</Text>
        <Text style={styles.docBody}>{doc?.body}</Text>

        {isContributor && (
          <View style={styles.editActions}>
            <Pressable
              style={[styles.btn, { backgroundColor: Colors.primaryGold }]}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.btnText}>edit</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: Colors.redCoral }]}
              onPress={() => setShowDelete(true)}
            >
              <Text style={styles.btnText}>delete</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  content: {
    paddingHorizontal: 24,
  },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
    marginBottom: 12,
  },
  bodyInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
    minHeight: 220,
    textAlignVertical: 'top',
  },
  docTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 12,
  },
  docBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    lineHeight: 26,
    color: Colors.textPrimary,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
