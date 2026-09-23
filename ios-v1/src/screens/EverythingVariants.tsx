import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, Modal, Pressable, StyleSheet, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Fuse from 'fuse.js';
import {
  search_art, get_media, get_members, get_members_written_form, get_members_audio,
  thumbSource, displaySource, imageSource, ArtResult, MediaType, Profile,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavPref } from '../context/NavPrefContext';
import ArtGallery from './ArtGallery';
import ArtCarousel from '../components/ArtCarousel';
import ArtComments from '../components/ArtComments';
import { readCached, writeCached } from '../utils/jsonCache';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const ART_KEYS = ['title', 'medium', 'song', 'creator_username', 'location', 'keywords'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MUSIC_ICON = require('../../assets/imgs/music.png');
const WRITING_ICON = require('../../assets/imgs/writing.png');
const COMMENT_ICON = require('../../assets/imgs/comment-bubble.png');

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  const now = new Date().getFullYear();
  return `${MONTHS[m - 1]} ${d}${y && y !== now ? ` '${String(y).slice(2)}` : ''}`;
}
function mediumLabel(a: ArtResult): string {
  const kind = a.art_type === 'audio' ? 'audio' : a.art_type === 'written_form' ? 'writing' : 'visual';
  return a.medium || kind;
}

// Fan out writing + audio the way the shipped gallery fans out writing — this
// is what brings AUDIO into the feed (the shipped gallery only merges written).
async function fetchWrittenAndAudio(token: string | null): Promise<ArtResult[]> {
  const [media, members] = await Promise.all([
    get_media().catch(() => [] as MediaType[]),
    get_members('', '', token).catch(() => [] as Profile[]),
  ]);
  const writtenMedia = new Set(media.filter((m) => m.type === 'written_form').map((m) => m.name));
  const audioMedia = new Set(media.filter((m) => m.type === 'audio').map((m) => m.name));
  const jobs: Promise<ArtResult[]>[] = [];
  for (const member of members) {
    for (const medium of member.media ?? []) {
      if (writtenMedia.has(medium)) {
        jobs.push(get_members_written_form(member.username, medium).then((ps) => ps.map((p): ArtResult => ({
          id: p.id, title: p.title, medium, art_type: 'written_form', keywords: p.keywords ?? [],
          song: null, file_path: p.file_path, date: p.date, location: null,
          creator_username: member.username, creator_city: member.city ?? null, aspect_ratio: null,
          cover_image_path: p.cover_image_path ?? null,
        }))).catch(() => [] as ArtResult[]));
      } else if (audioMedia.has(medium)) {
        jobs.push(get_members_audio(member.username, medium).then((ps) => ps.map((p): ArtResult => ({
          id: p.id, title: p.title, medium, art_type: 'audio', keywords: p.keywords ?? [],
          song: p.artist ?? p.series_name ?? null, file_path: p.file_path, date: p.date, location: null,
          creator_username: member.username, creator_city: member.city ?? null, aspect_ratio: null,
          cover_image_path: null,
        }))).catch(() => [] as ArtResult[]));
      }
    }
  }
  return (await Promise.all(jobs)).flat();
}

// Module-level cache so switching feed styles (or grid↔feed) reuses the already-
// fetched data instantly and only refreshes in the background — the slow
// per-member fan-out runs once, not once per view.
// Seeded from the last launch's copy on disk so the walls paint immediately
// (and while the Pi is unreachable); the *Fresh flags track whether this
// session has fetched yet, so the seeded copy still gets refreshed once.
const _cache: { visual: ArtResult[]; extra: ArtResult[] } = {
  visual: readCached<ArtResult[]>('feed:visual') ?? [],
  extra: readCached<ArtResult[]>('feed:extra') ?? [],
};
let _cacheReady = _cache.visual.length > 0;
let _visualFresh = false;
let _extraFresh = false;

// One shared in-flight fetch per source, so mounting all three walls (plus the
// everything page) triggers the expensive per-member written/audio fan-out ONCE
// total instead of once per view per mount. Cleared once settled: a populated
// cache short-circuits future calls; a failed/empty one is allowed to retry.
let _visualInFlight: Promise<ArtResult[]> | null = null;
let _extraInFlight: Promise<ArtResult[]> | null = null;

function loadVisualOnce(): Promise<ArtResult[]> {
  if (_visualFresh) return Promise.resolve(_cache.visual);
  if (!_visualInFlight) {
    _visualInFlight = search_art('')
      .then((v) => {
        _cache.visual = v; _cacheReady = true; _visualFresh = true;
        writeCached('feed:visual', v);
        return v;
      })
      .catch(() => _cache.visual)
      .finally(() => { _visualInFlight = null; });
  }
  return _visualInFlight;
}

function loadExtraOnce(token: string | null): Promise<ArtResult[]> {
  if (_extraFresh) return Promise.resolve(_cache.extra);
  if (!_extraInFlight) {
    _extraInFlight = fetchWrittenAndAudio(token)
      .then((e) => {
        _cache.extra = e; _extraFresh = true;
        writeCached('feed:extra', e);
        return e;
      })
      .catch(() => _cache.extra)
      .finally(() => { _extraInFlight = null; });
  }
  return _extraInFlight;
}

export function useAllArtFeed(query: string) {
  const { token } = useAuth();
  const [visual, setVisual] = useState<ArtResult[]>(_cache.visual);
  const [extra, setExtra] = useState<ArtResult[]>(_cache.extra);
  const [loaded, setLoaded] = useState(_cacheReady);
  useEffect(() => {
    let alive = true;
    loadVisualOnce().then((v) => {
      if (!alive) return;
      setVisual(v); setLoaded(true);
    }).finally(() => { if (alive) setLoaded(true); });
    loadExtraOnce(token).then((e) => {
      if (!alive) return;
      setExtra(e);
    });
    return () => { alive = false; };
  }, [token]);
  const merged = useMemo(() => {
    const byId = new Map<string, ArtResult>();
    for (const a of visual) byId.set(a.id, a);
    for (const a of extra) if (!byId.has(a.id)) byId.set(a.id, a);
    return Array.from(byId.values()).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [visual, extra]);
  const fuse = useMemo(() => new Fuse(merged, { keys: ART_KEYS, threshold: 0.4 }), [merged]);
  const items = useMemo(() => (query.trim() ? fuse.search(query).map((r) => r.item) : merged), [query, fuse, merged]);
  return { items, loaded };
}

type Props = {
  query: string;
  onResetFilters: () => void;
  onListScroll: () => void;
  onVerticalScroll: (offsetY: number) => void;
};

function useOpen() {
  const nav = useNavigation<any>();
  return (a: ArtResult) => nav.navigate('UserProfile', { username: a.creator_username, artId: a.id, medium: a.medium });
}
function onScrollProp(onVerticalScroll: (n: number) => void) {
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => onVerticalScroll(e.nativeEvent.contentOffset.y);
}
function isVisual(a: ArtResult) { return a.art_type === 'visual_2d' || !a.art_type; }

function Thumb({ item, style }: { item: ArtResult; style: any }) {
  if (isVisual(item)) return <Image source={thumbSource(item.id, item.file_path)} style={style} contentFit="cover" />;
  if (item.art_type === 'written_form' && item.cover_image_path) return <Image source={imageSource(item.cover_image_path)} style={style} contentFit="cover" />;
  // Written (no cover) and audio get the same treatment as the art wall's
  // tiles: the hand-drawn medium icon AND the title. Audio previously showed
  // the icon but no title, and written fell back to a "¶" character rather
  // than the drawn icon, so the see-all pages read as poorer than the wall
  // they were opened from.
  return (
    <View style={[style, styles.glyphBox, item.art_type === 'audio' ? styles.audioBox : styles.paperBox]}>
      <Image
        source={item.art_type === 'audio' ? MUSIC_ICON : WRITING_ICON}
        style={styles.iconSm}
        contentFit="contain"
      />
      <Text style={styles.glyphTitle} numberOfLines={2}>{item.title}</Text>
    </View>
  );
}

// Full-bleed image at true aspect ratio; ~1600px display source, thumb fallback.
function FeedImage({ item, width }: { item: ArtResult; width: number }) {
  const [failed, setFailed] = useState(false);
  const ar = item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
  const src = failed ? thumbSource(item.id, item.file_path) : displaySource(item.id, item.file_path);
  return <Image source={src} style={{ width, height: Math.round(width / ar), backgroundColor: Colors.secondary }} contentFit="cover" onError={() => setFailed(true)} />;
}

function EndMark({ n }: { n: number }) { return n === 0 ? null : <Text style={styles.endMark}>·  ·  ·</Text>; }
function Empty({ loaded }: { loaded: boolean }) { return <Text style={styles.empty}>{loaded ? 'nothing here yet' : 'loading…'}</Text>; }

// ── WEB: the phone-webapp two-column card grid, borders and all ────────────
const WEB_GAP = 10;
const WEB_PAD = 12;
const WEB_W = (SCREEN_W - WEB_PAD * 2 - WEB_GAP) / 2;
function FeedWeb({ query, onVerticalScroll }: Props) {
  const { items, loaded } = useAllArtFeed(query);
  const open = useOpen();
  return (
    <FlatList
      data={items}
      key="web"
      numColumns={2}
      keyExtractor={(a) => a.id}
      columnWrapperStyle={{ gap: WEB_GAP, paddingHorizontal: WEB_PAD }}
      contentContainerStyle={{ gap: WEB_GAP, paddingVertical: 12 }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScrollProp(onVerticalScroll)}
      ListEmptyComponent={<Empty loaded={loaded} />}
      ListFooterComponent={<EndMark n={items.length} />}
      renderItem={({ item }) => (
        <Pressable style={styles.webCard} onPress={() => open(item)}>
          <Thumb item={item} style={styles.webImg} />
          <View style={styles.webDeets}>
            <Text style={styles.webTitle} numberOfLines={1}>{item.title || 'untitled'}</Text>
            <Text style={styles.webMedium} numberOfLines={1}>{mediumLabel(item)}</Text>
            <Text style={styles.webCreator} numberOfLines={1}>@{item.creator_username}</Text>
            {item.location ? <Text style={styles.webDetail} numberOfLines={1}>{item.location}</Text> : null}
            {item.keywords && item.keywords.length > 0 ? <Text style={styles.webDetail} numberOfLines={1}>{item.keywords.join(', ')}</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}

// ── INSTA: single-column, image-dominated, crisp black frame per piece ────
const INSTA_PAD = 28;
const INSTA_W = SCREEN_W - INSTA_PAD * 2 - 2;
function FeedInsta({ query, onVerticalScroll }: Props) {
  const { items, loaded } = useAllArtFeed(query);
  const open = useOpen();
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [commentItem, setCommentItem] = useState<ArtResult | null>(null);
  // Zoom only pages through the visual pieces (the carousel is image-only).
  const visualItems = useMemo(() => items.filter(isVisual), [items]);
  const onTap = (item: ArtResult) => {
    if (isVisual(item)) {
      const idx = visualItems.findIndex((v) => v.id === item.id);
      if (idx >= 0) setZoomIndex(idx);
    } else {
      open(item);
    }
  };
  return (
    <View style={styles.fill}>
      <FlatList
        data={items}
        key="insta"
        keyExtractor={(a) => a.id}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScrollProp(onVerticalScroll)}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Empty loaded={loaded} />}
        ListFooterComponent={<EndMark n={items.length} />}
        renderItem={({ item }) => (
          <Pressable style={styles.instaItem} onPress={() => onTap(item)}>
            <View style={styles.instaUnit}>
              <View style={styles.instaHead}>
                <Text style={styles.instaUser}>@{item.creator_username}</Text>
                <Text style={styles.instaDate}>{fmtDate(item.date)}</Text>
              </View>
              {isVisual(item) ? (
                <FeedImage item={item} width={INSTA_W} />
              ) : item.art_type === 'written_form' && item.cover_image_path ? (
                <Image source={imageSource(item.cover_image_path)} style={{ width: INSTA_W, height: INSTA_W }} contentFit="cover" />
              ) : item.art_type === 'written_form' ? (
                <View style={styles.instaPaper}><Text style={styles.instaPaperText} numberOfLines={5}>{item.title || 'untitled'}</Text></View>
              ) : (
                <View style={styles.instaAudio}>
                  <Image source={MUSIC_ICON} style={styles.instaAudioIcon} contentFit="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.instaAudioTitle} numberOfLines={1}>{item.title || 'untitled'}</Text>
                    {item.song ? <Text style={styles.instaAudioArtist} numberOfLines={1}>{item.song}</Text> : null}
                  </View>
                </View>
              )}
              <View style={styles.instaCaption}>
                <Text style={styles.instaCapText} numberOfLines={2}>{item.title || 'untitled'}</Text>
                <Pressable style={styles.instaCommentBtn} hitSlop={8} onPress={() => setCommentItem(item)}>
                  <Image source={COMMENT_ICON} style={styles.instaCommentIcon} contentFit="contain" />
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      />
      {zoomIndex !== null && visualItems[zoomIndex] && (
        <ArtCarousel
          pieces={visualItems}
          initialIndex={zoomIndex}
          isOwner={false}
          creatorUsername=""
          captions={visualItems.map((s) => ({ title: s.title, creator: s.creator_username }))}
          hideKebab
          onClose={() => setZoomIndex(null)}
        />
      )}
      {commentItem && (
        <ArtComments piece={commentItem as any} onClose={() => setCommentItem(null)} />
      )}
    </View>
  );
}

// ── Art-browse prototypes: pick a medium, browse art from that angle ───────
// Four contributor-only designs (Settings → art browse). All share the module-
// cached feed data and the media list.
function useMedia() {
  const [media, setMedia] = useState<MediaType[]>([]);
  useEffect(() => {
    let alive = true;
    get_media().then((m) => { if (alive) setMedia(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return media;
}
function mediumsWithArt(media: MediaType[], items: ArtResult[]) {
  return media.map((m) => ({ name: m.name, arts: items.filter((i) => i.medium === m.name) })).filter((g) => g.arts.length > 0);
}

// Shared 3-up thumbnail grid; tap opens the piece on its creator's profile.
function MedGrid({ items, onVerticalScroll }: { items: ArtResult[]; onVerticalScroll: (n: number) => void }) {
  const open = useOpen();
  const GAP = 6, PAD = 10, COLS = 3;
  const cell = (SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  return (
    <FlatList
      data={items}
      key="medgrid"
      numColumns={COLS}
      keyExtractor={(a) => a.id}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: PAD }}
      contentContainerStyle={{ gap: GAP, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScrollProp(onVerticalScroll)}
      ListEmptyComponent={<Text style={styles.abEmpty}>no art here yet</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => open(item)}>
          <Thumb item={item} style={{ width: cell, height: cell, borderWidth: 1, borderColor: Colors.black }} />
        </Pressable>
      )}
    />
  );
}

// A — horizontal filter chips over the grid.
function ArtChips({ query, onVerticalScroll }: Props) {
  const { items } = useAllArtFeed(query);
  const media = useMedia();
  const [sel, setSel] = useState<string | null>(null);
  const shown = sel ? items.filter((i) => i.medium === sel) : items;
  return (
    <View style={styles.fill}>
      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBarContent}>
          <Pressable style={[styles.chip, !sel && styles.chipActive]} onPress={() => setSel(null)}><Text style={[styles.chipTxt, !sel && styles.chipTxtActive]}>all</Text></Pressable>
          {media.map((m) => (
            <Pressable key={m.name} style={[styles.chip, sel === m.name && styles.chipActive]} onPress={() => setSel(m.name)}>
              <Text style={[styles.chipTxt, sel === m.name && styles.chipTxtActive]}>{m.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <MedGrid items={shown} onVerticalScroll={onVerticalScroll} />
    </View>
  );
}

// B — a grid of medium "covers"; tap to drill into that medium.
function ArtTiles({ query, onVerticalScroll }: Props) {
  const { items } = useAllArtFeed(query);
  const media = useMedia();
  const [sel, setSel] = useState<string | null>(null);
  if (sel) {
    return (
      <View style={styles.fill}>
        <Pressable style={styles.abBack} onPress={() => setSel(null)}><Text style={styles.abBackTxt}>‹ all mediums</Text></Pressable>
        <MedGrid items={items.filter((i) => i.medium === sel)} onVerticalScroll={onVerticalScroll} />
      </View>
    );
  }
  const groups = mediumsWithArt(media, items);
  const w = (SCREEN_W - 12 * 2 - 10) / 2;
  return (
    <FlatList
      data={groups}
      key="tiles"
      numColumns={2}
      keyExtractor={(g) => g.name}
      columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
      contentContainerStyle={{ gap: 10, paddingVertical: 12, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScrollProp(onVerticalScroll)}
      ListEmptyComponent={<Text style={styles.abEmpty}>no art yet</Text>}
      renderItem={({ item }) => (
        <Pressable style={[styles.tile, { width: w }]} onPress={() => setSel(item.name)}>
          <Thumb item={item.arts[0]} style={{ width: w - 2, height: w - 2 }} />
          <View style={styles.tileLabel}>
            <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.tileCount}>{item.arts.length}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

// C — a "medium ▾" dropdown over the grid.
function ArtDropdown({ query, onVerticalScroll }: Props) {
  const { items } = useAllArtFeed(query);
  const media = useMedia();
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = sel ? items.filter((i) => i.medium === sel) : items;
  return (
    <View style={styles.fill}>
      <Pressable style={styles.ddBtn} onPress={() => setOpen(true)}>
        <Text style={styles.ddBtnTxt}>{sel ?? 'all mediums'}  ▾</Text>
      </Pressable>
      <MedGrid items={shown} onVerticalScroll={onVerticalScroll} />
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.ddCard} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.ddRow} onPress={() => { setSel(null); setOpen(false); }}><Text style={styles.ddRowTxt}>all mediums</Text></Pressable>
            {media.map((m) => (
              <Pressable key={m.name} style={styles.ddRow} onPress={() => { setSel(m.name); setOpen(false); }}>
                <Text style={styles.ddRowTxt}>{m.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// D — Netflix-style shelves: one horizontal row of art per medium.
function ArtShelves({ query, onVerticalScroll }: Props) {
  const { items } = useAllArtFeed(query);
  const media = useMedia();
  const open = useOpen();
  const groups = mediumsWithArt(media, items);
  return (
    <ScrollView
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScrollProp(onVerticalScroll)}
      contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24 }}
    >
      {groups.length === 0 ? <Text style={styles.abEmpty}>no art yet</Text> : groups.map((g) => (
        <View key={g.name} style={styles.shelf}>
          <Text style={styles.shelfTitle}>{g.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfRow}>
            {g.arts.map((a) => (
              <Pressable key={a.id} onPress={() => open(a)}>
                <Thumb item={a} style={styles.shelfThumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

function ArtBrowsePanel(props: Props) {
  const { artBrowse } = useNavPref();
  if (artBrowse === 'A') return <ArtChips {...props} />;
  if (artBrowse === 'B') return <ArtTiles {...props} />;
  if (artBrowse === 'C') return <ArtDropdown {...props} />;
  if (artBrowse === 'D') return <ArtShelves {...props} />;
  return null;
}

// Picker: grid/feed toggle chooses grid vs feed; Settings picks the feed style
// (web vs insta). Both grid and the feed stay mounted once seen (inactive
// hidden) so toggling is instant; the feed data is module-cached so switching
// styles reuses it too.
export default function EverythingPanel(props: Props) {
  const { everythingView, artBrowse } = useNavPref();
  const Feed = FeedInsta;
  const [seenGrid, setSeenGrid] = useState(everythingView === 'grid');
  const [seenFeed, setSeenFeed] = useState(everythingView === 'feed');
  useEffect(() => {
    if (everythingView === 'grid') setSeenGrid(true);
    else setSeenFeed(true);
  }, [everythingView]);
  return (
    <View style={styles.fill}>
      {seenGrid && (
        <View style={[styles.fill, everythingView !== 'grid' && styles.hidden]}>
          <ArtGallery {...props} />
        </View>
      )}
      {seenFeed && (
        <View style={[styles.fill, everythingView !== 'feed' && styles.hidden]}>
          {artBrowse !== 'off' ? <ArtBrowsePanel {...props} /> : <Feed {...props} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  empty: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 40 },
  endMark: { fontFamily: Fonts.mono, fontSize: 16, color: Colors.textMuted, textAlign: 'center', marginTop: 22, marginBottom: 30, letterSpacing: 4 },
  glyphBox: { alignItems: 'center', justifyContent: 'center', padding: 6 },
  glyphTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.black, textAlign: 'center', marginTop: 4 },
  paperBox: { backgroundColor: Colors.artCardBg },
  audioBox: { backgroundColor: Colors.secondary },
  glyph: { fontFamily: Fonts.serif, fontSize: 30, color: Colors.black },
  iconSm: { width: '46%', height: '46%' },
  // WEB 2-col
  webCard: { width: WEB_W, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.artCardBg },
  webImg: { width: WEB_W - 2, height: WEB_W - 2 },
  webDeets: { padding: 8, borderTopWidth: 1, borderTopColor: Colors.black },
  webTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.xs, color: Colors.black },
  webMedium: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  webCreator: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.darkerGold, marginTop: 2 },
  webDetail: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  // INSTA single-col (crisp framed pieces)
  instaItem: { marginBottom: 18, paddingHorizontal: INSTA_PAD },
  // One border around the whole piece: header, image, and metadata.
  instaUnit: { borderWidth: 1, borderColor: Colors.black, overflow: 'hidden' },
  instaHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.black },
  instaUser: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.black },
  instaDate: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textMuted },
  instaPaper: { width: INSTA_W, minHeight: 200, backgroundColor: Colors.artCardBg, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 26 },
  instaPaperText: { fontFamily: Fonts.serif, fontSize: FontSizes.lg, color: Colors.black },
  instaAudio: { width: INSTA_W, minHeight: 130, backgroundColor: Colors.secondary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 18 },
  instaAudioIcon: { width: 52, height: 52 },
  instaAudioTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black },
  instaAudioArtist: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.darkerGold, marginTop: 4 },
  instaCaption: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.black, backgroundColor: Colors.secondary, paddingHorizontal: 12, paddingVertical: 8 },
  instaCapText: { flex: 1, fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  instaCapUser: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.black },
  instaCommentBtn: { paddingLeft: 10 },
  instaCommentIcon: { width: 24, height: 24 },
  // Art-browse prototypes
  abEmpty: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 40 },
  abBack: { paddingHorizontal: 16, paddingVertical: 10 },
  abBackTxt: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.darkerGold },
  chipBar: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
  chipBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.black, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.mainBg },
  chipActive: { backgroundColor: Colors.accentGolden },
  chipTxt: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.black },
  chipTxtActive: { fontWeight: '700' },
  tile: { borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.artCardBg },
  tileLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderTopWidth: 1, borderTopColor: Colors.black },
  tileName: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black, flex: 1 },
  tileCount: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.darkerGold, marginLeft: 8 },
  ddBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary, paddingHorizontal: 14, paddingVertical: 8, margin: 12 },
  ddBtnTxt: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.black },
  ddBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', paddingHorizontal: 40 },
  ddCard: { backgroundColor: Colors.mainBg, borderWidth: 1, borderColor: Colors.black, maxHeight: '70%' },
  ddRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  ddRowTxt: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  shelf: { marginBottom: 20 },
  shelfTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black, paddingHorizontal: 14, marginBottom: 8 },
  shelfRow: { paddingHorizontal: 14, gap: 8 },
  shelfThumb: { width: 120, height: 120, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary },
  gridScreen: { flex: 1, backgroundColor: Colors.mainBg },
  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  // The same bordered button used on About, Settings and the profile, rather
  // than bare text — so back looks like back everywhere.
  gridBackBtn: {
    width: 76,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 6,
    alignItems: 'center',
  },
  gridBackTxt: { fontFamily: Fonts.serif, fontSize: FontSizes.xs, color: Colors.black },
  gridBackSpacer: { width: 76 },
  gridTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black },
});

// Minimal "see everything" screen: just the 3-up art grid (no people/search
// chrome). Reached from the walls' "see everything" button.
export function ArtGridScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  // Optional artType filter: reached from a wall, this screen shows only that
  // wall's type; reached without one, it shows everything.
  const artType: string | undefined = route.params?.artType;
  const { items } = useAllArtFeed('');
  const shown = useMemo(() => {
    if (!artType) return items;
    if (artType === 'visual_2d') return items.filter((a) => a.art_type === 'visual_2d' || !a.art_type);
    return items.filter((a) => a.art_type === artType);
  }, [items, artType]);
  const title = artType === 'written_form' ? 'written'
    : artType === 'audio' ? 'audio'
    : artType === 'visual_2d' ? 'visual'
    : 'everything';
  return (
    <View style={[styles.gridScreen, { paddingTop: insets.top }]}>
      <View style={styles.gridHeader}>
        <Pressable style={styles.gridBackBtn} onPress={() => nav.goBack()} hitSlop={10}>
          <Text style={styles.gridBackTxt}>‹ back</Text>
        </Pressable>
        <Text style={styles.gridTitle}>{title}</Text>
        <View style={styles.gridBackSpacer} />
      </View>
      <MedGrid items={shown} onVerticalScroll={() => {}} />
    </View>
  );
}
