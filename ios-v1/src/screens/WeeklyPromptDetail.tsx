import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  get_prompt,
  list_prompts,
  activate_prompt,
  add_new_visual_2d,
  get_members_visual_2d,
  thumbSource,
  PromptDetailOut,
  PromptSummary,
  Visual2DIn,
  Visual2DOut,
} from '../api';
import AddArtDialog from '../components/AddArtDialog';
import ProposePromptDialog from '../components/ProposePromptDialog';
import ArtCarousel from '../components/ArtCarousel';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type RouteT = RouteProp<HomeStackParamList, 'WeeklyPromptDetail'>;
type NavT = NativeStackNavigationProp<HomeStackParamList, 'WeeklyPromptDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 8;
const H_PAD = 16;
const GRID_BOX_PAD = 8;
// Width available for cells inside the bordered grid box (body padding + box
// border + box padding).
const GRID_INNER_W = SCREEN_WIDTH - H_PAD * 2 - 2 - GRID_BOX_PAD * 2;

// Columns grow ~square with the submission count: ceil(sqrt(n)), clamped 1..5.
function columnsFor(n: number): number {
  return Math.min(5, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));
}

// This screen submits/browses visual-2D art only. A prompt tied to a specific
// medium hands its name straight to the dialog; a medium-agnostic ("any medium")
// prompt has no medium, so default it to the 2D-visual pane. The dialog's own
// medium picker still lets the submitter switch among the 2D media from here.
const DEFAULT_ANY_MEDIUM = 'painting';

export default function WeeklyPromptDetail() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { token, currentUser, currentRole } = useAuth();

  const promptId = route.params.promptId;
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [showPromptList, setShowPromptList] = useState(false);
  const [allPrompts, setAllPrompts] = useState<PromptSummary[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  // When the viewer has already submitted, eagerly fetch their Visual2DOut so
  // tapping "edit your submission" opens the dialog pre-populated.
  const [viewerPiece, setViewerPiece] = useState<Visual2DOut | null>(null);

  const refresh = useCallback(() => {
    get_prompt(promptId, token)
      .then((p) => setPrompt(p))
      .catch((err: any) => appAlert('Error', err?.message || 'Could not load prompt'))
      .finally(() => setLoading(false));
  }, [promptId, token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!prompt?.viewer_submission_id || !currentUser) {
      setViewerPiece(null);
      return;
    }
    let cancelled = false;
    // An any-medium prompt has no media_name, and the viewer's existing piece
    // could be filed under any 2D medium — read it off the submission itself so
    // the edit dialog opens the right pane and finds the piece.
    const existingMedium =
      prompt.submissions.find((s) => s.id === prompt.viewer_submission_id)?.medium
      ?? prompt.media_name
      ?? DEFAULT_ANY_MEDIUM;
    get_members_visual_2d(currentUser, existingMedium)
      .then((list) => {
        if (cancelled) return;
        const found = list.find((p) => p.id === prompt.viewer_submission_id) ?? null;
        setViewerPiece(found);
      })
      .catch(() => { if (!cancelled) setViewerPiece(null); });
    return () => { cancelled = true; };
  }, [prompt?.viewer_submission_id, prompt?.media_name, currentUser]);

  const openPromptList = () => {
    setShowPromptList(true);
    if (allPrompts.length === 0) {
      list_prompts(token).then(setAllPrompts).catch(() => {});
    }
  };

  // Contributor-only: make an archived prompt the active one again. The backend
  // archives whatever is currently live, so this both revives the old week and
  // retires the current one. Land on the reactivated prompt so it shows live.
  const handleReactivate = (id: string) => {
    activate_prompt(id, token)
      .then(() => {
        setShowPromptList(false);
        navigation.replace('WeeklyPromptDetail', { promptId: id });
      })
      .catch((err: any) => appAlert('Error', err?.message || 'Could not activate'));
  };

  const onCreateSubmission = (payload: Visual2DIn) => {
    if (!prompt) return;
    add_new_visual_2d(token, { ...payload, collection_id: prompt.id })
      .then(() => { setShowDialog(false); refresh(); })
      .catch((err: any) => appAlert('Error', err?.message || 'Could not submit'));
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

  const submissions = prompt.submissions;
  // Medium the submit/edit dialog opens on: the viewer's existing piece keeps its
  // own medium; a new submission to a specific prompt uses that prompt's medium;
  // a new submission to an any-medium prompt defaults to the 2D-visual pane.
  const dialogMedium =
    submissions.find((s) => s.id === prompt.viewer_submission_id)?.medium
    ?? prompt.media_name
    ?? DEFAULT_ANY_MEDIUM;
  const numColumns = columnsFor(submissions.length);
  const cellSize = (GRID_INNER_W - GRID_GAP * (numColumns - 1)) / numColumns;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.body}>
        {/* Title + summary occupy the top third. Tap to browse past prompts. */}
        <Pressable style={styles.header} onPress={openPromptList}>
          <Text style={styles.heading}>
            {prompt.title} ({prompt.media_name ?? 'any medium'})
          </Text>
          {!!prompt.short_summary && (
            <Text style={styles.summary}>{prompt.short_summary}</Text>
          )}
        </Pressable>

        {/* Image-only 4-up grid of submissions, inside a bordered box. */}
        <View style={styles.gridBox}>
          {submissions.length === 0 ? (
            <Text style={styles.emptyText}>be the first to submit</Text>
          ) : (
            <FlatList
              // numColumns can't change without a new key, and columnWrapperStyle
              // is illegal when numColumns === 1.
              key={numColumns}
              data={submissions}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <Pressable
                  style={({ pressed }) => [styles.cell, { width: cellSize, height: cellSize }, pressed && styles.pressed]}
                  onPress={() => setZoomIndex(index)}
                >
                  {/* 512px thumbnail, not the full-res original — the grid cell
                      is small; full-res loads in the zoom viewer on tap. */}
                  <Image
                    source={thumbSource(item.id, item.file_path)}
                    transition={200}
                    style={styles.cellImage}
                    contentFit="cover"
                  />
                </Pressable>
              )}
            />
          )}
        </View>

        {prompt.is_active ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.dropFrame, pressed && styles.dropFramePressed]}
              onPress={() => setShowDialog(true)}
            >
              <Text style={styles.dropFrameText}>
                {prompt.viewer_submission_id ? 'edit your submission' : 'add your art'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.proposeBtn, pressed && styles.dropFramePressed]}
              onPress={() => setShowPropose(true)}
            >
              <Text style={styles.proposeBtnText}>propose next week's prompt</Text>
            </Pressable>
          </>
        ) : (
          // Archived prompt: no submitting or proposing against a closed week.
          <Text style={styles.dunzoText}>this prompt is dunzo</Text>
        )}
      </View>

      {showPropose && <ProposePromptDialog onClose={() => setShowPropose(false)} />}

      {showDialog && currentUser && (
        <AddArtDialog
          selectedMedium={dialogMedium}
          username={currentUser}
          piece={viewerPiece ?? undefined}
          minimal
          dropboxPlaceholder={`share your ${prompt.title}`}
          onSuccess={refresh}
          onClose={() => setShowDialog(false)}
          onCreate={onCreateSubmission}
        />
      )}

      {zoomIndex !== null && submissions[zoomIndex] && (
        <ArtCarousel
          pieces={submissions}
          initialIndex={zoomIndex}
          isOwner={false}
          creatorUsername=""
          captions={submissions.map((s) => ({ title: s.title, creator: s.creator_username }))}
          hideKebab
          onClose={() => setZoomIndex(null)}
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
                    {currentRole === 'contributor' && !item.is_active && (
                      <Pressable
                        style={({ pressed }) => [styles.reactivateBtn, pressed && styles.pressed]}
                        onPress={() => handleReactivate(item.id)}
                        hitSlop={8}
                      >
                        <Text style={styles.reactivateBtnText}>make active</Text>
                      </Pressable>
                    )}
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
    padding: H_PAD,
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  heading: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  summary: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 18,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 6,
  },
  header: {
    // A shorter top band with the title at the top, so the title and the grid
    // box below both sit higher up the page.
    flex: 0.6,
    justifyContent: 'flex-start',
  },
  gridBox: {
    // Lower two-thirds: a bordered box that holds the image grid.
    flex: 2,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    padding: GRID_BOX_PAD,
    overflow: 'hidden',
  },
  gridContent: {
    paddingVertical: 4,
  },
  gridRow: {
    gap: GRID_GAP,
  },
  cell: {
    // Per-row vertical spacing lives here so it works for single-column too
    // (where there's no columnWrapper). Horizontal gap comes from gridRow.
    marginBottom: GRID_GAP,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
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
  proposeBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposeBtnText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  // Shown in place of the submit/propose buttons on an archived (closed) prompt.
  dunzoText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  reactivateBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactivateBtnText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xxs,
    color: Colors.black,
  },
  errorText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 40,
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
