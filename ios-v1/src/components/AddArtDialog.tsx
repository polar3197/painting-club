import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Alert, Animated, PanResponder, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { update_visual_2d, Visual2DOut, Visual2DIn, get_media, MediaType } from '../api';
import PaintingForm from './PaintingForm';
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
  // When provided, the dialog hands the create payload to the parent (which
  // owns the upload + placeholder tile) instead of firing the request itself.
  onCreate?: (payload: Visual2DIn) => void;
}

export default function AddArtDialog({ selectedMedium, username, onSuccess, onClose, onMoved, piece, onCreate }: AddArtDialogProps) {
  const { token } = useAuth();
  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  const [newMedium, setNewMedium] = useState<string | null>(null);

  useEffect(() => {
    get_media().then(setAllMedia).catch(() => {});
  }, []);

  const currentType = allMedia.find((m) => m.name === selectedMedium)?.type ?? null;
  const isVisual2D = currentType === 'visual_2d';
  const compatibleMedia = piece && currentType
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
      : null
  );

  // The picked file lives at the dialog level (not inside PaintingForm) so that
  // the dropbox can sit OUTSIDE the inner ScrollView — that's what makes its
  // drag-down gesture dismiss the sheet reliably (the same pattern as the
  // top grab bar). Inside the ScrollView, iOS native scroll wins the gesture.
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);

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
    if (!formData || !isVisual2D) return;

    if (piece) {
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
    } else {
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
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View
            style={[styles.panel, { transform: [{ translateY }] }]}
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
                    <Text style={styles.dropboxText}>tap to select art</Text>
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
              {isVisual2D && (
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
              {piece && compatibleMedia.length > 0 && (
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
        </KeyboardAvoidingView>
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
  kav: {
    // KAV stretches with the modalRoot so its bottom padding (= keyboard
    // height on iOS) actually lifts the panel above the keyboard.
    flexShrink: 1,
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
  dropbox: {
    height: 200,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'dashed',
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
