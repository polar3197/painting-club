import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Animated, PanResponder, Dimensions, Keyboard, Platform } from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { appAlert } from './AppAlert';
import { TextInput } from './AppTextInput';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../context/AuthContext';
import {
  update_visual_2d,
  remove_visual_2d,
  update_written_form,
  update_audio,
  Visual2DOut,
  Visual2DIn,
  WrittenFormOut,
  WrittenFormIn,
  WrittenFormUpdatePayload,
  AudioOut,
  AudioIn,
  AudioUpdatePayload,
  get_media,
  MediaType,
  thumbSource,
  imageSource,
  get_wip_updates,
  remove_wip_update,
  add_wip_update,
  WipUpdateOut,
} from '../api';
import { extFromPath, isTextExt, useWrittenFormText } from '../hooks';
import PaintingForm from './PaintingForm';
import WrittenFormForm from './WrittenFormForm';
import AudioForm from './AudioForm';
import Dropdown from './Dropdown';
import { AudioPreviewBar } from './AudioPiece';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// True when this OTA bundle runs against the build-#8 picker stub — the audio
// pre-listen is hidden (playback is also stubbed there).
const PICKER_IS_STUB = (DocumentPicker as any).IS_STUB === true;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AddArtDialogProps {
  selectedMedium: string;
  username: string;
  onSuccess: () => void;
  onClose: () => void;
  onMoved?: (newMedium: string) => void;
  piece?: Visual2DOut;
  writtenPiece?: WrittenFormOut;
  audioPiece?: AudioOut;
  // When provided, the dialog hands the create payload to the parent (which
  // owns the upload + placeholder tile) instead of firing the request itself.
  onCreate?: (payload: Visual2DIn) => void;
  onCreateWritten?: (payload: WrittenFormIn) => void;
  onCreateAudio?: (payload: AudioIn) => void;
  // Strip the form down to title + image only. Used for weekly-prompt
  // submissions so users aren't overwhelmed by location/song/dimensions/etc.
  // on a single-piece submission.
  minimal?: boolean;
  // Custom placeholder text shown inside the image dropbox when nothing is
  // picked yet (defaults to "tap to select art").
  dropboxPlaceholder?: string;
  // Pre-fill the series/album field on CREATE — used by the full-page
  // collection views' "+" so a new piece lands in that collection.
  initialSeries?: string;
}

export default function AddArtDialog({
  selectedMedium,
  username,
  onSuccess,
  onClose,
  onMoved,
  piece,
  writtenPiece,
  audioPiece,
  onCreate,
  onCreateWritten,
  onCreateAudio,
  minimal = false,
  dropboxPlaceholder,
  initialSeries,
}: AddArtDialogProps) {
  const { token } = useAuth();
  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  const [newMedium, setNewMedium] = useState<string | null>(null);
  // Two-step inline confirm for the weekly-prompt "remove" action (see handleRemove).
  const [removeConfirm, setRemoveConfirm] = useState(false);

  useEffect(() => {
    get_media().then(setAllMedia).catch(() => {});
  }, []);

  const currentType = allMedia.find((m) => m.name === selectedMedium)?.type ?? null;
  const isVisual2D = currentType === 'visual_2d';
  const isWrittenForm = currentType === 'written_form';
  const isAudio = currentType === 'audio';
  const editingPiece = piece || writtenPiece || audioPiece;
  const compatibleMedia = editingPiece && currentType
    ? allMedia.filter((m) => m.type === currentType && m.name !== selectedMedium).map((m) => m.name)
    : [];
  // The "move to" dropdown is the last row and its option list is absolutely
  // positioned, so it adds no height to the scroll content and gets clipped
  // when opened. Reserve scroll space beneath it (capped at the list's 200px
  // maxHeight) so the expanded options can be scrolled into view.
  const moveToVisible = !minimal && editingPiece && compatibleMedia.length > 0;
  const moveToReserve = moveToVisible ? Math.min(200, compatibleMedia.length * 28) + 12 : 0;
  const [formData, setFormData] = useState<Record<string, any> | null>(
    piece
      ? {
          title: piece.title ?? '',
          location: piece.location ?? '',
          date: piece.date ?? '',
          song: piece.song ?? '',
          song_artist: piece.song_artist ?? '',
          width: piece.width ?? null,
          height: piece.height ?? null,
          keywords: piece.keywords?.join(', ') ?? '',
          series: piece.series_name ?? '',
          comments_enabled: piece.comments_enabled ?? false,
        }
      : writtenPiece
      ? {
          title: writtenPiece.title ?? '',
          date: writtenPiece.date ?? '',
          keywords: writtenPiece.keywords?.join(', ') ?? '',
          series: writtenPiece.series_name ?? '',
          comments_enabled: writtenPiece.comments_enabled ?? false,
        }
      : audioPiece
      ? {
          title: audioPiece.title ?? '',
          artist: audioPiece.artist ?? '',
          date: audioPiece.date ?? '',
          keywords: audioPiece.keywords?.join(', ') ?? '',
          series: audioPiece.series_name ?? '',
          comments_enabled: audioPiece.comments_enabled ?? false,
        }
      : null
  );

  // The picked file lives at the dialog level (not inside PaintingForm) so that
  // the dropbox can sit OUTSIDE the inner ScrollView — that's what makes its
  // drag-down gesture dismiss the sheet reliably (the same pattern as the
  // top grab bar). Inside the ScrollView, iOS native scroll wins the gesture.
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  // Extra images beyond the first when creating visual pieces — the picker
  // allows multi-select for new art so a whole series uploads in one go.
  // Edits (file replacement) stay single-file.
  const [extraFiles, setExtraFiles] = useState<{ uri: string; name: string; type: string }[]>([]);
  // Measured length of a newly picked audio file (via the pre-listen player),
  // sent as duration_seconds with the create/replace payload.
  const [pickedDuration, setPickedDuration] = useState<number | null>(null);
  // Written-form-only: choose between picking a file and pasting text. Pasted
  // text exists so users can pull from Notes / Google Docs / anywhere a file
  // picker can't reach.
  // Editing a text-backed piece opens on the text tab, prefilled below — the
  // "edit text" tab is a lie otherwise (it showed an empty paste box).
  const [writeMode, setWriteMode] = useState<'file' | 'text'>(
    writtenPiece && isTextExt(extFromPath(writtenPiece.file_path)) ? 'text' : 'file'
  );
  const [pastedText, setPastedText] = useState('');
  // The piece's current text (null for pdf/docx or while fetching). Prefills
  // the edit box once; the original is kept so an untouched box doesn't send a
  // pointless rewrite on update (which would also convert .md → .txt).
  const existingText = useWrittenFormText(writtenPiece?.file_path ?? '');
  const originalTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (existingText == null || originalTextRef.current != null) return;
    originalTextRef.current = existingText;
    setPastedText((prev) => (prev === '' ? existingText : prev));
  }, [existingText]);

  // Optional cover image for written pieces — shown on the card instead of the
  // text snippet. `coverCleared` marks an existing cover for removal on save.
  const [coverFile, setCoverFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [coverCleared, setCoverCleared] = useState(false);
  const existingCoverPath = writtenPiece?.cover_image_path ?? null;
  const shownCover = coverFile
    ? { uri: coverFile.uri }
    : existingCoverPath && !coverCleared
    ? imageSource(existingCoverPath)
    : null;
  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setCoverFile({
      uri: asset.uri,
      name: asset.uri.split('/').pop() || 'cover.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
    setCoverCleared(false);
  };
  const removeCover = () => {
    setCoverFile(null);
    if (existingCoverPath) setCoverCleared(true);
  };

  // Toggles live in the pinned footer (not inside the scrolling forms), so the
  // dialog owns their state; the forms' internal copies are hidden and the
  // submit paths read these instead.
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(
    editingPiece?.comments_enabled ?? true
  );
  const [isWipToggle, setIsWipToggle] = useState<boolean>(piece?.is_wip ?? false);
  const commentsThumb = useRef(new Animated.Value((editingPiece?.comments_enabled ?? true) ? 18 : 0)).current;
  const wipThumb = useRef(new Animated.Value(piece?.is_wip ? 18 : 0)).current;
  const toggleComments = () => {
    const next = !commentsEnabled;
    Animated.timing(commentsThumb, { toValue: next ? 18 : 0, duration: 200, useNativeDriver: true }).start();
    setCommentsEnabled(next);
  };
  const toggleWip = () => {
    const next = !isWipToggle;
    Animated.timing(wipThumb, { toValue: next ? 18 : 0, duration: 200, useNativeDriver: true }).start();
    setIsWipToggle(next);
  };

  // WIP edit mode: for a WIP piece the big dropbox is replaced by a horizontal
  // strip of cards — the whole collection (archived states then the current
  // image) plus a square + at the end that posts a new update. × removes an
  // archived state IMMEDIATELY (server call on tap, no deferred save).
  const wipMode = isVisual2D && !!piece && isWipToggle;
  const [wipRows, setWipRows] = useState<WipUpdateOut[]>([]);
  // The piece's current image — updated in place when + posts a new update
  // (the parent's piece prop is a stale snapshot until the profile refetches).
  const [wipCurrentPath, setWipCurrentPath] = useState(piece?.file_path ?? '');
  const [wipPosting, setWipPosting] = useState(false);
  useEffect(() => {
    if (!piece?.is_wip) return;
    let cancelled = false;
    get_wip_updates(piece.id)
      .then((rows) => { if (!cancelled) setWipRows(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [piece?.id, piece?.is_wip]);
  const removeWipRow = (updateId: string) => {
    remove_wip_update(piece!.id, updateId, token)
      .then(() => {
        setWipRows((rows) => rows.filter((r) => r.id !== updateId));
        onSuccess();
      })
      .catch((err: any) => appAlert('Error', err?.message || 'Something went wrong'));
  };
  const addWipPiece = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setWipPosting(true);
    try {
      const resp: any = await add_wip_update(piece!.id, token, {
        uri: a.uri,
        name: a.uri.split('/').pop() || 'update.jpg',
        type: a.mimeType || 'image/jpeg',
      });
      if (resp?.file_path) setWipCurrentPath(resp.file_path);
      const rows = await get_wip_updates(piece!.id);
      setWipRows(rows);
      onSuccess();
    } catch (err: any) {
      appAlert('Error', err?.message || 'Something went wrong');
    } finally {
      setWipPosting(false);
    }
  };

  // Track the keyboard height so the panel can shrink (rather than being
  // pushed off the top of the screen by KeyboardAvoidingView's padding hack).
  // We anchor the panel above the keyboard via modalRoot's paddingBottom and
  // cap the panel's height to what's left of the screen so the swipe handle
  // and dropbox stay reachable when an input is focused. The `kbHeight` state
  // drives only the height cap (a discrete jump is fine there); the anchor
  // *padding* is animated by useAnimatedKeyboard below so the panel rises welded
  // to the keyboard frame instead of jumping a render behind it.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const keyboard = useAnimatedKeyboard();
  const modalRootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));

  const pickImage = async () => {
    const creating = !piece; // multi-select only for new pieces, not file swaps
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: creating,
      selectionLimit: creating ? 12 : 1,
    });
    if (!result.canceled && result.assets[0]) {
      const toFile = (asset: (typeof result.assets)[0]) => ({
        uri: asset.uri,
        name: asset.uri.split('/').pop() || 'image.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      setPickedFile(toFile(result.assets[0]));
      setExtraFiles(result.assets.slice(1).map(toFile));
    }
  };

  // Document picker for written-form: matches the web's accept=".pdf,.txt,.docx,.md".
  // Backend cross-checks MIME against extension (src/api/main.py:903) so the
  // mapping below sets a sensible type even when iOS reports a generic one.
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // iOS sometimes UTIs .md as public.data — allow-all keeps the picker permissive;
        // backend will reject anything outside WRITTEN_FORM_EXTS.
        'application/octet-stream',
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name = asset.name || (asset.uri.split('/').pop() ?? 'document');
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mimeByExt: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const type = asset.mimeType || mimeByExt[ext] || 'application/octet-stream';
    setPickedFile({ uri: asset.uri, name, type });
  };

  // Audio picker. 'public.audio' is the umbrella UTI on iOS — it surfaces files
  // from the Files app including Voice Memos recordings the user has saved/shared
  // there (.m4a). The backend's AUDIO_EXTS allows m4a/mp3/wav/aac and re-checks
  // the bytes, so the mapping below just sets a sensible MIME when iOS reports a
  // generic one.
  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      // public.mpeg-4 makes .mp4 files selectable (iOS types them as movie,
      // not audio) — the backend sniffs the container and stores them as .m4a.
      type: ['public.audio', 'audio/*', 'public.mpeg-4'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name = asset.name || (asset.uri.split('/').pop() ?? 'audio.m4a');
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mimeByExt: Record<string, string> = {
      m4a: 'audio/m4a',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      mp4: 'audio/mp4',
    };
    const type = asset.mimeType || mimeByExt[ext] || 'audio/m4a';
    setPickedDuration(null);
    setPickedFile({ uri: asset.uri, name, type });
  };

  const translateY = useRef(new Animated.Value(0)).current;

  const handleDrag = (dy: number) => {
    if (dy > 0) translateY.setValue(dy);
  };
  const handleRelease = (dy: number) => {
    if (dy > 120) {
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start(onClose);
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    }
  };

  // Start-on-touch handler for the grab bar — pulling down from the handle
  // works immediately, no move threshold. We removed the previous panel-wide
  // capture responder because it conflicted with the inner ScrollView's
  // vertical gestures (and made the form unscrollable when the keyboard was up).
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Grabbing the handle collapses the keyboard so the sheet has room to
      // slide down (otherwise the keyboard blocks the drag's travel).
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_, g) => handleDrag(g.dy),
      onPanResponderRelease: (_, g) => handleRelease(g.dy),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // Drag-down on the image dropbox dismisses the sheet. Because the dropbox is
  // rendered OUTSIDE the ScrollView (in the panel header area), there's no
  // native scroll recognizer competing for the gesture — same as the grab bar.
  // We still use capture-on-move so taps fall through to pickImage when there's
  // no actual drag.
  const dropboxPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => handleDrag(g.dy),
      onPanResponderRelease: (_, g) => handleRelease(g.dy),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const submit = () => {
    if (!formData) return;
    if (!isVisual2D && !isWrittenForm && !isAudio) return;

    if (isVisual2D && piece) {
      const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
      const updatePayload = {
        title: formData.title,
        location: formData.location,
        song: formData.song,
        song_artist: formData.song_artist,
        date: formData.date || null,
        width: formData.width,
        height: formData.height,
        keywords: formData.keywords
          ? formData.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : null,
        comments_enabled: commentsEnabled,
        medium: moving,
        series_name: formData.series ? formData.series : null,
        // Clear the series if the field was emptied while editing.
        clear_series: !formData.series && !!piece.series_name,
        is_wip: isWipToggle,
        file: pickedFile,
      };
      onClose();
      update_visual_2d(piece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          appAlert('Error', err?.message || 'Something went wrong');
        });
    } else if (isVisual2D) {
      if (!pickedFile) {
        appAlert('Missing', 'Please select an image.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        appAlert('Missing', 'Please enter a title.');
        return;
      }
      // Multiple images land as ONE series post on the profile, so the
      // series field is what groups them — require it for multi-picks.
      if (extraFiles.length > 0 && !(formData.series || '').trim()) {
        appAlert(
          'Name the series',
          'You picked multiple images — give the series a name so they land as one post.',
        );
        return;
      }
      const basePayload = {
        username,
        medium: selectedMedium,
        location: formData.location,
        song: formData.song,
        song_artist: formData.song_artist,
        date: formData.date,
        width: formData.width,
        height: formData.height,
        keywords: formData.keywords,
        comments_enabled: commentsEnabled,
        series_name: (formData.series || '').trim() || undefined,
      };
      onClose();
      // Parent owns the upload + placeholder tile — one create per picked
      // image. Multi-picks share all metadata; titles get numbered.
      const files = [pickedFile, ...extraFiles];
      files.forEach((file, i) => {
        onCreate?.({
          ...basePayload,
          title: files.length > 1 ? `${title} ${i + 1}` : title,
          file,
        } as Visual2DIn);
      });
    } else if (isWrittenForm && writtenPiece) {
      const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
      const trimmedText = pastedText.trim();
      const replacingFile = writeMode === 'file' && pickedFile != null;
      const replacingText =
        writeMode === 'text' &&
        !!trimmedText &&
        trimmedText !== (originalTextRef.current ?? '').trim();
      const updatePayload: WrittenFormUpdatePayload = {
        title: formData.title,
        date: formData.date || null,
        keywords: formData.keywords
          ? formData.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : null,
        comments_enabled: commentsEnabled,
        medium: moving,
        series_name: formData.series ? formData.series : null,
        // Clear the series if the field was emptied while editing.
        clear_series: !formData.series && !!writtenPiece.series_name,
        ...(replacingFile ? { file: pickedFile } : {}),
        ...(replacingText ? { text: trimmedText } : {}),
        ...(coverFile
          ? { cover: coverFile }
          : coverCleared && existingCoverPath
          ? { clear_cover: true }
          : {}),
      };
      onClose();
      update_written_form(writtenPiece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          appAlert('Error', err?.message || 'Something went wrong');
        });
    } else if (isWrittenForm) {
      const trimmedText = pastedText.trim();
      if (writeMode === 'file' && !pickedFile) {
        appAlert('Missing', 'Please select a file.');
        return;
      }
      if (writeMode === 'text' && !trimmedText) {
        appAlert('Missing', 'Please paste some text.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        appAlert('Missing', 'Please enter a title.');
        return;
      }
      const createPayload: WrittenFormIn = {
        username,
        medium: selectedMedium,
        title,
        date: formData.date || undefined,
        keywords: formData.keywords,
        comments_enabled: commentsEnabled,
        series_name: formData.series || undefined,
        ...(writeMode === 'file' && pickedFile ? { file: pickedFile } : { text: trimmedText }),
        ...(coverFile ? { cover: coverFile } : {}),
      };
      onClose();
      onCreateWritten?.(createPayload);
    } else if (isAudio && audioPiece) {
      const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
      const updatePayload: AudioUpdatePayload = {
        title: formData.title,
        date: formData.date || null,
        artist: formData.artist || null,
        keywords: formData.keywords
          ? formData.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : null,
        comments_enabled: commentsEnabled,
        medium: moving,
        series_name: formData.series ? formData.series : null,
        clear_series: !formData.series && !!audioPiece.series_name,
        // duration only travels with a replacement file — otherwise the stored
        // value still describes the existing audio.
        ...(pickedFile ? { file: pickedFile, duration_seconds: pickedDuration ?? undefined } : {}),
      };
      onClose();
      update_audio(audioPiece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          appAlert('Error', err?.message || 'Something went wrong');
        });
    } else if (isAudio) {
      if (!pickedFile) {
        appAlert('Missing', 'Please select an audio file.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        appAlert('Missing', 'Please enter a title.');
        return;
      }
      const createPayload: AudioIn = {
        username,
        medium: selectedMedium,
        title,
        artist: formData.artist || undefined,
        date: formData.date || undefined,
        keywords: formData.keywords,
        comments_enabled: commentsEnabled,
        duration_seconds: pickedDuration ?? undefined,
        series_name: formData.series || undefined,
        file: pickedFile,
      };
      onClose();
      onCreateAudio?.(createPayload);
    }
  };

  // Remove (delete) the piece being edited. Only surfaced for weekly-prompt
  // submissions (the minimal editor) — deleting the piece is what takes it out
  // of the prompt. The confirm is INLINE (a two-step tap via removeConfirm)
  // rather than an appAlert: appAlert renders its own Modal, and a Modal fired
  // from inside this open sheet mounts behind it on iOS (tap does nothing).
  // Same reason DeleteAccountDialog confirms inline instead of via appAlert.
  const handleRemove = () => {
    if (!piece) return;
    onClose();
    remove_visual_2d(piece.id, token)
      .then(() => onSuccess())
      .catch((err: any) => appAlert('Error', err?.message || 'Could not remove'));
  };

  // Hard cap = 80% of screen. When the keyboard is up we further cap so the
  // panel never extends above the screen top — leaving room for the swipe
  // handle + status bar.
  const panelMaxHeight = Math.min(
    SCREEN_HEIGHT * 0.8,
    SCREEN_HEIGHT - kbHeight - 60,
  );

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Reanimated.View style={[styles.modalRoot, modalRootStyle]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[styles.panel, { maxHeight: panelMaxHeight, transform: [{ translateY }] }]}
        >
            <View style={styles.swipeHandle} {...handlePanResponder.panHandlers}>
              <View style={styles.swipeBar} />
            </View>
            {/* Dropbox sits outside the ScrollView so its drag-down responder
                isn't fighting the native scroll recognizer. The pan handlers go
                on the WRAPPING View, not the Pressable, because Pressable owns
                its own responder lifecycle — spreading panHandlers onto it just
                clobbers each other and both tap and drag stop working. With the
                outer View holding panHandlers, the inner Pressable handles tap,
                and a real downward drag is captured by the parent (capture
                phase wins over the child) and dismisses the sheet. */}
            {isVisual2D && !wipMode && (
              <View {...dropboxPanResponder.panHandlers}>
                <Pressable style={styles.dropbox} onPress={pickImage}>
                  {pickedFile ? (
                    <>
                      <Image source={{ uri: pickedFile.uri }} style={styles.dropboxImage} contentFit="contain" />
                      {extraFiles.length > 0 && (
                        <View style={styles.multiBadge}>
                          <Text style={styles.multiBadgeText}>+{extraFiles.length} more</Text>
                        </View>
                      )}
                    </>
                  ) : piece ? (
                    // Editing with nothing newly picked: show the piece's
                    // current image (cached thumb — instant) so the edit view
                    // reflects what's there; picking still replaces it.
                    <Image
                      source={thumbSource(piece.id, piece.file_path)}
                      style={styles.dropboxImage}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.dropboxText}>{dropboxPlaceholder ?? 'tap to select art'}</Text>
                  )}
                </Pressable>
              </View>
            )}
            {wipMode && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.wipStrip}
                contentContainerStyle={styles.wipStripContent}
                keyboardShouldPersistTaps="handled"
              >
                {wipRows.map((r) => (
                  <View key={r.id} style={styles.wipCard}>
                    <Image source={imageSource(r.file_path)} style={styles.wipCardImg} contentFit="cover" />
                    <Pressable
                      style={styles.wipCardRemove}
                      onPress={() => removeWipRow(r.id)}
                      hitSlop={6}
                    >
                      <Text style={styles.wipCardRemoveText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                {/* The current image — the piece itself, so no ×; + supersedes it. */}
                <View style={styles.wipCard}>
                  <Image source={imageSource(wipCurrentPath)} style={styles.wipCardImg} contentFit="cover" />
                </View>
                <Pressable
                  style={[styles.wipAddBtn, wipPosting && { opacity: 0.5 }]}
                  onPress={wipPosting ? undefined : addWipPiece}
                >
                  <Text style={styles.wipAddBtnText}>+</Text>
                </Pressable>
              </ScrollView>
            )}
            {isWrittenForm && (
              <View style={styles.modeTabs}>
                <Pressable
                  style={[styles.modeTab, writeMode === 'file' && styles.modeTabActive]}
                  onPress={() => { setWriteMode('file'); Keyboard.dismiss(); }}
                >
                  <Text style={styles.modeTabText}>{writtenPiece ? 'replace file' : 'upload .txt'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeTab, writeMode === 'text' && styles.modeTabActive]}
                  onPress={() => setWriteMode('text')}
                >
                  <Text style={styles.modeTabText}>{writtenPiece ? 'edit text' : 'paste text'}</Text>
                </Pressable>
              </View>
            )}
            {isWrittenForm && writeMode === 'file' && (
              <View {...dropboxPanResponder.panHandlers}>
                <Pressable style={styles.dropbox} onPress={pickDocument}>
                  {pickedFile ? (
                    <View style={styles.docPreview}>
                      <View style={styles.docBadge}>
                        <Text style={styles.docBadgeText}>
                          {(pickedFile.name.split('.').pop() || '').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.docFilename} numberOfLines={2}>{pickedFile.name}</Text>
                    </View>
                  ) : writtenPiece ? (
                    <View style={styles.docPreview}>
                      <View style={styles.docBadge}>
                        <Text style={styles.docBadgeText}>
                          {extFromPath(writtenPiece.file_path).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.docFilename} numberOfLines={2}>{writtenPiece.title}</Text>
                    </View>
                  ) : (
                    <Text style={styles.dropboxText}>tap to select writing</Text>
                  )}
                </Pressable>
              </View>
            )}
            {isWrittenForm && (
              <View style={styles.coverRow}>
                <Pressable style={styles.coverSlot} onPress={pickCover}>
                  {shownCover ? (
                    <Image source={shownCover} style={styles.coverImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.coverSlotText}>cover</Text>
                  )}
                </Pressable>
                {!!shownCover && (
                  <Pressable style={styles.coverRemove} onPress={removeCover} hitSlop={6}>
                    <Text style={styles.coverRemoveText}>×</Text>
                  </Pressable>
                )}
              </View>
            )}
            {isAudio && (
              <View {...dropboxPanResponder.panHandlers}>
                <Pressable
                  style={[styles.dropbox, PICKER_IS_STUB && styles.dropboxDisabled]}
                  onPress={PICKER_IS_STUB ? undefined : pickAudio}
                >
                  {pickedFile ? (
                    <View style={styles.docPreview}>
                      <View style={styles.docBadge}>
                        <Text style={styles.docBadgeText}>
                          {(pickedFile.name.split('.').pop() || 'AUDIO').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.docFilename} numberOfLines={2}>{pickedFile.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.dropboxText}>
                      {PICKER_IS_STUB
                        ? 'audio uploads arrive with the next app update'
                        : audioPiece ? 'tap to replace audio' : 'tap to select audio'}
                    </Text>
                  )}
                </Pressable>
                {pickedFile && !PICKER_IS_STUB ? (
                  // Pre-listen the picked file; also measures duration_seconds.
                  <View style={styles.previewWrap}>
                    <AudioPreviewBar
                      key={pickedFile.uri}
                      uri={pickedFile.uri}
                      onDuration={setPickedDuration}
                    />
                  </View>
                ) : (
                  <Text style={styles.dropboxHint}>
                    from voice memos: share a recording → "save to files", then pick it here
                  </Text>
                )}
              </View>
            )}
            {/* ScrollView lets the user reach every field (and the submit button)
                when the keyboard is up. keyboardShouldPersistTaps='handled' lets
                taps on Pressables register without first dismissing the keyboard. */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {isWrittenForm && writeMode === 'text' && (
                <TextInput
                  style={styles.textArea}
                  value={pastedText}
                  onChangeText={setPastedText}
                  placeholder="paste your text here"
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              )}
              {isVisual2D && minimal && (
                <View style={styles.minimalForm}>
                  <TextInput
                    style={styles.minimalTitleInput}
                    value={formData?.title ?? ''}
                    onChangeText={(v) => setFormData((prev) => ({ ...(prev ?? {}), title: v }))}
                    placeholder="title *"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.submitBtn} onPress={submit}>
                    <Text style={styles.submitBtnText}>{piece ? 'update' : 'submit'}</Text>
                  </Pressable>
                  {piece && (
                    removeConfirm ? (
                      <View style={styles.removeConfirmRow}>
                        <Pressable style={styles.removeBtn} onPress={handleRemove}>
                          <Text style={styles.removeBtnText}>remove for real</Text>
                        </Pressable>
                        <Pressable style={styles.removeBtn} onPress={() => setRemoveConfirm(false)}>
                          <Text style={styles.removeCancelText}>cancel</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={styles.removeBtn} onPress={() => setRemoveConfirm(true)}>
                        <Text style={styles.removeBtnText}>remove</Text>
                      </Pressable>
                    )
                  )}
                </View>
              )}
              {isVisual2D && !minimal && (
                <PaintingForm
                  onDataChange={setFormData}
                  initialData={piece}
                  initialSeries={initialSeries}
                  hideToggles
                />
              )}
              {isWrittenForm && (
                <WrittenFormForm
                  onDataChange={setFormData}
                  initialData={writtenPiece}
                  hideToggles
                />
              )}
              {isAudio && (
                <AudioForm
                  onDataChange={setFormData}
                  initialData={audioPiece}
                  initialSeries={initialSeries}
                  hideToggles
                />
              )}
            </ScrollView>
            {!minimal && (
              <View style={styles.footerBar}>
                {moveToVisible && (
                  <View style={styles.moveToRow}>
                    <Text style={styles.moveToLabel}>move to:</Text>
                    <View style={styles.moveToDropdown}>
                      <Dropdown
                        placeholder={newMedium ?? selectedMedium}
                        options={compatibleMedia}
                        onSelect={setNewMedium}
                        openUp
                        showAfterKeyboard
                      />
                    </View>
                  </View>
                )}
                <View style={styles.footerActions}>
                  {isVisual2D && !!piece && (
                    <View style={styles.footerToggle}>
                      <Text style={styles.footerToggleLabel}>wip</Text>
                      <Pressable
                        style={[
                          styles.toggleTrack,
                          { backgroundColor: isWipToggle ? Colors.greenBright : Colors.redLight },
                        ]}
                        onPress={toggleWip}
                      >
                        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: wipThumb }] }]} />
                      </Pressable>
                    </View>
                  )}
                  <View style={styles.footerToggle}>
                    <Text style={styles.footerToggleLabel}>comments</Text>
                    <Pressable
                      style={[
                        styles.toggleTrack,
                        { backgroundColor: commentsEnabled ? Colors.greenBright : Colors.redLight },
                      ]}
                      onPress={toggleComments}
                    >
                      <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: commentsThumb }] }]} />
                    </Pressable>
                  </View>
                  <Pressable style={[styles.submitBtn, styles.footerSubmit]} onPress={submit}>
                    <Text style={styles.submitBtnText}>{editingPiece ? 'update' : 'submit'}</Text>
                  </Pressable>
                </View>
              </View>
            )}
        </Animated.View>
      </Reanimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    backgroundColor: Colors.mainBg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: '#000',
    // Cap the panel so a long form yields a scrollable area instead of pushing
    // submit off-screen. Picked at ~80% so a peek of the backdrop stays tappable.
    maxHeight: SCREEN_HEIGHT * 0.8,
    // Lifts the sheet a bit off the screen edge so there's breathing room
    // beneath the submit button and the home indicator.
    paddingBottom: 36,
  },
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 6,
  },
  modeTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: Colors.secondary,
  },
  modeTabText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  textArea: {
    height: 160,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
    backgroundColor: Colors.secondary,
  },
  dropboxDisabled: {
    opacity: 0.5,
    borderStyle: 'dashed',
  },
  dropbox: {
    height: 160,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
  },
  dropboxImage: {
    width: '100%',
    height: '100%',
  },
  multiBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.accentGolden,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  multiBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.black,
  },
  dropboxText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
  },
  dropboxHint: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xxs,
    color: Colors.textMuted,
    marginTop: 4,
    marginHorizontal: 16,
  },
  // Wraps the audio pre-listen player under the dropbox.
  previewWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  docPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  docBadge: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.accentGolden,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  docBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  docFilename: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
    textAlign: 'center',
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  swipeHandle: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  formContent: {
    padding: 16,
    paddingBottom: 20,
  },
  minimalForm: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  minimalTitleInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 8,
  },
  submitBtn: {
    // Now rendered inline with the comments toggle via PaintingForm's rightSlot,
    // so the previous alignSelf/marginTop are no longer needed.
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.greenBright,
  },
  submitBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  removeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  removeConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  removeBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.redCoral,
    textDecorationLine: 'underline',
  },
  removeCancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  moveToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#000',
    gap: 10,
  },
  moveToLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  moveToDropdown: {
    flex: 1,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 8,
  },
  coverSlot: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverSlotText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  coverRemove: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverRemoveText: {
    fontFamily: Fonts.serif,
    fontSize: 13,
    lineHeight: 15,
    color: Colors.black,
  },
  // Pinned footer: move-to + toggles + update stay visible while the form
  // scrolls above them.
  footerBar: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  footerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerToggleLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
  toggleTrack: {
    width: 36,
    height: 18,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 12,
    height: 12,
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
  },
  footerSubmit: {
    marginLeft: 'auto',
  },
  // Strip of a WIP piece's archived images (edit mode) — each removable.
  wipStrip: {
    marginHorizontal: 16,
    marginTop: 8,
    flexGrow: 0,
  },
  wipStripContent: {
    gap: 10,
    paddingVertical: 8,
    paddingRight: 16,
  },
  wipCard: {
    width: 110,
    height: 110,
  },
  wipCardImg: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
  },
  wipCardRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wipCardRemoveText: {
    fontFamily: Fonts.serif,
    fontSize: 14,
    lineHeight: 16,
    color: Colors.black,
  },
  wipAddBtn: {
    width: 110,
    height: 110,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wipAddBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    color: Colors.black,
  },
});
