import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { TextInput } from '../components/AppTextInput';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  get_conversations,
  get_member_directory,
  open_dm,
  create_group,
  ConversationOut,
  MemberDirectoryEntry,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

type Mode = '1:1' | 'groups';

const MODES: Mode[] = ['1:1', 'groups'];
const POLL_MS = 6000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Toggle spans the content width (12px page padding each side), split in half —
// mirrors the art/people selector on the stuff page.
const TOGGLE_WIDTH = SCREEN_WIDTH - 24;
const HALF = TOGGLE_WIDTH / 2;
const BOX_MARGIN = 6;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Messages inbox. A swipeable pager between the 1:1 and groups threads, with a
// gold box that slides with the swipe (like the stuff page). Conversations come
// from /conversations; the list refreshes while the screen is focused.
export default function Messages() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { currentUser, token } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  // Horizontal pagers don't hand a vertical size to flex children, so each page
  // is sized explicitly from the pager's measured height.
  const [pageHeight, setPageHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const [conversations, setConversations] = useState<ConversationOut[]>([]);

  // Compose sheet state. In '1:1' mode a single tap opens the DM; in 'groups'
  // mode members toggle in/out of a selection posted with the title.
  const [showCompose, setShowCompose] = useState(false);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      setConversations(await get_conversations(token));
    } catch {
      // next poll retries
    }
  }, [token]);

  useEffect(() => {
    if (!isFocused) return;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [isFocused, load]);

  const goTo = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
  }, []);

  const onPageSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  // Gold box slides between the halves as the pager scrolls.
  const boxTranslate = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [BOX_MARGIN, HALF + BOX_MARGIN],
    extrapolate: 'clamp',
  });

  const conversationsFor = (mode: Mode): ConversationOut[] =>
    conversations.filter((c) => (mode === '1:1' ? c.type === 'dm' : c.type === 'group'));

  const openThread = (c: ConversationOut) => {
    navigation.navigate('ConversationThread', {
      conversationId: c.id,
      title: c.title,
      type: c.type,
      partnerUsername: c.partner_username,
    });
  };

  // ---- compose sheet ----

  const openCompose = async () => {
    setSelected(new Set());
    setGroupTitle('');
    setShowCompose(true);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    try {
      // Server-side directory already excludes the caller and blocked pairs.
      setMembers(await get_member_directory(token));
    } catch {
      setMembers([]);
    }
  };

  const closeCompose = () => {
    Keyboard.dismiss();
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowCompose(false);
    });
  };

  const startDm = async (username: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const convo = await open_dm(username, token);
      closeCompose();
      openThread(convo);
    } catch (err: any) {
      appAlert('Could not open messages', err?.message || 'try again');
    } finally {
      setCreating(false);
    }
  };

  const toggleSelected = (username: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const submitGroup = async () => {
    const title = groupTitle.trim();
    if (!title || selected.size === 0 || creating) return;
    setCreating(true);
    try {
      const convo = await create_group(title, Array.from(selected), token);
      closeCompose();
      load();
      openThread(convo);
    } catch (err: any) {
      appAlert('Could not create group', err?.message || 'try again');
    } finally {
      setCreating(false);
    }
  };

  const sheetTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.5, 0],
  });

  const isGroupMode = MODES[activeIndex] === 'groups';
  const groupReady = groupTitle.trim().length > 0 && selected.size > 0 && !creating;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>messages</Text>
        <Pressable style={styles.addBtn} hitSlop={12} onPress={openCompose}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.toggle}>
        <Animated.View style={[styles.selectionBox, { transform: [{ translateX: boxTranslate }] }]} />
        {MODES.map((m, i) => (
          <Pressable key={m} style={styles.toggleItem} onPress={() => goTo(i)}>
            <Text style={styles.toggleText}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pager} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={scrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          onMomentumScrollEnd={onPageSettle}
        >
          {MODES.map((m) => {
            const convos = conversationsFor(m);
            return (
              <View key={m} style={[styles.page, { height: pageHeight }]}>
                <ScrollView
                  style={styles.pageScroll}
                  contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 24 }]}
                >
                  {convos.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>
                        {m === '1:1' ? 'no messages yet — tap + to say hi' : 'no groups yet — tap + to start one'}
                      </Text>
                    </View>
                  ) : (
                    convos.map((c) => (
                      <Pressable key={c.id} style={styles.row} onPress={() => openThread(c)}>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowText} numberOfLines={1}>{c.title}</Text>
                          {c.last_message !== null && (
                            <Text style={styles.rowPreview} numberOfLines={1}>
                              {c.last_sender_username === currentUser
                                ? 'you'
                                : c.last_sender_username}
                              : {c.last_message}
                            </Text>
                          )}
                        </View>
                        {c.unread > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{c.unread}</Text>
                          </View>
                        )}
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </Animated.ScrollView>
      </View>

      {/* ---- Compose: member picker (single-tap dm / multi-select + title group) ---- */}
      <Modal visible={showCompose} transparent animationType="none" onRequestClose={closeCompose}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <AnimatedPressable style={[styles.backdrop, { opacity: anim }]} onPress={closeCompose} />
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {isGroupMode ? 'new group' : 'new message'}
              </Text>
              {isGroupMode && (
                <Pressable
                  style={[styles.postBtn, !groupReady && styles.postBtnDisabled]}
                  disabled={!groupReady}
                  onPress={submitGroup}
                >
                  <Text style={styles.postBtnText}>{creating ? 'creating…' : 'create'}</Text>
                </Pressable>
              )}
            </View>
            {isGroupMode && (
              <TextInput
                style={styles.titleInput}
                placeholder="group name"
                placeholderTextColor={Colors.textMuted}
                value={groupTitle}
                onChangeText={setGroupTitle}
                returnKeyType="done"
              />
            )}
            <ScrollView style={styles.memberList} keyboardShouldPersistTaps="handled">
              {members.map((p) => {
                const picked = selected.has(p.username);
                return (
                  <Pressable
                    key={p.username}
                    style={[styles.memberRow, isGroupMode && picked && styles.memberRowPicked]}
                    onPress={() =>
                      isGroupMode ? toggleSelected(p.username) : startDm(p.username)
                    }
                  >
                    <Text style={styles.memberName}>
                      {[p.firstname, p.lastname].filter(Boolean).join(' ') || p.username}
                    </Text>
                    <Text style={styles.memberUsername}>@{p.username}</Text>
                  </Pressable>
                );
              })}
              {members.length === 0 && (
                <Text style={styles.emptyText}>no members to show</Text>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
  },
  addBtn: {
    paddingHorizontal: 4,
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    lineHeight: 36,
    color: Colors.black,
  },
  toggle: {
    flexDirection: 'row',
    width: TOGGLE_WIDTH,
    height: 46,
    alignSelf: 'center',
    backgroundColor: Colors.mainBg,
  },
  selectionBox: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    width: HALF - BOX_MARGIN * 2,
    backgroundColor: Colors.primaryGold,
    borderRadius: 12,
  },
  toggleItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 12,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  rowMain: {
    flex: 1,
  },
  rowText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
  },
  rowPreview: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  unreadBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.accentGolden,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 12,
  },
  unreadText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  // --- compose sheet ---
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
    maxHeight: SCREEN_HEIGHT * 0.6,
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
  memberList: {
    flexGrow: 0,
  },
  memberRow: {
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
  memberRowPicked: {
    backgroundColor: Colors.accentGolden,
  },
  memberName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  memberUsername: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
});
