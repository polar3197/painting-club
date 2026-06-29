import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useUploads } from '../context/UploadContext';
import { useProfile } from '../hooks';
import {
  get_media,
  add_member_media,
  set_media_visibility,
  MediaType,
  Visual2DIn,
  WrittenFormIn,
  AudioIn,
} from '../api';
import PaintingForm from '../components/PaintingForm';
import WrittenFormForm from '../components/WrittenFormForm';
import AudioForm from '../components/AudioForm';
import AddMediaDialog from '../components/AddMediaDialog';
import SegmentedProgress from '../components/SegmentedProgress';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const STEPS = ['medium', 'details', 'share'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 12;
// Two square tiles per row (20px page padding on each side).
const GRID_SQUARE = (SCREEN_WIDTH - 40 - GRID_GAP) / 2;

type PickedFile = { uri: string; name: string; type: string } | null;

export default function AddArt() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const preseededMedium = (route.params as { medium?: string } | undefined)?.medium ?? null;

  const { currentUser, token } = useAuth();
  const { startUpload, startWrittenUpload, startAudioUpload } = useUploads();
  const [profile, setProfile] = useProfile(currentUser ?? '');
  const [showAddMedia, setShowAddMedia] = useState(false);

  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  useEffect(() => {
    get_media().then(setAllMedia).catch(() => {});
  }, []);

  const [step, setStep] = useState(preseededMedium ? 1 : 0);
  const [selectedMedium, setSelectedMedium] = useState<string | null>(preseededMedium);

  // Form + file state for the details step.
  const [formData, setFormData] = useState<Record<string, any> | null>(null);
  const [pickedFile, setPickedFile] = useState<PickedFile>(null);
  const [writeMode, setWriteMode] = useState<'file' | 'text'>('file');
  const [pastedText, setPastedText] = useState('');
  const [posting, setPosting] = useState(false);

  // Horizontal position of the stage pager (slides between medium/details/post).
  const slideX = useRef(new Animated.Value(0)).current;

  // This is a persistent tab (not a one-shot modal), so reset to a clean slate
  // each time it's focused. If navigated here with a medium (e.g. from a
  // profile's per-medium "+"), jump straight into details for it, then clear the
  // param so a later plain tap on the "+" tab starts at the medium picker.
  const paramsRef = useRef(route.params as { medium?: string } | undefined);
  paramsRef.current = route.params as { medium?: string } | undefined;
  useFocusEffect(
    useCallback(() => {
      const m = paramsRef.current?.medium ?? null;
      setSelectedMedium(m);
      setStep(m ? 1 : 0);
      setFormData(null);
      setPickedFile(null);
      setPastedText('');
      setWriteMode('file');
      setPosting(false);
      // Snap (no animation) to the right page when (re)entering the tab.
      slideX.setValue(-(m ? 1 : 0) * SCREEN_WIDTH);
      if (m) navigation.setParams({ medium: undefined });
    }, [navigation]),
  );

  // Slide horizontally between the stages whenever the step changes.
  useEffect(() => {
    Animated.timing(slideX, {
      toValue: -step * SCREEN_WIDTH,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [step, slideX]);

  const mediumType = useMemo(
    () => allMedia.find((m) => m.name === selectedMedium)?.type ?? null,
    [allMedia, selectedMedium],
  );
  const isVisual = mediumType === 'visual_2d';
  const isWritten = mediumType === 'written_form';
  const isAudio = mediumType === 'audio';

  const myMedia = profile?.media ?? [];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setPickedFile({ uri: a.uri, name: a.uri.split('/').pop() || 'image.jpg', type: a.mimeType || 'image/jpeg' });
    }
  };

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['public.audio', 'audio/*'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name = asset.name || (asset.uri.split('/').pop() ?? 'audio.m4a');
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mimeByExt: Record<string, string> = {
      m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', mp4: 'audio/mp4',
    };
    setPickedFile({ uri: asset.uri, name, type: asset.mimeType || mimeByExt[ext] || 'audio/m4a' });
  };

  // When everything required for the current medium is present, the user can
  // advance past the details step.
  const detailsReady = useMemo(() => {
    const title = (formData?.title || '').trim();
    if (!title) return false;
    if (isVisual || isAudio) return !!pickedFile;
    // File upload for written word is temporarily disabled — text only.
    if (isWritten) return !!pastedText.trim();
    return false;
  }, [formData, pickedFile, writeMode, pastedText, isVisual, isAudio, isWritten]);

  const chooseMedium = useCallback((name: string) => {
    setSelectedMedium(name);
    // Reset the per-piece state so switching medium starts clean.
    setFormData(null);
    setPickedFile(null);
    setPastedText('');
    setWriteMode('file');
    setStep(1);
  }, []);

  // The "+" on the medium picker opens the same AddMediaDialog used on the
  // profile. Adding a form enables it and drops you straight into its details.
  const handleAddMedia = useCallback(async (name: string) => {
    if (!profile || !currentUser) return;
    try {
      // The picker can now surface media the user has *hidden* — selecting one
      // un-hides it so the piece they're about to add will actually show.
      const wasHidden = (profile.hidden_media ?? []).includes(name);
      await add_member_media(currentUser, name, token);
      if (wasHidden) await set_media_visibility(name, false, token);
      setProfile({
        ...profile,
        media: [...(profile.media ?? []).filter((x) => x !== name), name],
        hidden_media: (profile.hidden_media ?? []).filter((x) => x !== name),
      });
      chooseMedium(name);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'failed to add media');
    }
  }, [profile, currentUser, token, setProfile, chooseMedium]);

  const handleMediaVisibilityChange = useCallback((name: string, hiddenNow: boolean) => {
    if (!profile) return;
    const media = [...(profile.media ?? [])];
    const hidden = [...(profile.hidden_media ?? [])];
    if (hiddenNow) {
      const i = media.indexOf(name);
      if (i >= 0) media.splice(i, 1);
      if (!hidden.includes(name)) hidden.push(name);
    } else {
      const i = hidden.indexOf(name);
      if (i >= 0) hidden.splice(i, 1);
      if (!media.includes(name)) media.push(name);
    }
    setProfile({ ...profile, media, hidden_media: hidden });
  }, [profile, setProfile]);

  const goToDestination = useCallback((medium: string) => {
    // Jump to the user's profile at the medium the piece landed in; the
    // optimistic spinner tile (from UploadContext) shows there while it uploads.
    navigation.navigate('Me', { medium, username: currentUser });
  }, [navigation, currentUser]);

  const submit = useCallback(async () => {
    if (!selectedMedium || !currentUser || !formData) return;
    const title = (formData.title || '').trim();
    if (!title) {
      Alert.alert('Missing', 'Please enter a title.');
      return;
    }
    setPosting(true);
    try {
      // Enable the medium for this user first if they picked one they don't have.
      if (!myMedia.includes(selectedMedium)) {
        await add_member_media(currentUser, selectedMedium, token);
      }
      // Always make sure the medium is visible — sharing to a hidden medium
      // un-hides it so the piece actually appears (no-op if already shown).
      await set_media_visibility(selectedMedium, false, token);
      setProfile((p) =>
        p
          ? {
              ...p,
              media: [...(p.media ?? []).filter((x) => x !== selectedMedium), selectedMedium],
              hidden_media: (p.hidden_media ?? []).filter((x) => x !== selectedMedium),
            }
          : p,
      );

      if (isVisual) {
        if (!pickedFile) { Alert.alert('Missing', 'Please select an image.'); setPosting(false); return; }
        const payload: Visual2DIn = {
          username: currentUser,
          medium: selectedMedium,
          title,
          location: formData.location,
          song: formData.song,
          song_artist: formData.song_artist,
          date: formData.date,
          width: formData.width,
          height: formData.height,
          keywords: formData.keywords,
          comments_enabled: formData.comments_enabled,
          file: pickedFile,
        };
        startUpload(payload);
      } else if (isWritten) {
        const trimmedText = pastedText.trim();
        const payload: WrittenFormIn = {
          username: currentUser,
          medium: selectedMedium,
          title,
          date: formData.date || undefined,
          keywords: formData.keywords,
          comments_enabled: formData.comments_enabled,
          series_name: formData.series || undefined,
          // File upload temporarily disabled — always submit pasted/typed text.
          text: trimmedText,
        };
        startWrittenUpload(payload);
      } else if (isAudio) {
        if (!pickedFile) { Alert.alert('Missing', 'Please select an audio file.'); setPosting(false); return; }
        const payload: AudioIn = {
          username: currentUser,
          medium: selectedMedium,
          title,
          artist: formData.artist || undefined,
          date: formData.date || undefined,
          keywords: formData.keywords,
          comments_enabled: formData.comments_enabled,
          file: pickedFile,
        };
        startAudioUpload(payload);
      }
      goToDestination(selectedMedium);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong');
      setPosting(false);
    }
  }, [selectedMedium, currentUser, formData, myMedia, token, isVisual, isWritten, isAudio, pickedFile, pastedText, writeMode, startUpload, startWrittenUpload, startAudioUpload, goToDestination, profile, setProfile]);

  if (!currentUser) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.guardText}>log in to add art</Text>
        <Pressable style={styles.guardBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.guardBtnText}>close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* --- Step content: a horizontal row that slides between stages --- */}
      <View style={styles.pagerViewport}>
        <Animated.View style={[styles.pagerRow, { transform: [{ translateX: slideX }] }]}>
          {/* Stage 1 — medium: a top-aligned 2-per-row grid of square tiles,
              ending with a "new" + square that opens the media picker. */}
          <View style={styles.mediumPage}>
            <ScrollView style={styles.gridScroll} contentContainerStyle={styles.squareGrid} showsVerticalScrollIndicator={false}>
              {myMedia.map((m) => (
                <Pressable key={m} style={styles.gridSquare} onPress={() => chooseMedium(m)}>
                  <Text style={styles.mediumSquareText} numberOfLines={3}>{m}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.gridSquare, styles.newSquare]} onPress={() => setShowAddMedia(true)}>
                <Text style={styles.newSquarePlus}>+</Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* Stage 2 — details */}
          <ScrollView style={styles.page} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {isVisual && (
              <Pressable style={styles.dropbox} onPress={pickImage}>
                {pickedFile ? (
                  <Image source={{ uri: pickedFile.uri }} style={styles.dropboxImage} contentFit="contain" />
                ) : (
                  <Text style={styles.dropboxText}>tap to select art</Text>
                )}
              </Pressable>
            )}
            {isWritten && (
              // File upload for written word is temporarily disabled — text only.
              <TextInput
                style={styles.textArea}
                value={pastedText}
                onChangeText={setPastedText}
                placeholder="paste or write your text here. Im sorry there are no file uploads yet :("
                placeholderTextColor={Colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
            )}
            {isAudio && (
              <Pressable style={styles.dropbox} onPress={pickAudio}>
                {pickedFile ? (
                  <Text style={styles.docFilename} numberOfLines={2}>{pickedFile.name}</Text>
                ) : (
                  <Text style={styles.dropboxText}>tap to select audio</Text>
                )}
              </Pressable>
            )}

            {isVisual && <PaintingForm onDataChange={setFormData} />}
            {isWritten && <WrittenFormForm onDataChange={setFormData} />}
            {isAudio && <AudioForm onDataChange={setFormData} />}
          </ScrollView>

          {/* Stage 3 — share */}
          <ScrollView style={styles.page} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {isVisual && pickedFile && (
              <Image source={{ uri: pickedFile.uri }} style={styles.reviewImage} contentFit="cover" />
            )}
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>medium</Text>
              <Text style={styles.reviewValue}>{selectedMedium}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>title</Text>
              <Text style={styles.reviewValue}>{(formData?.title || '').trim() || '—'}</Text>
            </View>
            {isWritten && formData?.series ? (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>series</Text>
                <Text style={styles.reviewValue}>{formData.series}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>

      {/* --- Footer: progress + step nav --- */}
      {/* Footer sits just above the (still-visible) bottom tab bar, which
          already covers the home-indicator inset — so a small fixed pad here. */}
      <View style={styles.footer}>
        <SegmentedProgress steps={STEPS} currentIndex={step} />
        <View style={styles.navRow}>
          {step > 0 ? (
            <Pressable style={styles.navBtn} onPress={() => setStep((s) => s - 1)}>
              <Text style={styles.navBtnText}>back</Text>
            </Pressable>
          ) : (
            <View style={styles.navBtnSpacer} />
          )}
          {step === 1 && (
            <Pressable
              style={[styles.navBtn, styles.navBtnPrimary, !detailsReady && styles.navBtnDisabled]}
              onPress={() => detailsReady && setStep(2)}
              disabled={!detailsReady}
            >
              <Text style={styles.navBtnText}>next</Text>
            </Pressable>
          )}
          {step === 2 && (
            <Pressable
              style={[styles.navBtn, styles.navBtnShare, posting && styles.navBtnDisabled]}
              onPress={submit}
              disabled={posting}
            >
              <Text style={styles.navBtnText}>{posting ? 'sharing…' : 'share'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {showAddMedia && (
        <AddMediaDialog
          onlyNew
          shown={profile?.media ?? []}
          hidden={profile?.hidden_media ?? []}
          onAdd={handleAddMedia}
          onVisibilityChange={handleMediaVisibilityChange}
          onClose={() => setShowAddMedia(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  body: {
    flexGrow: 1,
    // Bottom-align the form/content when it's shorter than the available height.
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  pagerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerRow: {
    flex: 1,
    flexDirection: 'row',
    // Explicit total width so the later pages aren't cross-stretched out of
    // bounds (which left the details/share stages blank).
    width: SCREEN_WIDTH * 3,
  },
  page: {
    width: SCREEN_WIDTH,
  },
  mediumPage: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  newSquare: {
    // Same square as the media tiles, distinguished by the cream fill + big +.
    backgroundColor: Colors.secondary,
  },
  newSquarePlus: {
    fontFamily: Fonts.serif,
    fontSize: 48,
    lineHeight: 52,
    color: Colors.textPrimary,
  },
  gridScroll: {
    flex: 1,
  },
  squareGrid: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Top-align the wrapped rows of squares.
    alignContent: 'flex-start',
    gap: GRID_GAP,
    paddingTop: 4,
    paddingBottom: 12,
  },
  gridSquare: {
    width: GRID_SQUARE,
    height: GRID_SQUARE,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  mediumSquareText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  dropbox: {
    height: 200,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
  },
  dropboxImage: {
    width: '100%',
    height: '100%',
  },
  dropboxText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
  },
  docFilename: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  textArea: {
    height: 200,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    backgroundColor: Colors.secondary,
  },
  reviewImage: {
    width: '100%',
    height: 220,
    borderWidth: 1,
    borderColor: '#000',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 10,
  },
  reviewLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  reviewValue: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  navBtnShare: {
    backgroundColor: Colors.greenBright,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#000',
    backgroundColor: Colors.mainBg,
    gap: 12,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.white,
  },
  navBtnPrimary: {
    backgroundColor: Colors.accentGolden,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  navBtnSpacer: {
    width: 1,
  },
  guardText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    textAlign: 'center',
    marginBottom: 16,
  },
  guardBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  guardBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
});
