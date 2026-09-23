import React, { useContext, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useNavPref } from '../context/NavPrefContext';
import { get_active_prompt, get_prompt, list_prompts, thumbSource, PromptOut, PromptDetailOut, PromptSummary } from '../api';
import { parseUtc } from '../utils/date';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ActivePrompt from './ActivePrompt';
import ArtCarousel from '../components/ArtCarousel';
import ProposePromptDialog from '../components/ProposePromptDialog';
import { HubPagerLock } from '../context/HubPagerLock';

function daysLeft(activatedAt?: string | null): number | null {
  if (!activatedAt) return null;
  const elapsed = (Date.now() - parseUtc(activatedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(7 - elapsed));
}
function subLabel(n: number): string {
  return `${n} ${n === 1 ? 'response' : 'responses'}`;
}

function useActivePrompt() {
  const { token } = useAuth();
  const [prompt, setPrompt] = useState<PromptOut | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    get_active_prompt(token)
      .then((p) => { if (alive) setPrompt(p); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);
  return { prompt, loading };
}

function Frame({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.frame, { paddingTop: insets.top }]}>{children}</View>;
}
function Loading() { return <Frame><ActivityIndicator color={Colors.darkerGold} /></Frame>; }
function None() {
  return <Frame><Text style={styles.noneTitle}>no prompt this week</Text><Text style={styles.noneSub}>check back soon</Text></Frame>;
}

// ── A: hero card ──────────────────────────────────────────────────────────
export function PromptA() {
  const nav = useNavigation<any>();
  const { prompt, loading } = useActivePrompt();
  if (loading) return <Loading />;
  if (!prompt) return <None />;
  const dl = daysLeft(prompt.activated_at);
  return (
    <Frame>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>this week's prompt{prompt.media_name ? ` · ${prompt.media_name}` : ''}</Text>
        <Text style={styles.heroTitle}>{prompt.title}</Text>
        {prompt.short_summary ? <Text style={styles.heroSummary}>{prompt.short_summary}</Text> : null}
        <Text style={styles.heroMeta}>{subLabel(prompt.submission_count)}{dl != null ? ` · ${dl} days left` : ''}</Text>
        <Pressable style={styles.cta} onPress={() => nav.navigate('WeeklyPromptDetail', { promptId: prompt.id })}>
          <Text style={styles.ctaTxt}>respond</Text>
        </Pressable>
      </View>
    </Frame>
  );
}

// ── B: prompt + submissions peek ──────────────────────────────────────────
function fmtCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function PromptB() {
  const nav = useNavigation<any>();
  const lockPager = useContext(HubPagerLock);
  // Safety net: the lock is cleared by touch-end, which can never arrive if
  // this unmounts mid-touch (or the app is backgrounded with a finger down).
  // A lock that outlives its toucher disables the hub's pagers for good.
  useEffect(() => () => lockPager(false), [lockPager]);
  const { token } = useAuth();
  const { prompt: active, loading } = useActivePrompt();
  // Which prompt is showing on the page. null = the active one; picking a past
  // prompt from the dialog just swaps this id and the title/images update in
  // place — no navigation to the old screen.
  const [viewId, setViewId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetailOut | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);
  const [allPrompts, setAllPrompts] = useState<PromptSummary[]>([]);
  const [showPropose, setShowPropose] = useState(false);
  const insets = useSafeAreaInsets();
  const currentId = viewId ?? active?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    get_prompt(currentId, token).then((d) => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [currentId, token]);
  const openList = () => {
    if (allPrompts.length === 0) list_prompts(token).then(setAllPrompts).catch(() => {});
    setShowList(true);
  };
  if (loading) return <Loading />;
  if (!active) return <None />;
  // While the newly-picked prompt loads, keep the header calm by treating it as
  // active-ish; once detail lands, is_active is authoritative.
  const onActive = !detail || detail.id === active.id || detail.is_active;
  const title = detail && detail.id === currentId ? detail.title : active.title;
  const subs = (detail && detail.id === currentId ? detail.submissions : []).filter((s) => !s.art_type || s.art_type === 'visual_2d');
  return (
    <View style={[styles.bWrap, { paddingTop: insets.top + 8 }]}>
      {/* Tap the header to browse past prompts (swaps in place). */}
      <Pressable onPress={openList}>
        <Text style={styles.kicker}>{onActive ? "this week's prompt" : 'past prompt'}  ▾</Text>
        <Text style={styles.bTitle}>{title}</Text>
      </Pressable>
      {/* alwaysBounceVertical makes the column claim vertical drags even when the
          few images fit — so scrolling over them doesn't bubble up to the hub and
          jump back to Home. The scroll indicator shows the area is scrollable.
          Swipe up in the wide side margins (outside the column) to return Home. */}
      <ScrollView
        style={styles.bColumn}
        contentContainerStyle={styles.bColumnContent}
        showsVerticalScrollIndicator
        alwaysBounceVertical
        onTouchStart={() => lockPager(true)}
        onTouchEnd={() => lockPager(false)}
        onTouchCancel={() => lockPager(false)}
        onMomentumScrollEnd={() => lockPager(false)}
      >
        {subs.length === 0
          ? <Text style={styles.noneSub}>no responses yet</Text>
          : subs.map((s, i) => (
            <Pressable key={s.id} onPress={() => setZoomIndex(i)}>
              <Image source={thumbSource(s.id, s.file_path)} style={styles.colThumb} contentFit="cover" />
            </Pressable>
          ))}
      </ScrollView>
      {onActive && (
        <Pressable
          style={[styles.addYours, { marginBottom: insets.bottom + 10 }]}
          onPress={() => nav.navigate('WeeklyPromptDetail', { promptId: active.id, autoSubmit: true })}
        >
          <Text style={styles.addYoursTxt}>add yours</Text>
        </Pressable>
      )}
      {zoomIndex !== null && subs[zoomIndex] && (
        <ArtCarousel
          pieces={subs}
          initialIndex={zoomIndex}
          isOwner={false}
          creatorUsername=""
          captions={subs.map((s) => ({ title: s.title, creator: s.creator_username }))}
          hideKebab
          onClose={() => setZoomIndex(null)}
        />
      )}

      {/* Past prompts, with a fixed "propose next week's prompt" footer. */}
      <Modal transparent visible={showList} animationType="fade" onRequestClose={() => setShowList(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowList(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalHeader}>past prompts</Text>
            <FlatList
              data={allPrompts}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 340 }}
              ListEmptyComponent={<Text style={styles.modalEmpty}>no prompts yet</Text>}
              renderItem={({ item }) => {
                const isCurrent = item.id === currentId;
                return (
                  <Pressable
                    style={[styles.promptRow, isCurrent && styles.promptRowCurrent]}
                    disabled={isCurrent}
                    onPress={() => { setShowList(false); setViewId(item.id); }}
                  >
                    <Text style={styles.promptRowTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={[styles.promptRowDate, { backgroundColor: item.is_active ? Colors.greenBright : Colors.redLight }]}>
                      <Text style={styles.promptRowDateText}>{fmtCreated(item.created_at)}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.proposeFooter} onPress={() => { setShowList(false); setShowPropose(true); }}>
              <Text style={styles.proposeFooterTxt}>propose next week's prompt</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {showPropose && <ProposePromptDialog onClose={() => setShowPropose(false)} />}
    </View>
  );
}

// ── C: minimal focus ──────────────────────────────────────────────────────
export function PromptC() {
  const nav = useNavigation<any>();
  const { prompt, loading } = useActivePrompt();
  if (loading) return <Loading />;
  if (!prompt) return <None />;
  const dl = daysLeft(prompt.activated_at);
  return (
    <Pressable style={styles.minFill} onPress={() => nav.navigate('WeeklyPromptDetail', { promptId: prompt.id })}>
      <Text style={styles.minTitle}>{prompt.title}</Text>
      <Text style={styles.minMeta}>{dl != null ? `${dl} days left · ` : ''}{subLabel(prompt.submission_count)}</Text>
    </Pressable>
  );
}

export default function PromptPanel() {
  const { promptVariant } = useNavPref();
  if (promptVariant === 'A') return <PromptA />;
  if (promptVariant === 'B') return <PromptB />;
  if (promptVariant === 'C') return <PromptC />;
  return <ActivePrompt />;
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: Colors.mainBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  noneTitle: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.black, marginBottom: 6 },
  noneSub: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textMuted },
  kicker: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.darkerGold, marginBottom: 10, textAlign: 'center' },
  cta: { borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.primaryGold, paddingHorizontal: 28, paddingVertical: 11, alignSelf: 'center', marginTop: 22 },
  ctaTxt: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.black },
  // A
  heroCard: { borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.artCardBg, padding: 22, alignItems: 'center', width: '100%' },
  heroTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.xxl, color: Colors.black, textAlign: 'center' },
  heroSummary: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.textSecondary, textAlign: 'center', marginTop: 10 },
  heroMeta: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, marginTop: 14 },
  // B
  bWrap: { flex: 1, backgroundColor: Colors.mainBg, alignItems: 'center', paddingHorizontal: 24 },
  bTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.xl, color: Colors.black, textAlign: 'center', marginBottom: 10 },
  // Top + bottom hairlines bracket the response column as a defined "lane"
  // without boxing the thumbnails in.
  bColumn: {
    flex: 1,
    width: 104,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.22)',
  },
  bColumnContent: { alignItems: 'center', gap: 8, paddingVertical: 14 },
  colThumb: { width: 92, height: 92, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary },
  // Same width as a thumbnail, slightly shorter — the "add yours" submit button.
  addYours: { width: 92, paddingVertical: 9, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.primaryGold, alignItems: 'center', marginTop: 10 },
  addYoursTxt: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.black },
  // C
  minFill: { flex: 1, backgroundColor: Colors.mainBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  minTitle: { fontFamily: Fonts.serif, fontSize: 34, color: Colors.black, textAlign: 'center', lineHeight: 40 },
  minMeta: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textMuted, marginTop: 20 },
  // past-prompts dialog + propose footer
  modalBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: { backgroundColor: Colors.mainBg, borderWidth: 1, borderColor: Colors.black, paddingTop: 14 },
  modalHeader: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black, paddingHorizontal: 16, paddingBottom: 10 },
  promptRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' },
  promptRowCurrent: { backgroundColor: Colors.secondary },
  promptRowTitle: { flex: 1, fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  promptRowDate: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.black, marginLeft: 8 },
  promptRowDateText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.black },
  modalEmpty: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textMuted, padding: 20, textAlign: 'center' },
  proposeFooter: { borderTopWidth: 1, borderTopColor: Colors.black, backgroundColor: Colors.primaryGold, paddingVertical: 15, alignItems: 'center' },
  proposeFooterTxt: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.black },
});
