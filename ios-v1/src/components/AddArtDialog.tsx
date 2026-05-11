import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Alert, Animated, PanResponder, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
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
          file: null,
        }
      : null
  );

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

  // Capture-on-move handler for the whole panel — claims a vertical drag
  // started on top of inputs/pressables once it's clearly vertical.
  const panelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => handleDrag(g.dy),
      onPanResponderRelease: (_, g) => handleRelease(g.dy),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // Start-on-touch handler for the grab bar — pulling down from the handle
  // works immediately, no move threshold.
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
      if (!formData.file) {
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
        file: formData.file,
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View
            style={[styles.panel, { transform: [{ translateY }] }]}
            {...panelPanResponder.panHandlers}
          >
            <View style={styles.swipeHandle} {...handlePanResponder.panHandlers}>
              <View style={styles.swipeBar} />
            </View>
            <View style={styles.formContent}>
              {isVisual2D && (
                <PaintingForm onDataChange={setFormData} initialData={piece} />
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
              <Pressable style={styles.submitBtn} onPress={submit}>
                <Text style={styles.submitBtnText}>{piece ? 'update' : 'submit'}</Text>
              </Pressable>
            </View>
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
  panel: {
    backgroundColor: Colors.mainBg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: '#000',
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
    alignSelf: 'flex-end',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 10,
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
