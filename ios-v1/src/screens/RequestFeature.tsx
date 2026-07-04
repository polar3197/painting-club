import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Animated,
  Dimensions,
  Alert,
  RefreshControl,
} from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  FeatureRequestOut,
  get_feature_requests,
  create_feature_request,
  vote_feature_request,
  delete_feature_request,
} from '../api';

// Blank placeholder rows shown before any requests exist.
const EMPTY_ROWS = 7;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Optimistic vote math mirroring the server rules: same direction retracts,
// opposite direction switches.
function applyVote(r: FeatureRequestOut, value: 1 | -1): FeatureRequestOut {
  const next = { ...r };
  if (r.my_vote === value) {
    next.my_vote = null;
    if (value === 1) next.up -= 1;
    else next.down -= 1;
  } else {
    if (r.my_vote === 1) next.up -= 1;
    if (r.my_vote === -1) next.down -= 1;
    next.my_vote = value;
    if (value === 1) next.up += 1;
    else next.down += 1;
  }
  return next;
}

// Feature-request board, backed by /feature-requests. Back is the native
// swipe gesture.
export default function RequestFeature() {
  const insets = useSafeAreaInsets();
  const { token, currentRole } = useAuth();
  const [requests, setRequests] = useState<FeatureRequestOut[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeatureRequestOut | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await get_feature_requests(token));
    } catch {
      // keep whatever is on screen; pull-to-refresh retries
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Popup animation: the backdrop fades in place while the sheet slides up
  // (so the dim layer doesn't slide in with it).
  const anim = useRef(new Animated.Value(0)).current;

  const openAdd = () => {
    setShowAdd(true);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  };
  const closeAdd = () => {
    Keyboard.dismiss();
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowAdd(false);
      setNewTitle('');
    });
  };

  const submitAdd = async () => {
    const t = newTitle.trim();
    if (!t || posting) return;
    setPosting(true);
    try {
      const created = await create_feature_request(t, token);
      setRequests((prev) => [created, ...prev]);
      closeAdd();
    } catch (e) {
      Alert.alert('could not post', e instanceof Error ? e.message : 'try again');
    } finally {
      setPosting(false);
    }
  };

  const vote = (id: string, value: 1 | -1) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? applyVote(r, value) : r)));
    vote_feature_request(id, value, token)
      .then((tally) =>
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...tally } : r))),
      )
      .catch(load); // out of sync with the server — refetch the truth
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setRequests((prev) => prev.filter((r) => r.id !== target.id));
    try {
      await delete_feature_request(target.id, token);
    } catch {
      load();
    }
  };

  const canDelete = (r: FeatureRequestOut) => r.is_owner || currentRole === 'admin';

  const sheetTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.5, 0],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>request something for the app</Text>
        <Pressable style={styles.addBtn} hitSlop={12} onPress={openAdd}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {requests.length === 0
          ? Array.from({ length: EMPTY_ROWS }).map((_, i) => <View key={i} style={styles.row} />)
          : requests.map((r) => (
              <Pressable
                key={r.id}
                style={styles.row}
                onLongPress={canDelete(r) ? () => setPendingDelete(r) : undefined}
                delayLongPress={400}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>{r.title}</Text>
                <View style={styles.voteRow}>
                  <Pressable
                    style={[styles.voteItem, r.my_vote === 1 && styles.voteItemActive]}
                    hitSlop={6}
                    onPress={() => vote(r.id, 1)}
                  >
                    <Text style={styles.voteArrow}>↑</Text>
                    <Text style={styles.voteCount}>{r.up}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.voteItem, r.my_vote === -1 && styles.voteItemActive]}
                    hitSlop={6}
                    onPress={() => vote(r.id, -1)}
                  >
                    <Text style={styles.voteArrow}>↓</Text>
                    <Text style={styles.voteCount}>{r.down}</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
      </ScrollView>

      {/* ---- Add popup: title only. Backdrop fades in place; sheet slides up. ---- */}
      <Modal visible={showAdd} transparent animationType="none" onRequestClose={closeAdd}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <AnimatedPressable style={[styles.backdrop, { opacity: anim }]} onPress={closeAdd} />
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>request something for the app</Text>
              <Pressable
                style={[styles.postBtn, (!newTitle.trim() || posting) && styles.postBtnDisabled]}
                disabled={!newTitle.trim() || posting}
                onPress={submitAdd}
              >
                <Text style={styles.postBtnText}>{posting ? 'posting…' : 'post'}</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.titleInput}
              placeholder="title"
              placeholderTextColor={Colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitAdd}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="delete this request?"
        message={pendingDelete?.title}
        confirmLabel="delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
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
    // System font (San Francisco) = sans-serif.
    fontSize: FontSizes.md,
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
  voteItemActive: {
    backgroundColor: Colors.accentGolden,
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
});
