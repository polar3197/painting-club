import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  get_prompt,
  list_prompts,
  add_new_visual_2d,
  get_members_visual_2d,
  resolveImageUrl,
  thumbUrl,
  PromptDetailOut,
  PromptSummary,
  ArtResult,
  Visual2DIn,
  Visual2DOut,
} from '../api';
import AddArtDialog from '../components/AddArtDialog';
import ArtZoomIn from '../components/ArtZoomIn';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type RouteT = RouteProp<HomeStackParamList, 'WeeklyPromptDetail'>;
type NavT = NativeStackNavigationProp<HomeStackParamList, 'WeeklyPromptDetail'>;

// --- Salon wall ------------------------------------------------------------
// A horizontally-scrollable gallery wall. The newest submission hangs dead
// center; older pieces fan out symmetrically to either side and trail off the
// visible edges, revealed by swiping. Pieces keep their true aspect ratio and
// are kept small enough (~under half the wall) that columns hold either one
// piece or two stacked vertically — so the wall fills both axes — with each
// column staggered for a hung-by-hand look.

const GAP = 18; // horizontal spacing between columns
const GAP_V = 14; // vertical spacing between two pieces stacked in one column
const EDGE = 40; // brown wall extends this far past the outermost columns
const FRAME = 11; // gold frame thickness around the image
const RIM = 1.5; // thin black rim around the outside of the frame
const PAD = FRAME + RIM;

// Deterministic per-piece pseudo-randomness, keyed off the submission id so a
// piece always hangs the same way across renders (no jitter on refresh).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function unit(id: string, salt: string): number {
  return hashStr(id + salt) / 4294967296; // [0, 1)
}

interface HungPiece {
  art: ArtResult;
  imgW: number;
  imgH: number;
  frameW: number;
  frameH: number;
}

interface Column {
  pieces: HungPiece[];
  width: number;
  offsetTop: number;
}

// Size one piece to a target image height, preserving its true aspect ratio and
// clamping very wide pieces so they don't blow out the column width.
function sizePiece(art: ArtResult, targetH: number, maxW: number): HungPiece {
  const ar = art.aspect_ratio && art.aspect_ratio > 0 ? art.aspect_ratio : 1;
  let imgH = targetH;
  let imgW = imgH * ar;
  if (imgW > maxW) {
    const s = maxW / imgW;
    imgW = maxW;
    imgH = imgH * s;
  }
  return { art, imgW, imgH, frameW: imgW + PAD * 2, frameH: imgH + PAD * 2 };
}

// Assemble a column from 1–2 pieces and pick its vertical offset. A single
// piece staggers freely across the full vertical slack; a stacked pair sits
// nearer the middle so the two read as a unit.
function makeColumn(pieces: HungPiece[], availH: number, seedId: string): Column {
  const width = Math.max(...pieces.map((p) => p.frameW));
  const totalH =
    pieces.reduce((s, p) => s + p.frameH, 0) + GAP_V * (pieces.length - 1);
  const slack = Math.max(0, availH - totalH);
  const frac =
    pieces.length > 1
      ? 0.3 + unit(seedId, 'v') * 0.4
      : 0.1 + unit(seedId, 'v') * 0.8;
  return { pieces, width, offsetTop: slack * frac };
}

// Build the wall as columns. The newest submission is its own centered column;
// older pieces fan outward symmetrically (L/R/L/R…) and get packed into columns
// of one or two stacked pieces (deterministic by id, ~half stacked) so the wall
// distributes vertically as well as horizontally.
function buildColumns(
  items: ArtResult[],
  availW: number,
  availH: number,
): { columns: Column[]; centerIdx: number } {
  const singleH = Math.min(availH * 0.4, availH - PAD * 2 - 8);
  // Two stacked pieces + the gap fill ~84% of the wall, so each reads as
  // clearly smaller than a single hung piece while the pair still uses the
  // vertical space.
  const stackH = Math.max(40, (availH * 0.84 - GAP_V) / 2 - PAD * 2);
  const maxW = availW * 0.55;

  // Pack the older pieces (everything but the centered newest) into columns of
  // one or two from the FULL sequence — pairing draws from the whole pool, so
  // stacks actually form even with a modest number of submissions. Then the
  // finished columns get distributed outward, alternating L/R around center.
  const rest = items.slice(1);
  const packed: Column[] = [];
  let i = 0;
  while (i < rest.length) {
    const a = rest[i];
    const next = rest[i + 1];
    // Stack consecutive pairs by default so two pieces share a vertical line;
    // only leave a single occasionally (~1 in 4, deterministic by id) for
    // variety, plus whenever there's an odd piece left over with no partner.
    const leaveSingle = hashStr(a.id) % 4 === 0;
    if (next != null && !leaveSingle) {
      packed.push(
        makeColumn([sizePiece(a, stackH, maxW), sizePiece(next, stackH, maxW)], availH, a.id),
      );
      i += 2;
    } else {
      const h = singleH * (0.9 + unit(a.id, 'h') * 0.18);
      packed.push(makeColumn([sizePiece(a, h, maxW)], availH, a.id));
      i += 1;
    }
  }

  const rightCols: Column[] = [];
  const leftCols: Column[] = [];
  packed.forEach((c, idx) => (idx % 2 === 0 ? rightCols : leftCols).push(c));

  const centerCol = makeColumn([sizePiece(items[0], singleH, maxW)], availH, items[0].id);
  return {
    columns: [...leftCols.reverse(), centerCol, ...rightCols],
    centerIdx: leftCols.length,
  };
}

function SalonWall({ submissions, onPress }: { submissions: ArtResult[]; onPress: (a: ArtResult) => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const scrollRef = useRef<ScrollView>(null);

  const layout = useMemo(() => {
    const { w: availW, h: availH } = size;
    if (availW === 0 || availH === 0 || submissions.length === 0) return null;

    const { columns, centerIdx } = buildColumns(submissions, availW, availH);

    // Horizontal offset that puts the center column in the middle of the box.
    // Leading padding is EDGE, so x starts there; when the wall overflows the
    // box the center column scrolls to the middle, and when it fits the whole
    // cluster is centered by the contentContainer instead.
    let x = EDGE;
    for (let i = 0; i < centerIdx; i++) x += columns[i].width + GAP;
    const scrollX = Math.max(0, x + columns[centerIdx].width / 2 - availW / 2);

    return { columns, scrollX };
  }, [size, submissions]);

  // contentOffset handles the initial position; this catches re-layouts (e.g.
  // a new piece arriving after submit shifts the center).
  useEffect(() => {
    if (layout && scrollRef.current) {
      scrollRef.current.scrollTo({ x: layout.scrollX, animated: false });
    }
  }, [layout]);

  return (
    <View
      style={styles.wall}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {layout && (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: layout.scrollX, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: EDGE, flexGrow: 1, justifyContent: 'center' }}
        >
          {layout.columns.map((col, ci) => (
            <View
              key={col.pieces[0].art.id}
              style={{
                width: col.width,
                height: size.h,
                marginRight: ci < layout.columns.length - 1 ? GAP : 0,
              }}
            >
              <View style={{ marginTop: col.offsetTop, alignItems: 'center', gap: GAP_V }}>
                {col.pieces.map((p) => (
                  <Pressable
                    key={p.art.id}
                    onPress={() => onPress(p.art)}
                    style={({ pressed }) => [
                      styles.frame,
                      { width: p.frameW, height: p.frameH },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Image
                      source={{ uri: resolveImageUrl(p.art.file_path) }}
                      placeholder={{ uri: thumbUrl(p.art.id) }}
                      transition={200}
                      style={{ width: p.imgW, height: p.imgH }}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function WeeklyPromptDetail() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { token, currentUser } = useAuth();

  const promptId = route.params.promptId;
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showPromptList, setShowPromptList] = useState(false);
  const [allPrompts, setAllPrompts] = useState<PromptSummary[]>([]);
  const [zoomed, setZoomed] = useState<ArtResult | null>(null);
  // When the viewer has already submitted, eagerly fetch their Visual2DOut so
  // tapping "edit your submission" opens the dialog pre-populated with the
  // existing piece (AddArtDialog requires the full Visual2DOut to enter edit mode).
  const [viewerPiece, setViewerPiece] = useState<Visual2DOut | null>(null);

  const refresh = useCallback(() => {
    get_prompt(promptId, token)
      .then((p) => setPrompt(p))
      .catch((err: any) => Alert.alert('Error', err?.message || 'Could not load prompt'))
      .finally(() => setLoading(false));
  }, [promptId, token]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch the viewer's own piece (if they've submitted) so the edit flow is ready
  // to open instantly on tap.
  useEffect(() => {
    if (!prompt?.viewer_submission_id || !currentUser) {
      setViewerPiece(null);
      return;
    }
    let cancelled = false;
    get_members_visual_2d(currentUser, prompt.media_name)
      .then((list) => {
        if (cancelled) return;
        const found = list.find((p) => p.id === prompt.viewer_submission_id) ?? null;
        setViewerPiece(found);
      })
      .catch(() => { if (!cancelled) setViewerPiece(null); });
    return () => { cancelled = true; };
  }, [prompt?.viewer_submission_id, prompt?.media_name, currentUser]);

  // Lazy-load the past-prompts list only when the user taps the title.
  const openPromptList = () => {
    setShowPromptList(true);
    if (allPrompts.length === 0) {
      list_prompts(token)
        .then(setAllPrompts)
        .catch(() => {});
    }
  };

  const onCreateSubmission = (payload: Visual2DIn) => {
    if (!prompt) return;
    add_new_visual_2d(token, { ...payload, collection_id: prompt.id })
      .then(() => { setShowDialog(false); refresh(); })
      .catch((err: any) => Alert.alert('Error', err?.message || 'Could not submit'));
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.darkerGold} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!prompt) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Prompt not available</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.body}>
        <Pressable
          style={({ pressed }) => [styles.promptCard, pressed && styles.pressed]}
          onPress={openPromptList}
        >
          <View style={styles.topRow}>
            <Text style={styles.heading}>{prompt.title}</Text>
            <View style={styles.mediumBadge}>
              <Text style={styles.mediumText}>{prompt.media_name}</Text>
            </View>
          </View>
          <View style={styles.summaryWrap}>
            <Text style={styles.summary}>{prompt.short_summary || ''}</Text>
          </View>
        </Pressable>

        <View style={styles.submissionsBox}>
          {prompt.submissions.length === 0 ? (
            <Text style={styles.emptyText}>be the first to submit</Text>
          ) : (
            <SalonWall submissions={prompt.submissions} onPress={setZoomed} />
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.dropFrame, pressed && styles.dropFramePressed]}
          onPress={() => setShowDialog(true)}
        >
          <Text style={styles.dropFrameText}>
            {prompt.viewer_submission_id ? 'edit your submission' : 'add your art'}
          </Text>
        </Pressable>
      </View>

      {showDialog && currentUser && (
        <AddArtDialog
          selectedMedium={prompt.media_name}
          username={currentUser}
          piece={viewerPiece ?? undefined}
          minimal
          dropboxPlaceholder={`share your ${prompt.title}`}
          onSuccess={refresh}
          onClose={() => setShowDialog(false)}
          onCreate={onCreateSubmission}
        />
      )}

      {zoomed && (
        <ArtZoomIn
          isOwner={false}
          imgPath={zoomed.file_path}
          reportArtId={zoomed.id}
          onClose={() => setZoomed(null)}
          backContent={
            <View style={styles.backContent}>
              <Text style={styles.backTitle}>{zoomed.title}</Text>
              <Text style={styles.backCreator}>@{zoomed.creator_username}</Text>
            </View>
          }
        />
      )}

      <Modal
        transparent
        visible={showPromptList}
        animationType="fade"
        onRequestClose={() => setShowPromptList(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowPromptList(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalHeader}>past prompts</Text>
            <FlatList
              data={allPrompts}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const isCurrent = item.id === prompt.id;
                const dateLabel = new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.promptRow,
                      isCurrent && styles.promptRowCurrent,
                      pressed && styles.pressed,
                    ]}
                    disabled={isCurrent}
                    onPress={() => {
                      setShowPromptList(false);
                      if (!isCurrent) {
                        navigation.push('WeeklyPromptDetail', { promptId: item.id });
                      }
                    }}
                  >
                    <Text style={styles.promptRowTitle} numberOfLines={1}>{item.title}</Text>
                    <View
                      style={[
                        styles.promptRowDate,
                        { backgroundColor: item.is_active ? Colors.greenBright : Colors.redLight },
                      ]}
                    >
                      <Text style={styles.promptRowDateText}>{dateLabel}</Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.modalEmpty}>no prompts yet</Text>}
            />
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
  body: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  promptCard: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summaryWrap: {
    // Reserve 4 lines of mono text height regardless of content length, so the
    // layout doesn't jump when prompts have shorter or longer descriptions.
    minHeight: 18 * 4,
    paddingVertical: 4,
  },
  summary: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 18,
    color: Colors.textPrimary,
  },
  mediumBadge: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.mainBg,
  },
  mediumText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  dropFrame: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropFramePressed: {
    backgroundColor: Colors.secondary,
  },
  dropFrameText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  submissionsBox: {
    flex: 1,
    minHeight: 0,
    // Break out of the body's 16px horizontal padding so the wall bleeds to
    // the left/right screen edges. Top/bottom borders stay; side borders drop
    // since there's no longer an inset edge to draw them against.
    marginHorizontal: -16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    overflow: 'hidden',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
  },
  wall: {
    flex: 1,
    // Warm, light gallery-wall brown behind the hung pieces.
    backgroundColor: 'rgb(150, 117, 94)',
  },
  frame: {
    // Gold frame fill (the padding) with a thin black rim around the outside.
    // The image butts directly against the inner edge of the gold.
    borderWidth: RIM,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    padding: FRAME,
    ...Shadows.card,
  },
  errorText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 40,
  },
  backContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  backTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  backCreator: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    height: '33%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
  },
  modalHeader: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  promptRowCurrent: {
    backgroundColor: Colors.secondary,
  },
  promptRowTitle: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  promptRowDate: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  promptRowDateText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textPrimary,
  },
  modalEmpty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
