import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

type Request = { id: string; title: string; description: string; up: number; down: number };

// Blank placeholder rows shown before any requests exist.
const EMPTY_ROWS = 7;
let _nextId = 1;

// Feature-request board. Local (in-session) state for now — persisting and
// sharing requests across users needs the backend (DB + API). Back is the
// native swipe gesture.
export default function RequestFeature() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<Request[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Request | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const closeAdd = () => {
    setShowAdd(false);
    setNewTitle('');
    setNewDesc('');
  };

  const submitAdd = () => {
    const t = newTitle.trim();
    if (!t) return;
    setRequests((prev) => [
      { id: String(_nextId++), title: t, description: newDesc.trim(), up: 0, down: 0 },
      ...prev,
    ]);
    closeAdd();
  };

  const vote = (id: string, dir: 'up' | 'down') => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, [dir]: r[dir] + 1 } : r)));
    setDetail((d) => (d && d.id === id ? { ...d, [dir]: d[dir] + 1 } : d));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>request something for the app</Text>
        <Pressable style={styles.addBtn} hitSlop={12} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {requests.length === 0
          ? Array.from({ length: EMPTY_ROWS }).map((_, i) => <View key={i} style={styles.row} />)
          : requests.map((r) => (
              <Pressable key={r.id} style={styles.row} onPress={() => setDetail(r)}>
                <Text style={styles.rowTitle} numberOfLines={2}>{r.title}</Text>
                <View style={styles.voteRow}>
                  <Pressable style={styles.voteItem} hitSlop={6} onPress={() => vote(r.id, 'up')}>
                    <Text style={styles.voteArrow}>↑</Text>
                    <Text style={styles.voteCount}>{r.up}</Text>
                  </Pressable>
                  <Pressable style={styles.voteItem} hitSlop={6} onPress={() => vote(r.id, 'down')}>
                    <Text style={styles.voteArrow}>↓</Text>
                    <Text style={styles.voteCount}>{r.down}</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
      </ScrollView>

      {/* ---- Add popup: title + description, rises with the keyboard ---- */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={closeAdd}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeAdd} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>request something for the app</Text>
              <Pressable
                style={[styles.postBtn, !newTitle.trim() && styles.postBtnDisabled]}
                disabled={!newTitle.trim()}
                onPress={submitAdd}
              >
                <Text style={styles.postBtnText}>post</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.titleInput}
              placeholder="title"
              placeholderTextColor={Colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.descInput}
              placeholder="description"
              placeholderTextColor={Colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Detail popup: opened by tapping a row ---- */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.detailBackdrop} onPress={() => setDetail(null)}>
          <View style={styles.detailCard} onStartShouldSetResponder={() => true}>
            {detail && (
              <>
                <View style={styles.detailTop}>
                  <Text style={styles.detailTitle}>{detail.title}</Text>
                  <View style={styles.voteRow}>
                    <Pressable style={styles.voteItem} hitSlop={6} onPress={() => vote(detail.id, 'up')}>
                      <Text style={styles.voteArrow}>↑</Text>
                      <Text style={styles.voteCount}>{detail.up}</Text>
                    </Pressable>
                    <Pressable style={styles.voteItem} hitSlop={6} onPress={() => vote(detail.id, 'down')}>
                      <Text style={styles.voteArrow}>↓</Text>
                      <Text style={styles.voteCount}>{detail.down}</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.detailDesc}>
                  {detail.description || 'no description'}
                </Text>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
    flexShrink: 1,
  },
  addBtn: {
    marginLeft: 12,
    paddingHorizontal: 4,
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    lineHeight: 34,
    color: Colors.black,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    minHeight: 84,
    paddingLeft: 16,
    paddingRight: 12,
    marginBottom: -1,
  },
  rowTitle: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 16,
  },
  voteItem: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 40,
  },
  voteArrow: {
    fontSize: 20,
    lineHeight: 22,
    color: Colors.black,
  },
  voteCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
    marginTop: 2,
  },
  // --- add popup ---
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.mainBg,
    borderTopWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  postBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    height: 44,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  descInput: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingTop: 12,
    minHeight: 110,
    textAlignVertical: 'top',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
  },
  // --- detail popup ---
  detailBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  detailCard: {
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 20,
    ...Shadows.card,
  },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  detailTitle: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.black,
  },
  detailDesc: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
});
