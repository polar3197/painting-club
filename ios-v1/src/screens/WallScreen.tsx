import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thumbSource, imageSource, ArtResult } from '../api';
import { useAllArtFeed } from './EverythingVariants';
import { getPinnedArtId, subscribeWalls, WallType } from '../api/walls';
import { HubPagerLock } from '../context/HubPagerLock';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const PROMPT_RED = '#E30022'; // same red as the (old) bouncing-ball ring / pinned outline
const WRITING_ICON = require('../../assets/imgs/writing.png');
const MUSIC_ICON = require('../../assets/imgs/music.png');

// Broad category of a piece, defaulting a missing type to visual.
function typeOf(a: ArtResult): WallType {
  if (a.art_type === 'audio') return 'audio';
  if (a.art_type === 'written_form') return 'written_form';
  return 'visual_2d';
}

// Stable pseudo-random index so a person's "random" wall piece doesn't reshuffle
// on every render — seeded by their username so it still varies person to person.
function seededIndex(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, n);
}

type WallRow = { piece: ArtResult; pinned: boolean };

// One wall (visual / written / audio): a narrow centered column showing a single
// piece per person — the piece they pinned (outlined red, sorted to the top) or,
// by default, a stable-random one. Same column layout as the weekly prompt.
// Footer "see everything" opens the full search + grid art tab.
function Wall({ artType, title }: { artType: WallType; title: string }) {
  const nav = useNavigation<any>();
  const lockPager = useContext(HubPagerLock);
  // Safety net: the lock is cleared by touch-end, which can never arrive if
  // this unmounts mid-touch (or the app is backgrounded with a finger down).
  // A lock that outlives its toucher disables the hub's pagers for good.
  useEffect(() => () => lockPager(false), [lockPager]);
  const insets = useSafeAreaInsets();
  const { items, loaded } = useAllArtFeed('');
  const rows = useWallRows(items, artType);
  const open = (a: ArtResult) =>
    nav.navigate('UserProfile', { username: a.creator_username, artId: a.id, medium: a.medium });

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>{title}</Text>

      {!loaded && rows.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={Colors.darkerGold} /></View>
      ) : (
        <WallColumn rows={rows} onOpen={open} lockPager={lockPager} />
      )}

      <Pressable
        style={[styles.seeEverything, { marginBottom: insets.bottom + 10 }]}
        onPress={() => nav.navigate('Everything', { artType })}
      >
        <Text style={styles.seeEverythingTxt}>see everything</Text>
      </Pressable>
    </View>
  );
}

// One person per row: their pinned piece (sorted first) or a stable-random one.
function useWallRows(items: ArtResult[], artType: WallType): WallRow[] {
  const [pinsV, setPinsV] = useState(0);

  // Recompute when pins change.
  useEffect(() => subscribeWalls(() => setPinsV((n) => n + 1)), []);

  return useMemo(() => {
    const mine = items.filter((a) => typeOf(a) === artType);
    const byPerson = new Map<string, ArtResult[]>();
    for (const a of mine) {
      const arr = byPerson.get(a.creator_username) ?? [];
      arr.push(a);
      byPerson.set(a.creator_username, arr);
    }
    const out: WallRow[] = [];
    for (const [username, pieces] of byPerson) {
      const pinnedId = getPinnedArtId(username, artType);
      const pinned = pinnedId ? pieces.find((p) => p.id === pinnedId) : undefined;
      const piece = pinned ?? pieces[seededIndex(username + artType, pieces.length)];
      if (piece) out.push({ piece, pinned: !!pinned });
    }
    // Pinned people first; otherwise stable by username.
    out.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.piece.creator_username.localeCompare(b.piece.creator_username);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, artType, pinsV]);
}

function WallColumn({
  rows,
  onOpen,
  lockPager,
}: {
  rows: WallRow[];
  onOpen: (a: ArtResult) => void;
  lockPager: (locked: boolean) => void;
}) {
  return (
      <View style={styles.columnWrap}>
        <ScrollView
          style={styles.column}
          contentContainerStyle={styles.columnContent}
          showsVerticalScrollIndicator
          alwaysBounceVertical
          onTouchStart={() => lockPager(true)}
          onTouchEnd={() => lockPager(false)}
          onTouchCancel={() => lockPager(false)}
          onMomentumScrollEnd={() => lockPager(false)}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>nothing here yet</Text>
          ) : (
            rows.map(({ piece, pinned }) => (
              <Pressable key={piece.id} onPress={() => onOpen(piece)}>
                <WallTile item={piece} pinned={pinned} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
  );
}

function WallTile({ item, pinned }: { item: ArtResult; pinned: boolean }) {
  const border = pinned ? { borderColor: PROMPT_RED, borderWidth: 2 } : null;
  const t = typeOf(item);
  if (t === 'visual_2d') {
    return <Image source={thumbSource(item.id, item.file_path)} style={[styles.tile, border]} contentFit="cover" />;
  }
  if (t === 'written_form' && item.cover_image_path) {
    return <Image source={imageSource(item.cover_image_path)} style={[styles.tile, border]} contentFit="cover" />;
  }
  // written (no cover) / audio: the hand-drawn medium icon + the title.
  return (
    <View style={[styles.tile, styles.glyphTile, border]}>
      <Image source={t === 'audio' ? MUSIC_ICON : WRITING_ICON} style={styles.glyphIcon} contentFit="contain" />
      <Text style={styles.glyphTitle} numberOfLines={2}>{item.title}</Text>
    </View>
  );
}

export function VisualWall() { return <Wall artType="visual_2d" title="visual wall" />; }
export function WrittenWall() { return <Wall artType="written_form" title="written wall" />; }
export function AudioWall() { return <Wall artType="audio" title="audio wall" />; }

// The hub's "art wall" page: the written / visual / audio walls as three
// same-width columns side by side, each scrolling on its own.
const ART_WALL_COLUMNS: { artType: WallType; label: string }[] = [
  { artType: 'written_form', label: 'written' },
  { artType: 'visual_2d', label: 'visual' },
  { artType: 'audio', label: 'audio' },
];

export function ArtWall() {
  const nav = useNavigation<any>();
  const lockPager = useContext(HubPagerLock);
  // Safety net: the lock is cleared by touch-end, which can never arrive if
  // this unmounts mid-touch (or the app is backgrounded with a finger down).
  // A lock that outlives its toucher disables the hub's pagers for good.
  useEffect(() => () => lockPager(false), [lockPager]);
  const insets = useSafeAreaInsets();
  const { items, loaded } = useAllArtFeed('');
  const written = useWallRows(items, 'written_form');
  const visual = useWallRows(items, 'visual_2d');
  const audio = useWallRows(items, 'audio');
  const rowsFor = { written_form: written, visual_2d: visual, audio } as Record<WallType, WallRow[]>;
  const open = (a: ArtResult) =>
    nav.navigate('UserProfile', { username: a.creator_username, artId: a.id, medium: a.medium });

  return (
    <View style={[styles.wrap, styles.artWallWrap, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.artWallNote}>
        where artists can highlight a piece
      </Text>
      <View style={styles.artWallRow}>
        {ART_WALL_COLUMNS.map(({ artType, label }) => (
          <View key={artType} style={styles.artWallCol}>
            <Text style={styles.colLabel}>{label}</Text>
            {!loaded && rowsFor[artType].length === 0 ? (
              <View style={styles.center}><ActivityIndicator color={Colors.darkerGold} /></View>
            ) : (
              <WallColumn rows={rowsFor[artType]} onOpen={open} lockPager={lockPager} />
            )}
            {/* Sits below the scroll (which is flex: 1), so it stays pinned to
                the bottom of its column rather than scrolling with the tiles.
                Opens the full page for just this medium — ArtGridScreen filters
                and retitles itself from artType. */}
            <Pressable style={styles.colSeeAll} onPress={() => nav.navigate('Everything', { artType })}>
              <Text style={styles.colSeeAllTxt}>see all</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Pressable
        style={[styles.seeEverything, styles.seeEverythingWall, { marginBottom: insets.bottom + 4 }]}
        onPress={() => nav.navigate('Everything', {})}
      >
        <Text style={styles.seeEverythingTxt}>see everything</Text>
      </Pressable>
    </View>
  );
}

const TILE = 108;
// Side inset shared by the art wall's column row and its "see everything"
// button, so the three column buttons span EXACTLY the same width as the one
// below them. Deliberately small: three 120pt columns leave only ~30pt of
// slack on a 390pt screen, and every point given to this inset is taken from
// the gaps between the buttons.
const WALL_EDGE = 4;
// Gap between a column's top/bottom rule and where its tiles are cut off.
const COLUMN_INSET = 6;
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.mainBg, alignItems: 'center', paddingHorizontal: 24 },
  title: { fontFamily: Fonts.serif, fontSize: FontSizes.xl, color: Colors.black, textAlign: 'center', marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textMuted, marginTop: 24 },
  columnWrap: {
    flex: 1,
    width: TILE + 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.22)',
    // The inset that keeps the tiles off the rules. The scroll view lives
    // inside this padding and clips hard at its own bounds, so a tile vanishes
    // COLUMN_INSET points short of the line rather than touching it — a clean
    // cut, not a fade.
    paddingVertical: COLUMN_INSET,
  },
  column: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  columnContent: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  tile: { width: TILE, height: TILE, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary },
  glyphTile: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  glyphIcon: { width: 40, height: 40 },
  glyphTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.black, textAlign: 'center', marginTop: 4 },
  seeEverything: {
    borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.primaryGold,
    paddingHorizontal: 22, paddingVertical: 11, alignItems: 'center', marginTop: 10,
  },
  seeEverythingTxt: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.black },
  artWallWrap: { paddingHorizontal: 0 },
  // Explains what the wall is, above the columns.
  artWallNote: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.black,
    textAlign: 'center',
    paddingHorizontal: 16,
    // The extra space here is what drops the columns (and with them the
    // full-width button below) further down the page.
    marginBottom: 18,
  },
  // Pinned to the bottom of each column; stretches to the column's width.
  colSeeAll: {
    alignSelf: 'stretch',
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.black,
    // The same tan as the tiles (Colors.secondary). The gold read as loud
    // against a wall of cards — three saturated blocks plus the wide one below
    // crowded the columns they belong to.
    backgroundColor: Colors.secondary,
    paddingVertical: 5,
    alignItems: 'center',
  },
  colSeeAllTxt: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.black },
  // On the wall the everything button spans the page; alignSelf beats the
  // wrap's alignItems: 'center', which otherwise shrinks it to its label.
  // Matches the column row's span exactly (same WALL_EDGE), so the three
  // column buttons add up to this one. The tan override is local to the art
  // wall: `seeEverything` is shared with the per-medium wall screens, which
  // Charlie hasn't looked at, so it keeps its gold there.
  seeEverythingWall: {
    alignSelf: 'stretch',
    marginHorizontal: WALL_EDGE,
    backgroundColor: Colors.secondary,
  },
  artWallRow: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    // space-between, not space-evenly: evenly also spends slack on the two
    // OUTER margins, so the columns never lined up with the button below and
    // the gaps between them were half what they could be.
    justifyContent: 'space-between',
    paddingHorizontal: WALL_EDGE,
  },
  artWallCol: { flex: 0, alignItems: 'center' },
  colLabel: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1, color: Colors.black, marginBottom: 6 },
});
