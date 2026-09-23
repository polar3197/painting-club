import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { remove_written_form, imageSource, WrittenFormOut, WrittenFormat } from '../api';
import { extFromPath, isTextExt, useWrittenFormText } from '../hooks';
import WrittenFormZoomIn from './WrittenFormZoomIn';
import BookmarkButton from './BookmarkButton';
import ConfirmDialog from './ConfirmDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const THUMB_PREVIEW_LINES = 6;

function previewSnippet(text: string | null): string {
  if (text == null) return '';
  return text.split(/\r?\n/).slice(0, THUMB_PREVIEW_LINES).join('\n');
}

interface WrittenFormPieceProps {
  isOwner: boolean;
  piece: WrittenFormOut;
  // The tab's short/long form, forwarded to the reader (null → long).
  writtenFormat?: WrittenFormat | null;
  onRemove: () => void;
  onEdit: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

export default function WrittenFormPiece({
  isOwner,
  piece,
  writtenFormat,
  onRemove,
  onEdit,
  onLayout,
}: WrittenFormPieceProps) {
  const { token } = useAuth();
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const ext = extFromPath(piece.file_path);
  const textContent = useWrittenFormText(piece.file_path);
  const snippet = previewSnippet(textContent);
  const isText = isTextExt(ext);

  const removeArt = async () => {
    await remove_written_form(piece.id, token);
    setShowRemoveConfirm(false);
    onRemove();
  };

  return (
    <>
      <ConfirmDialog
        visible={showRemoveConfirm}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={removeArt}
        onCancel={() => setShowRemoveConfirm(false)}
      />
      {isZoomedIn && (
        <WrittenFormZoomIn
          title={piece.title}
          filePath={piece.file_path}
          format={writtenFormat}
          onClose={() => setIsZoomedIn(false)}
        />
      )}
      <View style={styles.element} onLayout={onLayout}>
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.92 }]}
            onPress={() => setIsZoomedIn(true)}
          >
            {piece.cover_image_path ? (
              <Image
                source={imageSource(piece.cover_image_path)}
                style={styles.thumbCover}
                contentFit="cover"
              />
            ) : isText && snippet ? (
              <Text style={styles.thumbSnippet} numberOfLines={THUMB_PREVIEW_LINES}>{snippet}</Text>
            ) : null}
          </Pressable>
          <View style={styles.details}>
            <Text style={styles.artTitle} numberOfLines={2}>{piece.title}</Text>
            {!!piece.date && <Text style={styles.detailText}>{piece.date}</Text>}
            {/* Keywords readout temporarily hidden — restore by removing the
                `false &&` guard. */}
            {false && piece.keywords && piece.keywords.length > 0 && (
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>keywords: </Text>
                {piece.keywords.join(', ')}
              </Text>
            )}
            {!!piece.series_name && (
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>series: </Text>
                {piece.series_name}
              </Text>
            )}
            {/* Bookmark pinned to the right of the footer, always present; the
                owner's remove/edit buttons sit to its left. */}
            <View style={styles.footerRow}>
              {isOwner && (
                <View style={styles.buttons}>
                  <Pressable style={[styles.btn, styles.removeBtn]} onPress={() => setShowRemoveConfirm(true)}>
                    <Text style={styles.btnText}>remove</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.editBtn]} onPress={onEdit}>
                    <Text style={styles.btnText}>edit</Text>
                  </Pressable>
                </View>
              )}
              <BookmarkButton artId={piece.id} size={30} style={styles.bookmarkBtn} />
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

// Portrait page-ish proportions (~8.5x11 letter ratio).
const THUMB_W = 84;
const THUMB_H = 108;

const styles = StyleSheet.create({
  element: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    // Default alignItems (stretch) so the details column matches the
    // thumbnail's height — that's what lets buttons in the column push to
    // the bottom via marginTop: 'auto'.
    gap: 12,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  thumbSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    lineHeight: 10,
    color: Colors.black,
  },
  // Cover image fills the page frame edge-to-edge (cancel the thumb padding).
  thumbCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  details: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  artTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  detailText: {
    fontSize: FontSizes.xs,
    textAlign: 'left',
  },
  detailLabel: {
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
    alignSelf: 'stretch',
  },
  buttons: {
    flexDirection: 'row',
    gap: 6,
  },
  bookmarkBtn: {
    marginLeft: 'auto',
  },
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  editBtn: { backgroundColor: Colors.secondary },
  removeBtn: { backgroundColor: Colors.secondary },
});
