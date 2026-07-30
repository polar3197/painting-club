import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { WrittenFormOut, WrittenFormat, imageSource } from '../api';
import { extFromPath, isTextExt, useWrittenFormText } from '../hooks';
import SeriesZoomIn from './SeriesZoomIn';
import BookmarkButton from './BookmarkButton';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const THUMB_PREVIEW_LINES = 6;

function previewSnippet(text: string | null): string {
  if (text == null) return '';
  return text.split(/\r?\n/).slice(0, THUMB_PREVIEW_LINES).join('\n');
}

// Sort pieces oldest-first so the most recent piece sits on top of the stack
// (rendered last visually). Mirrors the webapp CollectionRow ordering.
function sortPieces(pieces: WrittenFormOut[]): WrittenFormOut[] {
  return [...pieces].sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    if (ad === bd) return 0;
    return ad < bd ? -1 : 1;
  });
}

interface SeriesRowProps {
  isOwner: boolean;
  pieces: WrittenFormOut[];
  seriesId: string;
  seriesName: string;
  // Threaded through to the gallery's in-modal edit dialog. Editing now
  // happens inside SeriesZoomIn (so the gallery stays open underneath the
  // edit sheet) — these props are what the dialog needs to function.
  selectedMedium: string;
  username: string;
  // The tab's short/long form, forwarded through the gallery to the reader.
  writtenFormat?: WrittenFormat | null;
  onRefresh: () => void;
  onMediumMove?: (newMedium: string) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  // Set by the profile when a gallery tap landed on a piece inside this series:
  // opens the collection automatically once the row has scrolled into view.
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

export default function SeriesRow({
  isOwner,
  pieces,
  seriesId,
  seriesName,
  selectedMedium,
  username,
  writtenFormat,
  onRefresh,
  onMediumMove,
  onLayout,
  autoOpen,
  onAutoOpened,
}: SeriesRowProps) {
  const ordered = sortPieces(pieces);
  const topPiece = ordered[ordered.length - 1] ?? pieces[0];
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Open the collection when the profile requests it (deep-link from the search
  // gallery). Cleared via onAutoOpened so it fires once, not on every render.
  useEffect(() => {
    if (autoOpen) {
      setIsZoomedIn(true);
      onAutoOpened?.();
    }
  }, [autoOpen]);

  const ext = extFromPath(topPiece.file_path);
  const textContent = useWrittenFormText(topPiece.file_path);
  const snippet = previewSnippet(textContent);
  const isText = isTextExt(ext);

  // Up to 3 paper-layer offsets behind the top piece, alternating tilt to
  // read as fanned rather than curved (matches CollectionRow.tsx:81-92).
  const stackLayers = Math.min(ordered.length, 3);
  const backLayerCount = stackLayers - 1;

  return (
    <>
      {isZoomedIn && (
        <SeriesZoomIn
          isOwner={isOwner}
          seriesName={seriesName}
          pieces={ordered}
          selectedMedium={selectedMedium}
          username={username}
          writtenFormat={writtenFormat}
          onClose={() => setIsZoomedIn(false)}
          onRefresh={onRefresh}
          onMediumMove={onMediumMove}
        />
      )}
      <View style={styles.element} onLayout={onLayout}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.95 }]}
          onPress={() => setIsZoomedIn(true)}
        >
          <View style={styles.stack}>
            {Array.from({ length: backLayerCount }).map((_, i) => {
              const depth = backLayerCount - i; // 1..N, 1 = closest to top
              const angle = depth === 1 ? 4 : depth === 2 ? -5 : 6;
              return (
                <View
                  key={depth}
                  style={[
                    styles.stackLayer,
                    { transform: [{ rotate: `${angle}deg` }] },
                  ]}
                />
              );
            })}
            <View style={styles.stackTop}>
              {topPiece.cover_image_path ? (
                <Image
                  source={imageSource(topPiece.cover_image_path)}
                  style={styles.thumbCover}
                  contentFit="cover"
                />
              ) : isText && snippet ? (
                <Text style={styles.thumbSnippet} numberOfLines={THUMB_PREVIEW_LINES}>
                  {snippet}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.details}>
            <Text style={styles.seriesTitle} numberOfLines={2}>{seriesName}</Text>
            <Text style={styles.detailText}>
              {ordered.length} piece{ordered.length === 1 ? '' : 's'}
            </Text>
            {/* Collection-level save: bookmarks every piece in the series. */}
            <BookmarkButton
              artIds={ordered.map((p) => p.id)}
              size={30}
              style={styles.seriesBookmarkBtn}
            />
          </View>
        </Pressable>
      </View>
    </>
  );
}

// Same portrait page proportions as WrittenFormPiece.
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
    alignItems: 'flex-start',
    gap: 12,
  },
  stack: {
    width: THUMB_W,
    height: THUMB_H,
    // The back layers stay within the row's footprint by rotating instead of
    // translating, so we don't need extra width here for them to peek out.
    position: 'relative',
  },
  stackLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: THUMB_W,
    height: THUMB_H,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
  },
  stackTop: {
    width: THUMB_W,
    height: THUMB_H,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 6,
    overflow: 'hidden',
  },
  thumbSnippet: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    lineHeight: 10,
    color: Colors.black,
  },
  // Cover image fills the page frame edge-to-edge (cancel the top padding).
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
    gap: 4,
  },
  seriesBookmarkBtn: {
    marginTop: 8,
  },
  seriesTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  detailText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});
