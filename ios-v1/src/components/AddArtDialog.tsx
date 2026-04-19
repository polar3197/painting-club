import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Alert, Animated, PanResponder, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { add_new_visual_2d, update_visual_2d, Visual2DOut, get_media, MediaType } from '../api';
import PaintingForm from './PaintingForm';
import Dropdown from './Dropdown';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const isVisual2D = (medium: string) =>
  medium === 'drawing' || medium === 'painting' || medium === 'stained glass' || medium === 'photography';

interface AddArtDialogProps {
  selectedMedium: string;
  username: string;
  onSuccess: () => void;
  onClose: () => void;
  onMoved?: (newMedium: string) => void;
  piece?: Visual2DOut;
}

export default function AddArtDialog({ selectedMedium, username, onSuccess, onClose, onMoved, piece }: AddArtDialogProps) {
  const { token } = useAuth();
  const [allMedia, setAllMedia] = useState<MediaType[]>([]);
  const [newMedium, setNewMedium] = useState<string | null>(null);

  useEffect(() => {
    if (!piece) return;
    get_media().then(setAllMedia).catch(() => {});
  }, [piece]);

  const currentType = allMedia.find((m) => m.name === selectedMedium)?.type ?? null;
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

  // Swipe the panel down to dismiss. No inner ScrollView, so vertical
  // gestures always belong to the panel — no gesture conflict.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120) {
          Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const submit = async () => {
    if (!formData) return;
    try {
      if (isVisual2D(selectedMedium)) {
        if (piece) {
          const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
          await update_visual_2d(piece.id, token, {
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
          });
          if (moving && onMoved) onMoved(moving);
        } else {
          if (!formData.file) {
            Alert.alert('Missing', 'Please select an image.');
            return;
          }
          await add_new_visual_2d(token, {
            username,
            medium: selectedMedium,
            title: formData.title,
            location: formData.location,
            song: formData.song,
            song_artist: formData.song_artist,
            date: formData.date,
            width: formData.width,
            height: formData.height,
            keywords: formData.keywords,
            comments_enabled: formData.comments_enabled,
            file: formData.file,
          });
        }
      }
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[styles.panel, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.swipeHandle}>
            <View style={styles.swipeBar} />
          </View>
          <View style={styles.formContent}>
            {isVisual2D(selectedMedium) && (
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
          </View>
          <Pressable style={styles.submitBtn} onPress={submit}>
            <Text style={styles.submitBtnText}>{piece ? 'update' : 'submit'}</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    height: 60,
  },
  panel: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: '#000',
  },
  swipeHandle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  formContent: {
    flex: 1,
    padding: 16,
    paddingBottom: 80,
  },
  submitBtn: {
    position: 'absolute',
    bottom: 30,
    right: 16,
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
