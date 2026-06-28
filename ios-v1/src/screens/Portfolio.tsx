import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useProfile } from '../hooks';
import {
  get_members_visual_2d,
  get_members_written_form,
  get_media,
  resolveImageUrl,
  getPortfolioUrl,
  thumbUrl,
  Visual2DOut,
  WrittenFormOut,
  MediaType,
} from '../api';
import ArtZoomIn from '../components/ArtZoomIn';
import WrittenFormPiece from '../components/WrittenFormPiece';
import SeriesRow from '../components/SeriesRow';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COL_WIDTH = (SCREEN_WIDTH - 48) / 2;

interface CellData {
  piece: Visual2DOut;
  aspectRatio: number;
}

export default function Portfolio() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { username, medium, keywords } = route.params || {};
  const [profile] = useProfile(username);
  const [cells, setCells] = useState<CellData[]>([]);
  const [writtenCells, setWrittenCells] = useState<WrittenFormOut[]>([]);
  const [zoomPiece, setZoomPiece] = useState<Visual2DOut | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [allMedia, setAllMedia] = useState<MediaType[]>([]);

  useEffect(() => {
    get_media().then(setAllMedia).catch(() => {});
  }, []);

  const mediumType = medium ? allMedia.find((m) => m.name === medium)?.type ?? null : null;
  const isV2d = mediumType === 'visual_2d';
  const isWritten = mediumType === 'written_form';

  useEffect(() => {
    if (!username || !medium || !mediumType) return;
    if (isV2d) {
      get_members_visual_2d(username, medium).then((data) => {
        const filtered =
          keywords && keywords.length > 0
            ? data.filter((p: Visual2DOut) => keywords.every((k: string) => p.keywords?.includes(k)))
            : data;
        // Canonical aspect ratio stored server-side at upload.
        setCells(filtered.map((piece: Visual2DOut) => ({ piece, aspectRatio: piece.aspect_ratio ?? 1 })));
      });
    } else if (isWritten) {
      get_members_written_form(username, medium).then((data) => {
        const filtered =
          keywords && keywords.length > 0
            ? data.filter((p: WrittenFormOut) => keywords.every((k: string) => p.keywords?.includes(k)))
            : data;
        setWrittenCells(filtered);
      });
    }
  }, [username, medium, mediumType, isV2d, isWritten]);

  // Masonry: distribute into 2 columns by shortest
  const [leftCol, rightCol] = React.useMemo(() => {
    const left: CellData[] = [];
    const right: CellData[] = [];
    let leftH = 0;
    let rightH = 0;
    for (const cell of cells) {
      const cellHeight = COL_WIDTH / cell.aspectRatio;
      if (leftH <= rightH) {
        left.push(cell);
        leftH += cellHeight;
      } else {
        right.push(cell);
        rightH += cellHeight;
      }
    }
    return [left, right];
  }, [cells]);

  // Same grouping as UserProfile: pieces sharing a series_id collapse into
  // one SeriesRow; standalones render as plain WrittenFormPiece.
  const writtenRows = useMemo(() => {
    type Row =
      | { kind: 'piece'; piece: WrittenFormOut }
      | { kind: 'series'; id: string; name: string; pieces: WrittenFormOut[] };
    const rows: Row[] = [];
    const seriesIndex = new Map<string, Extract<Row, { kind: 'series' }>>();
    for (const p of writtenCells) {
      if (p.series_id) {
        const existing = seriesIndex.get(p.series_id);
        if (existing) {
          existing.pieces.push(p);
        } else {
          const row: Extract<Row, { kind: 'series' }> = {
            kind: 'series',
            id: p.series_id,
            name: p.series_name ?? 'series',
            pieces: [p],
          };
          seriesIndex.set(p.series_id, row);
          rows.push(row);
        }
      } else {
        rows.push({ kind: 'piece', piece: p });
      }
    }
    return rows;
  }, [writtenCells]);

  const renderCell = (cell: CellData) => {
    const h = COL_WIDTH / cell.aspectRatio;
    const isPressed = pressedId === cell.piece.id;
    return (
      <Pressable
        key={cell.piece.id}
        style={[styles.cell, { height: h }]}
        onPress={() => setZoomPiece(cell.piece)}
        onPressIn={() => setPressedId(cell.piece.id)}
        onPressOut={() => setPressedId(null)}
      >
        <Image
          source={{ uri: resolveImageUrl(cell.piece.file_path) }}
          placeholder={{ uri: thumbUrl(cell.piece.id) }}
          transition={200}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
        {isPressed && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>{cell.piece.title}</Text>
            {!!cell.piece.date && <Text style={styles.overlayText}>{cell.piece.date}</Text>}
            {!!cell.piece.width && !!cell.piece.height && (
              <Text style={styles.overlayText}>
                {cell.piece.width}"x{cell.piece.height}"
              </Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {zoomPiece && (
        <ArtZoomIn
          isOwner={false}
          imgPath={zoomPiece.file_path}
          onClose={() => setZoomPiece(null)}
        />
      )}

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.artistName}>
            {profile ? `${profile.firstname} ${profile.lastname}` : username}
          </Text>
          <Text style={styles.headerMeta}>
            {[medium, ...(keywords || [])].filter(Boolean).join(' / ')}
          </Text>
        </View>
        <Pressable
          style={styles.shareBtn}
          onPress={() => {
            const url = getPortfolioUrl(username, medium, keywords);
            Share.share({ url, message: url });
          }}
        >
          <Text style={styles.shareBtnText}>share</Text>
        </Pressable>
        <Pressable style={styles.profileBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.profileBtnText}>profile view</Text>
        </Pressable>
      </View>

      {isWritten ? (
        <ScrollView contentContainerStyle={styles.writtenList}>
          {writtenRows.map((row) =>
            row.kind === 'piece' ? (
              <WrittenFormPiece
                key={row.piece.id}
                isOwner={false}
                piece={row.piece}
                onRemove={() => {}}
                onEdit={() => {}}
              />
            ) : (
              <SeriesRow
                key={row.id}
                isOwner={false}
                seriesId={row.id}
                seriesName={row.name}
                pieces={row.pieces}
                // Portfolio is a read-only view; never owner, so edit dialog
                // never opens — selectedMedium/username/onRefresh are no-ops.
                selectedMedium={medium ?? ''}
                username={username ?? ''}
                onRefresh={() => {}}
              />
            )
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.masonry}>
          <View style={styles.column}>{leftCol.map(renderCell)}</View>
          <View style={styles.column}>{rightCol.map(renderCell)}</View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  artistName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
  },
  headerMeta: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  profileBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  profileBtnText: {
    fontSize: FontSizes.xxs,
  },
  shareBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.accentGolden,
    marginRight: 6,
  },
  shareBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxs,
  },
  masonry: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  writtenList: {
    padding: 16,
  },
  column: {
    flex: 1,
    gap: 16,
  },
  cell: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 10,
  },
  overlayTitle: {
    color: Colors.white,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '700',
  },
  overlayText: {
    color: Colors.white,
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
});
