import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Image } from 'expo-image';
import { remove_written_form, imageSource, WrittenFormOut, WrittenFormat } from '../api';
import { extFromPath, isTextExt, useWrittenFormText } from '../hooks';
import WrittenFormZoomIn from './WrittenFormZoomIn';
import AddArtDialog from './AddArtDialog';
import BookmarkButton from './BookmarkButton';
import ConfirmDialog from './ConfirmDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const THUMB_PREVIEW_LINES = 12;
const GRID_COLS = 2;
const GRID_GAP = 14;
const SCREEN_PADDING = 16;

function previewSnippet(text: string | null): string {
  if (text == null) return '';
  return text.split(/\r?\n/).slice(0, THUMB_PREVIEW_LINES).join('\n');
}

interface ThumbCellProps {
  piece: WrittenFormOut;
  cellW: number;
  cellH: number;
  isOwner: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function ThumbCell({ piece, cellW, cellH, isOwner, onOpen, onEdit, onRemove }: ThumbCellProps) {
  const ext = extFromPath(piece.file_path);
  const text = useWrittenFormText(piece.file_path);
  const snippet = previewSnippet(text);
  const isText = isTextExt(ext);

  return (
    <View style={{ width: cellW }}>
      <Pressable
        style={({ pressed }) => [styles.tile, { width: cellW, height: cellH }, pressed && { opacity: 0.92 }]}
        onPress={onOpen}
      >
        {piece.cover_image_path ? (
          <Image
            source={imageSource(piece.cover_image_path)}
            style={styles.tileCover}
            contentFit="cover"
          />
        ) : isText && snippet ? (
          <Text style={styles.tileSnippet} numberOfLines={THUMB_PREVIEW_LINES}>{snippet}</Text>
        ) : (
          <Text style={styles.tileTitleFallback} numberOfLines={4}>{piece.title}</Text>
        )}
      </Pressable>
      <Text style={styles.cellTitle} numberOfLines={2}>{piece.title}</Text>
      <View style={styles.cellFooter}>
        {isOwner && (
          <View style={styles.cellButtons}>
            <Pressable style={[styles.btn, styles.editBtn]} onPress={onEdit}>
              <Text style={styles.btnText}>edit</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.removeBtn]} onPress={onRemove}>
              <Text style={styles.btnText}>remove</Text>
            </Pressable>
          </View>
        )}
        <BookmarkButton artId={piece.id} size={24} style={styles.cellBookmarkBtn} />
      </View>
    </View>
  );
}

interface SeriesZoomInProps {
  isOwner: boolean;
  seriesName: string;
  pieces: WrittenFormOut[];
  // Needed so the in-gallery edit dialog can call the same update path as
  // edits initiated from the profile screen.
  selectedMedium: string;
  username: string;
  // The tab's short/long form, forwarded to the in-gallery reader.
  writtenFormat?: WrittenFormat | null;
  onClose: () => void;
  // Signal to the parent to refetch written-form pieces (after add/edit/remove).
  // The fresh pieces flow back down via the `pieces` prop, so the gallery
  // re-renders with current data without holding a copy locally.
  onRefresh: () => void;
  // When a piece is edited into a different medium, route the new medium
  // up so the profile switches tabs.
  onMediumMove?: (newMedium: string) => void;
}

export default function SeriesZoomIn({
  isOwner,
  seriesName,
  pieces,
  selectedMedium,
  username,
  writtenFormat,
  onClose,
  onRefresh,
  onMediumMove,
}: SeriesZoomInProps) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const [focused, setFocused] = useState<WrittenFormOut | null>(null);
  const [pendingRemove, setPendingRemove] = useState<WrittenFormOut | null>(null);
  // Editing happens INSIDE the gallery modal so the user stays in the
  // gallery context across the edit. Two RN modals can stack (outer
  // fullScreen, inner transparent slide-up) without unmounting each other.
  const [editingPiece, setEditingPiece] = useState<WrittenFormOut | null>(null);

  // Two-column grid sized to screen width: subtract horizontal padding and
  // the gap between cells, divide by column count. Letter-paper aspect on
  // the tile (88:108 ratio matches the WrittenFormPiece thumbnail).
  const usableW = screenW - SCREEN_PADDING * 2;
  const cellW = (usableW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = Math.round(cellW * (108 / 84));

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await remove_written_form(pendingRemove.id, token);
    setPendingRemove(null);
    onRefresh();
    // If the removed piece was the last in the series, the parent will close
    // us on next render; we don't try to predict it here.
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      {/* Render the reader as a nested Modal ON TOP of the gallery instead
          of early-returning it in place of the gallery — same pattern as
          the edit dialog above. Tapping a piece slides the reader up over
          the still-mounted grid; closing the reader returns to the grid
          with no remount, so the gallery doesn't flash off-screen between
          transitions. */}
      {focused && (
        <WrittenFormZoomIn
          title={focused.title}
          filePath={focused.file_path}
          format={writtenFormat}
          onClose={() => setFocused(null)}
        />
      )}
      <View style={[styles.sheet, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{seriesName}</Text>
          <Pressable
            style={({ pressed }) => [styles.xBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={styles.xBtnText}>×</Text>
          </Pressable>
        </View>
        <ConfirmDialog
          visible={!!pendingRemove}
          title="u sure?"
          confirmLabel="yes"
          cancelLabel="no. shit. stop"
          confirmColor={Colors.redLight}
          cancelColor={Colors.greenBright}
          confirmTextColor={Colors.black}
          cancelTextColor={Colors.black}
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
        {editingPiece && (
          // AddArtDialog is itself a transparent slide-up Modal. Mounting it
          // INSIDE this fullScreen modal keeps the gallery alive underneath
          // — when the user submits/cancels the edit, the dialog closes and
          // they're right back where they were in the grid.
          <AddArtDialog
            selectedMedium={selectedMedium}
            username={username}
            writtenPiece={editingPiece}
            onSuccess={onRefresh}
            onClose={() => setEditingPiece(null)}
            onMoved={onMediumMove}
          />
        )}
        <ScrollView contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {pieces.map((p, i) => (
              <View
                key={p.id}
                style={{
                  // Manual right margin between columns instead of `gap`
                  // (better RN < 0.71 compatibility, harmless on newer).
                  marginRight: (i + 1) % GRID_COLS === 0 ? 0 : GRID_GAP,
                  marginBottom: GRID_GAP,
                }}
              >
                <ThumbCell
                  piece={p}
                  cellW={cellW}
                  cellH={cellH}
                  isOwner={isOwner}
                  onOpen={() => setFocused(p)}
                  onEdit={() => setEditingPiece(p)}
                  onRemove={() => setPendingRemove(p)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: SCREEN_PADDING,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  title: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  xBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 20,
    color: Colors.black,
  },
  gridContent: {
    paddingTop: 14,
    paddingBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 8,
    overflow: 'hidden',
    marginBottom: 6,
  },
  tileSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 9,
    lineHeight: 11,
    color: Colors.black,
  },
  // Cover image fills the tile frame edge-to-edge (cancel the tile padding).
  tileCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tileTitleFallback: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
  },
  cellTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  cellFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cellBookmarkBtn: {
    marginLeft: 'auto',
  },
  cellButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
  },
  editBtn: { backgroundColor: Colors.secondary },
  removeBtn: { backgroundColor: Colors.secondary },
});
