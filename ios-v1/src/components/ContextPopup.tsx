import React from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Colors, Shadows } from '../constants/theme';

interface Props {
  visible: boolean;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

const SCREEN = Dimensions.get('window');
const DEFAULT_W = 200;
const ESTIMATED_H = 100;
const EDGE_PADDING = 8;

export default function ContextPopup({ visible, anchor, onClose, children, width = DEFAULT_W }: Props) {
  if (!anchor) return null;

  // Clamp so the popup never spills past the viewport edges.
  const left = Math.min(Math.max(anchor.x, EDGE_PADDING), SCREEN.width - width - EDGE_PADDING);
  const top = Math.min(
    Math.max(anchor.y, EDGE_PADDING),
    SCREEN.height - ESTIMATED_H - EDGE_PADDING,
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.popup, { left, top, width }]}
          // Stops backdrop press from firing when tapping inside the popup
          onStartShouldSetResponder={() => true}
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  popup: {
    position: 'absolute',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 4,
    ...Shadows.card,
  },
});
