import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Image as RNImage,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useProfile } from '../hooks';
import { get_members_visual_2d, resolveImageUrl, getPortfolioUrl, thumbUrl, Visual2DOut } from '../api';
import ArtZoomIn from '../components/ArtZoomIn';
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
  const [zoomPiece, setZoomPiece] = useState<Visual2DOut | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !medium) return;
    get_members_visual_2d(username, medium).then(async (data) => {
      const filtered =
        keywords && keywords.length > 0
          ? data.filter((p: Visual2DOut) => keywords.every((k: string) => p.keywords?.includes(k)))
          : data;

      const resolved = await Promise.all(
        filtered.map(
          (piece: Visual2DOut) =>
            new Promise<CellData>((resolve) => {
              // Measure off the thumb since it paints first and has the same aspect ratio.
              const uri = thumbUrl(piece.id);
              RNImage.getSize(
                uri,
                (w, h) => resolve({ piece, aspectRatio: h > 0 ? w / h : 1 }),
                () => resolve({ piece, aspectRatio: 1 })
              );
            })
        )
      );
      setCells(resolved);
    });
  }, [username, medium]);

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

      <ScrollView contentContainerStyle={styles.masonry}>
        <View style={styles.column}>{leftCol.map(renderCell)}</View>
        <View style={styles.column}>{rightCol.map(renderCell)}</View>
      </ScrollView>
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
