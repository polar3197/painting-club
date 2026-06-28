import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Alert, Animated, PanResponder, Dimensions, Keyboard, Platform, TextInput } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../context/AuthContext';
import {
  update_visual_2d,
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
} from '../api';
import PaintingForm from './PaintingForm';
import WrittenFormForm from './WrittenFormForm';
import AudioForm from './AudioForm';
import Dropdown from './Dropdown';
import { Colors, Fonts, FontSizes } from '../constants/theme';

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
}: AddArtDialogProps) {
  const { token } = useAuth();
  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  const [newMedium, setNewMedium] = useState<string | null>(null);

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
          comments_enabled: audioPiece.comments_enabled ?? false,
        }
      : null
  );

  // The picked file lives at the dialog level (not inside PaintingForm) so that
  // the dropbox can sit OUTSIDE the inner ScrollView — that's what makes its
  // drag-down gesture dismiss the sheet reliably (the same pattern as the
  // top grab bar). Inside the ScrollView, iOS native scroll wins the gesture.
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  // Written-form-only: choose between picking a file and pasting text. Pasted
  // text exists so users can pull from Notes / Google Docs / anywhere a file
  // picker can't reach.
  const [writeMode, setWriteMode] = useState<'file' | 'text'>('file');
  const [pastedText, setPastedText] = useState('');

  // Track the keyboard height so the panel can shrink (rather than being
  // pushed off the top of the screen by KeyboardAvoidingView's padding hack).
  // We anchor the panel above the keyboard via modalRoot's paddingBottom and
  // cap the panel's height to what's left of the screen so the swipe handle
  // and dropbox stay reachable when an input is focused.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = uri.split('/').pop() || 'image.jpg';
      const type = asset.mimeType || 'image/jpeg';
      setPickedFile({ uri, name, type });
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
      type: ['public.audio', 'audio/*'],
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
        comments_enabled: formData.comments_enabled,
        medium: moving,
        file: pickedFile,
      };
      onClose();
      update_visual_2d(piece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          Alert.alert('Error', err?.message || 'Something went wrong');
        });
    } else if (isVisual2D) {
      if (!pickedFile) {
        Alert.alert('Missing', 'Please select an image.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        Alert.alert('Missing', 'Please enter a title.');
        return;
      }
      const createPayload: Visual2DIn = {
        username,
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
      onClose();
      // Parent owns the upload + placeholder tile.
      onCreate?.(createPayload);
    } else if (isWrittenForm && writtenPiece) {
      const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
      const trimmedText = pastedText.trim();
      const replacingFile = writeMode === 'file' && pickedFile != null;
      const replacingText = writeMode === 'text' && !!trimmedText;
      const updatePayload: WrittenFormUpdatePayload = {
        title: formData.title,
        date: formData.date || null,
        keywords: formData.keywords
          ? formData.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : null,
        comments_enabled: formData.comments_enabled,
        medium: moving,
        series_name: formData.series ? formData.series : null,
        // Clear the series if the field was emptied while editing.
        clear_series: !formData.series && !!writtenPiece.series_name,
        ...(replacingFile ? { file: pickedFile } : {}),
        ...(replacingText ? { text: trimmedText } : {}),
      };
      onClose();
      update_written_form(writtenPiece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          Alert.alert('Error', err?.message || 'Something went wrong');
        });
    } else if (isWrittenForm) {
      const trimmedText = pastedText.trim();
      if (writeMode === 'file' && !pickedFile) {
        Alert.alert('Missing', 'Please select a file.');
        return;
      }
      if (writeMode === 'text' && !trimmedText) {
        Alert.alert('Missing', 'Please paste some text.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        Alert.alert('Missing', 'Please enter a title.');
        return;
      }
      const createPayload: WrittenFormIn = {
        username,
        medium: selectedMedium,
        title,
        date: formData.date || undefined,
        keywords: formData.keywords,
        comments_enabled: formData.comments_enabled,
        series_name: formData.series || undefined,
        ...(writeMode === 'file' && pickedFile ? { file: pickedFile } : { text: trimmedText }),
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
        comments_enabled: formData.comments_enabled,
        medium: moving,
        ...(pickedFile ? { file: pickedFile } : {}),
      };
      onClose();
      update_audio(audioPiece.id, token, updatePayload)
        .then(() => {
          if (moving && onMoved) onMoved(moving);
          onSuccess();
        })
        .catch((err: any) => {
          Alert.alert('Error', err?.message || 'Something went wrong');
        });
    } else if (isAudio) {
      if (!pickedFile) {
        Alert.alert('Missing', 'Please select an audio file.');
        return;
      }
      const title = (formData.title || '').trim();
      if (!title) {
        Alert.alert('Missing', 'Please enter a title.');
        return;
      }
      const createPayload: AudioIn = {
        username,
        medium: selectedMedium,
        title,
        artist: formData.artist || undefined,
        date: formData.date || undefined,
        keywords: formData.keywords,
        comments_enabled: formData.comments_enabled,
        file: pickedFile,
      };
      onClose();
      onCreateAudio?.(createPayload);
    }
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
      <View style={[styles.modalRoot, { paddingBottom: kbHeight }]}>
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
            {isVisual2D && (
              <View {...dropboxPanResponder.panHandlers}>
                <Pressable style={styles.dropbox} onPress={pickImage}>
                  {pickedFile ? (
                    <Image source={{ uri: pickedFile.uri }} style={styles.dropboxImage} contentFit="contain" />
                  ) : (
                    <Text style={styles.dropboxText}>{dropboxPlaceholder ?? 'tap to select art'}</Text>
                  )}
                </Pressable>
              </View>
            )}
            {isWrittenForm && (
              <View style={styles.modeTabs}>
                <Pressable
                  style={[styles.modeTab, writeMode === 'file' && styles.modeTabActive]}
                  onPress={() => { setWriteMode('file'); setPastedText(''); Keyboard.dismiss(); }}
                >
                  <Text style={styles.modeTabText}>{writtenPiece ? 'replace file' : 'upload .txt'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeTab, writeMode === 'text' && styles.modeTabActive]}
                  onPress={() => { setWriteMode('text'); setPickedFile(null); }}
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
                  ) : (
                    <Text style={styles.dropboxText}>tap to select writing</Text>
                  )}
                </Pressable>
              </View>
            )}
            {isAudio && (
              <View {...dropboxPanResponder.panHandlers}>
                <Pressable style={styles.dropbox} onPress={pickAudio}>
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
                      {audioPiece ? 'tap to replace audio' : 'tap to select audio'}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
            {/* ScrollView lets the user reach every field (and the submit button)
                when the keyboard is up. keyboardShouldPersistTaps='handled' lets
                taps on Pressables register without first dismissing the keyboard. */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
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
                </View>
              )}
              {isVisual2D && !minimal && (
                <PaintingForm
                  onDataChange={setFormData}
                  initialData={piece}
                  rightSlot={
                    <Pressable style={styles.submitBtn} onPress={submit}>
                      <Text style={styles.submitBtnText}>{piece ? 'update' : 'submit'}</Text>
                    </Pressable>
                  }
                />
              )}
              {isWrittenForm && (
                <WrittenFormForm
                  onDataChange={setFormData}
                  initialData={writtenPiece}
                  rightSlot={
                    <Pressable style={styles.submitBtn} onPress={submit}>
                      <Text style={styles.submitBtnText}>{writtenPiece ? 'update' : 'submit'}</Text>
                    </Pressable>
                  }
                />
              )}
              {isAudio && (
                <AudioForm
                  onDataChange={setFormData}
                  initialData={audioPiece}
                  rightSlot={
                    <Pressable style={styles.submitBtn} onPress={submit}>
                      <Text style={styles.submitBtnText}>{audioPiece ? 'update' : 'submit'}</Text>
                    </Pressable>
                  }
                />
              )}
              {!minimal && editingPiece && compatibleMedia.length > 0 && (
                <View style={styles.moveToRow}>
                  <Text style={styles.moveToLabel}>move to:</Text>
                  <View style={styles.moveToDropdown}>
                    <Dropdown
                      placeholder={newMedium ?? selectedMedium}
                      options={compatibleMedia}
                      onSelect={setNewMedium}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
        </Animated.View>
      </View>
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
  dropboxText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
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
});
