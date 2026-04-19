import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { add_new_visual_2d, update_visual_2d, Visual2DOut, get_media, MediaType } from '../api';
import PaintingForm from './PaintingForm';
import Dropdown from './Dropdown';
import { Colors, Fonts, FontSizes } from '../constants/theme';

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
        <View style={styles.panel}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
          <ScrollView
            style={styles.formArea}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
          </ScrollView>
          <Pressable style={styles.submitBtn} onPress={submit}>
            <Text style={styles.submitBtnText}>{piece ? 'update' : 'submit'}</Text>
          </Pressable>
        </View>
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
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    backgroundColor: Colors.mainBg,
  },
  closeBtnText: {
    fontSize: 20,
    lineHeight: 22,
  },
  formArea: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingTop: 44,
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
