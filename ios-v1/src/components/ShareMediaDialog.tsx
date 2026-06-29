import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Share } from 'react-native';
import { getPortfolioUrl } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface Props {
  visible: boolean;
  username: string;
  media: string[];
  onClose: () => void;
}

// Paper-plane action on one's own profile: a row per medium with a "share"
// button that shares that medium's portfolio link — same as Portfolio's share.
export default function ShareMediaDialog({ visible, username, media, onClose }: Props) {
  const shareMedium = (medium: string) => {
    const url = getPortfolioUrl(username, medium);
    Share.share({ url, message: url }).catch(() => {});
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>share a portfolio</Text>

          {media.length === 0 ? (
            <Text style={styles.empty}>no mediums to share yet</Text>
          ) : (
            <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
              {media.map((m) => (
                <View key={m} style={styles.row}>
                  <Text style={styles.rowLabel}>{m}</Text>
                  <Pressable style={styles.shareBtn} onPress={() => shareMedium(m)}>
                    <Text style={styles.shareBtnText}>share</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '80%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 24,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '500',
    marginBottom: 16,
  },
  empty: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  rows: {
    maxHeight: 320,
  },
  rowsContent: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  rowLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
  },
  shareBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  shareBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
});
