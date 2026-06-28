import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { upload_profile_picture, get_profile } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

// Global one-time "welcome, add a profile pic" prompt for users who just
// finished SetupAccount. The visibility flag lives on AuthContext so any
// screen (or App.tsx) can render the modal — kept here so App.tsx stays
// thin and the upload logic doesn't leak into the navigator.

export default function ProfilePicPromptModal() {
  const {
    needsProfilePicPrompt,
    dismissProfilePicPrompt,
    token,
    currentUser,
    bumpProfilePic,
  } = useAuth();
  const [uploading, setUploading] = useState(false);

  if (!needsProfilePicPrompt) return null;

  const pickAndUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() || 'pic.jpg';
      const type = asset.mimeType || 'image/jpeg';
      setUploading(true);
      await upload_profile_picture({ uri: asset.uri, name, type }, token);
      // Bump the cache so any already-mounted profile view (UserProfile)
      // re-pulls the canonical /static/profile/<id>.<ext> URL — without this
      // the user lands on Main with a stale empty-pic state.
      if (currentUser) {
        try {
          const profile = await get_profile(currentUser, token);
          bumpProfilePic(profile.id);
        } catch {
          // non-fatal: pic uploaded; UserProfile will refetch on next focus
        }
      }
      dismissProfilePicPrompt();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Try again');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={dismissProfilePicPrompt}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissProfilePicPrompt}
        />
        <View style={styles.panel}>
          <Pressable
            style={({ pressed }) => [styles.xBtn, pressed && { opacity: 0.7 }]}
            onPress={dismissProfilePicPrompt}
            hitSlop={8}
            disabled={uploading}
          >
            <Text style={styles.xBtnText}>×</Text>
          </Pressable>
          <Text style={styles.heading}>welcome!</Text>
          <Text style={styles.body}>
            wanna add a profile picture? you can always do this later from your
            profile.
          </Text>
          <Pressable
            style={[styles.uploadBtn, uploading && { opacity: 0.5 }]}
            onPress={pickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.uploadBtnText}>choose photo</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  panel: {
    width: '100%',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingTop: 30,
    paddingBottom: 24,
    paddingHorizontal: 24,
    ...Shadows.card,
  },
  xBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 20,
    color: Colors.black,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  body: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  uploadBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: Colors.greenBright,
  },
  uploadBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
});
