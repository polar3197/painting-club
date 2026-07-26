import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { useAuth } from '../context/AuthContext';
import { thumbSource, authHeaders } from '../api';
import * as Haptics from 'expo-haptics';
import {
  getWeb,
  getFullWeb,
  removeInspiration,
  setInspirationViewer,
  externalImageUrl,
  WebGraph,
  WebNode,
  WebEdge,
  WebNodeArt,
  WebNodeExternal,
} from '../api/inspiration';
import Spinner from '../components/Spinner';
import ArtZoomIn from '../components/ArtZoomIn';
import ConnectCreateDialog from '../components/ConnectCreateDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// The content plane is a large fixed square; node positions (centered on 0,0)
// are offset by CANVAS_HALF into it. Scale is about the plane's center, so to
// put a layout point p at screen center at scale s:
//   translate = SCREEN/2 - CANVAS_HALF - p*s
const CANVAS = 4000;
const CANVAS_HALF = CANVAS / 2;
const PIECE_SCALE = 1; // zoom when centered on a single piece
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

type Pos = { x: number; y: number };

// --- Hull geometry for cluster packing -------------------------------------

// Andrew monotone chain. 1–2 points pass through (degenerate hulls are fine —
// the distance functions treat them as points/segments).
function convexHull(pts: Pos[]): Pos[] {
  if (pts.length <= 2) return [...pts];
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pos, a: Pos, b: Pos) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pos[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pos[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function ptSegDist(p: Pos, a: Pos, b: Pos): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segsIntersect(a1: Pos, a2: Pos, b1: Pos, b2: Pos): boolean {
  const d = (o: Pos, a: Pos, b: Pos) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function segSegDist(a1: Pos, a2: Pos, b1: Pos, b2: Pos): number {
  if (segsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    ptSegDist(a1, b1, b2),
    ptSegDist(a2, b1, b2),
    ptSegDist(b1, a1, a2),
    ptSegDist(b2, a1, a2),
  );
}

function pointInHull(p: Pos, hull: Pos[]): boolean {
  if (hull.length < 3) return false;
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[i];
    const b = hull[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Min distance between two hulls (0 when they touch or one contains the
// other). Iterates edge pairs; degenerate hulls fall out naturally.
function hullsDist(A: Pos[], B: Pos[]): number {
  if (A.length && B.length && (pointInHull(A[0], B) || pointInHull(B[0], A))) return 0;
  let best = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i];
    const a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      best = Math.min(best, segSegDist(a1, a2, B[j], B[(j + 1) % B.length]));
      if (best === 0) return 0;
    }
  }
  return best;
}

// Static force layout with GUARANTEED cluster separation: each connected
// component gets its own simulation and is wrapped in its CONVEX HULL, and
// the hulls are packed to a minimum mutual distance. Both endpoints of any
// thread are in their cluster's hull, so by convexity the whole thread is
// too — disjoint hulls mean threads of disparate sub-webs cannot cross.
// Hulls (unlike the earlier bounding circles) hug elongated and irregular
// clusters, so the packing nests organically instead of as spaced blobs.
function layoutGraph(g: WebGraph): Map<string, Pos> {
  type SimNode = { id: string; x?: number; y?: number };

  // Connected components over the edges (isolated nodes — e.g. an entry piece
  // with no links yet — are their own component).
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const n of g.nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const nb of adj.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp);
  }

  // Lay each component out around its own origin.
  const clusters = components.map((ids) => {
    const inComp = new Set(ids);
    const nodes: SimNode[] = ids.map((id) => ({ id }));
    const links = g.edges
      .filter((e) => inComp.has(e.from) && inComp.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }));
    const sim = forceSimulation(nodes as any)
      .force('link', forceLink(links as any).id((d: any) => d.id).distance(150))
      .force('charge', forceManyBody().strength(-420))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(72))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    // Center on the centroid and measure the bounding radius (+ node size
    // margin so the circle contains whole node faces, not just centers).
    let cx = 0;
    let cy = 0;
    for (const nd of nodes) {
      cx += nd.x ?? 0;
      cy += nd.y ?? 0;
    }
    cx /= nodes.length;
    cy /= nodes.length;
    let r = 0;
    const pos = new Map<string, Pos>();
    for (const nd of nodes) {
      const x = (nd.x ?? 0) - cx;
      const y = (nd.y ?? 0) - cy;
      pos.set(nd.id, { x, y });
      r = Math.max(r, Math.sqrt(x * x + y * y));
    }
    return { pos, r, hull: convexHull([...pos.values()]) };
  });

  // Pack the cluster hulls: biggest at the origin, the rest walked along a
  // golden-angle spiral to the first spot whose hull keeps SEP from every
  // hull already placed. SEP matches the intra-cluster link distance, so a
  // neighboring cluster sits about as far away as a linked node does.
  clusters.sort((a, b) => b.r - a.r);
  const SEP = 150;
  const placedHulls: Pos[][] = [];
  const out = new Map<string, Pos>();
  for (const c of clusters) {
    let px = 0;
    let py = 0;
    if (placedHulls.length) {
      for (let i = 1; ; i++) {
        const d = 24 * Math.sqrt(i);
        const th = i * 2.39996; // golden angle — dense, even spiral coverage
        px = d * Math.cos(th);
        py = d * Math.sin(th);
        const at = c.hull.map((p) => ({ x: p.x + px, y: p.y + py }));
        if (placedHulls.every((h) => hullsDist(at, h) >= SEP)) break;
      }
    }
    placedHulls.push(c.hull.map((p) => ({ x: p.x + px, y: p.y + py })));
    for (const [id, p] of c.pos) out.set(id, { x: p.x + px, y: p.y + py });
  }

  // Recenter the whole arrangement so the camera math keeps its origin.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of out.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  for (const [id, p] of out) out.set(id, { x: p.x - ox, y: p.y - oy });
  return out;
}

// Hop distance from a focus node over the edges (drives node sizing).
function hopMap(edges: WebEdge[], focusId: string): Map<string, number> {
  const hops = new Map<string, number>([[focusId, 0]]);
  let frontier = [focusId];
  let hop = 0;
  while (frontier.length) {
    hop += 1;
    const next: string[] = [];
    for (const e of edges) {
      if (hops.has(e.from) && !hops.has(e.to)) {
        hops.set(e.to, hop);
        next.push(e.to);
      }
      if (hops.has(e.to) && !hops.has(e.from)) {
        hops.set(e.from, hop);
        next.push(e.from);
      }
    }
    frontier = next;
  }
  return hops;
}

function nodeSize(hop: number | undefined): number {
  if (hop === 0) return 132;
  if (hop === 1) return 92;
  return 64;
}

// Ink thread between two nodes, trimmed to the circle rims so it's never
// hidden behind a node, with the arrowhead sitting just outside the inspired
// piece's rim (`a` = edge.from) pointing into it.
function Thread({ a, b, ra, rb }: { a: Pos; b: Pos; ra: number; rb: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const gap = 3;
  const sx = a.x + ux * (ra + gap);
  const sy = a.y + uy * (ra + gap);
  const seg = Math.max(1, len - ra - rb - gap * 2);
  const ang = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: sx + CANVAS_HALF,
        top: sy + CANVAS_HALF,
        width: seg,
        height: 2,
        backgroundColor: '#222',
        opacity: 0.7,
        transform: [{ rotate: `${ang}rad` }],
        transformOrigin: 'left center',
      }}
    >
      {/* Arrowhead at the start (the inspired piece's rim), tip pointing back
          into that piece. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: -4,
          width: 0,
          height: 0,
          borderTopWidth: 5,
          borderBottomWidth: 5,
          borderRightWidth: 9,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: '#222',
        }}
      />
    </View>
  );
}

// What fills a node's circle: image thumbs for visual/external art, the inked
// writing-lines glyph for written pieces and the music-note glyph for audio
// (their content has no visual thumbnail). The writing glyph is deliberately
// NOT the dog-eared page, which already means saved/bookmark.
function NodeFace({ n }: { n: WebNode }) {
  if (n.kind === 'art' && n.artKind === 'written') {
    return (
      <View style={styles.nodeGlyphWrap}>
        <Image source={require('../../assets/imgs/writing.png')} style={styles.nodeGlyph} contentFit="contain" />
      </View>
    );
  }
  if (n.kind === 'art' && n.artKind === 'audio') {
    return (
      <View style={styles.nodeGlyphWrap}>
        <Image source={require('../../assets/imgs/music.png')} style={styles.nodeGlyph} contentFit="contain" />
      </View>
    );
  }
  return (
    <Image
      source={n.kind === 'art' ? thumbSource(n.id, n.file_path) : n.image}
      style={styles.nodeImage}
      contentFit="cover"
      transition={Platform.OS === 'web' ? 0 : 150}
      cachePolicy="memory-disk"
    />
  );
}

export default function WebScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { currentUser } = useAuth();
  const entryArtId: string = route.params?.artId;

  // One graph — the whole web plus the entry piece (guaranteed present even
  // if it has no connections yet). The camera starts zoomed onto the entry
  // piece; panning/zooming out reveals the rest of the constellation.
  const [graph, setGraph] = useState<WebGraph | null>(null);
  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());
  const [focusId, setFocusId] = useState<string>(entryArtId);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [linkFrom, setLinkFrom] = useState<WebNodeArt | null>(null);
  // Full-image zoom for a focused EXTERNAL piece (tap its caption card).
  const [zoomExt, setZoomExt] = useState<WebNodeExternal | null>(null);

  // Canvas camera (plane transform).
  const txv = useSharedValue(SCREEN_W / 2 - CANVAS_HALF);
  const tyv = useSharedValue(SCREEN_H / 2 - CANVAS_HALF);
  const scalev = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);
  // The camera translate is SPLIT: pan writes txv/tyv, pinch writes its own
  // compX/compY (plus scale), and the plane renders their sum. Neither
  // gesture ever touches the other's values, so simultaneous pan+pinch can't
  // fight over the camera (the old glitch/jump bug).
  const compX = useSharedValue(0);
  const compY = useSharedValue(0);
  // Layout point under the fingers at pinch start — the zoom's anchor.
  const pfX = useSharedValue(0);
  const pfY = useSharedValue(0);
  // Content bounding box in layout coords (updated when positions change),
  // so the camera can be clamped and the web can't slide off-screen.
  const boundMinX = useSharedValue(0);
  const boundMaxX = useSharedValue(0);
  const boundMinY = useSharedValue(0);
  const boundMaxY = useSharedValue(0);

  // Clamp a total translate so at least a margin of content stays on screen;
  // when the content is smaller than the screen (zoomed way out), center it.
  const clampCam = (tx: number, ty: number, s: number): [number, number] => {
    'worklet';
    const M = 80;
    const loX = M - CANVAS_HALF - boundMaxX.value * s;
    const hiX = SCREEN_W - M - CANVAS_HALF - boundMinX.value * s;
    const loY = M - CANVAS_HALF - boundMaxY.value * s;
    const hiY = SCREEN_H - M - CANVAS_HALF - boundMinY.value * s;
    const cx = loX > hiX ? (loX + hiX) / 2 : Math.min(hiX, Math.max(loX, tx));
    const cy = loY > hiY ? (loY + hiY) / 2 : Math.min(hiY, Math.max(loY, ty));
    return [cx, cy];
  };

  useEffect(() => {
    setInspirationViewer(currentUser);
  }, [currentUser]);

  // Point the camera at a layout position (scale about the plane center).
  // Targets subtract the pinch's comp offset so the rendered sum lands on the
  // requested point (comp is only ever changed by an active pinch).
  const centerOnPos = useCallback((p: Pos, s: number, animate: boolean) => {
    const tx = SCREEN_W / 2 - CANVAS_HALF - p.x * s - compX.value;
    const ty = SCREEN_H / 2 - CANVAS_HALF - p.y * s - compY.value;
    if (animate) {
      txv.value = withTiming(tx, { duration: 300 });
      tyv.value = withTiming(ty, { duration: 300 });
      scalev.value = withTiming(s, { duration: 300 });
    } else {
      txv.value = tx;
      tyv.value = ty;
      scalev.value = s;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame the entire layout (bounding box + margin).
  const fitAll = useCallback((pos: Map<string, Pos>, animate: boolean) => {
    const pts = [...pos.values()];
    if (!pts.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = maxX - minX + 240;
    const spanY = maxY - minY + 340;
    const s = Math.max(MIN_SCALE, Math.min(1, Math.min(SCREEN_W / spanX, SCREEN_H / spanY)));
    centerOnPos({ x: cx, y: cy }, s, animate);
  }, [centerOnPos]);

  // Fetch the whole web ∪ the entry/center piece, lay it out, and frame it.
  const loadWeb = useCallback((centerId: string, out: boolean) => {
    Promise.all([getFullWeb(), getWeb(centerId)])
      .then(([full, one]) => {
        const nodeMap = new Map<string, WebNode>();
        [...full.nodes, ...one.nodes].forEach((n) => nodeMap.set(n.id, n));
        const edgeMap = new Map<string, WebEdge>();
        [...full.edges, ...one.edges].forEach((e) => edgeMap.set(e.id, e));
        const merged: WebGraph = { focusId: centerId, nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
        const pos = layoutGraph(merged);
        setGraph(merged);
        setPositions(pos);
        setFocusId(centerId);
        setZoomedOut(out);
        if (out) fitAll(pos, false);
        else centerOnPos(pos.get(centerId) ?? { x: 0, y: 0 }, PIECE_SCALE, false);
      })
      .catch(() => {});
  }, [centerOnPos, fitAll]);

  useEffect(() => {
    if (entryArtId) loadWeb(entryArtId, false);
  }, [entryArtId, loadWeb]);

  // Feed the camera clamp the content's bounding box whenever layout changes.
  useEffect(() => {
    const pts = [...positions.values()];
    if (!pts.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    boundMinX.value = minX;
    boundMaxX.value = maxX;
    boundMinY.value = minY;
    boundMaxY.value = maxY;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // Tap a node → glide the camera onto it (no refetch; positions are stable).
  const tapNode = useCallback((id: string) => {
    setFocusId(id);
    setZoomedOut(false);
    const p = positions.get(id);
    if (p) centerOnPos(p, PIECE_SCALE, true);
  }, [positions, centerOnPos]);

  const toggleWhole = useCallback(() => {
    if (zoomedOut) {
      setZoomedOut(false);
      const p = positions.get(focusId);
      if (p) centerOnPos(p, PIECE_SCALE, true);
    } else {
      setZoomedOut(true);
      fitAll(positions, true);
    }
  }, [zoomedOut, positions, focusId, centerOnPos, fitAll]);

  // After linking/unlinking, refetch so new nodes/edges enter the layout.
  const refresh = useCallback(() => loadWeb(focusId, zoomedOut), [loadWeb, focusId, zoomedOut]);

  // One- or two-finger pan, following the finger centroid. averageTouches
  // keeps the translation continuous when a finger lands or lifts, so there's
  // no jump at pointer-count changes. Writes ONLY txv/tyv.
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .onStart(() => {
      startTx.value = txv.value;
      startTy.value = tyv.value;
    })
    .onUpdate((e) => {
      const [cx, cy] = clampCam(
        startTx.value + e.translationX + compX.value,
        startTy.value + e.translationY + compY.value,
        scalev.value,
      );
      txv.value = cx - compX.value;
      tyv.value = cy - compY.value;
    });
  // Pinch: scale about the layout point grabbed at pinch start, keeping it
  // glued under the live focal. Writes ONLY scalev + compX/compY — comp is
  // "whatever translate the anchor needs beyond the pan's", so the pan's
  // simultaneous writes pass through instead of fighting. comp persists after
  // the pinch (camera animations subtract it from their targets).
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scalev.value;
      pfX.value = (e.focalX - (txv.value + compX.value) - CANVAS_HALF) / scalev.value;
      pfY.value = (e.focalY - (tyv.value + compY.value) - CANVAS_HALF) / scalev.value;
    })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.value * e.scale));
      const [cx, cy] = clampCam(
        e.focalX - CANVAS_HALF - pfX.value * s,
        e.focalY - CANVAS_HALF - pfY.value * s,
        s,
      );
      scalev.value = s;
      compX.value = cx - txv.value;
      compY.value = cy - tyv.value;
    });
  const gestures = Gesture.Simultaneous(pan, pinch);

  // Web dev preview: ctrl+wheel = pinch, anchored at the cursor.
  const rootRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node || !node.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const s0 = scalev.value;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s0 * (1 - e.deltaY / 300)));
      const cx = txv.value + compX.value + CANVAS_HALF;
      const cy = tyv.value + compY.value + CANVAS_HALF;
      const ratio = s / s0;
      const [cx2, cy2] = clampCam(
        e.clientX - (e.clientX - cx) * ratio - CANVAS_HALF,
        e.clientY - (e.clientY - cy) * ratio - CANVAS_HALF,
        s,
      );
      scalev.value = s;
      txv.value = cx2 - compX.value;
      tyv.value = cy2 - compY.value;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: txv.value + compX.value },
      { translateY: tyv.value + compY.value },
      { scale: scalev.value },
    ],
  }));

  const hops = useMemo(
    () => (graph ? hopMap(graph.edges, focusId) : new Map<string, number>()),
    [graph, focusId],
  );
  const focused = graph?.nodes.find((n) => n.id === focusId) ?? null;

  const focusedOutgoing = useMemo(() => {
    if (!graph) return [] as { edge: WebEdge; target: WebNode }[];
    return graph.edges
      .filter((e) => e.from === focusId)
      .map((edge) => ({ edge, target: graph.nodes.find((n) => n.id === edge.to)! }))
      .filter((x) => !!x.target);
  }, [graph, focusId]);
  const linkedIds = useMemo(() => new Set(focusedOutgoing.map((x) => x.target.id)), [focusedOutgoing]);

  const openLinker = useCallback((n: WebNode) => {
    if (n.kind !== 'art' || !n.mine) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLinkFrom(n);
  }, []);

  return (
    <View style={styles.container} ref={rootRef}>
      {/* The detector MUST sit on a static view: gesture coordinates are
          reported in the attached view's coordinate space, so attaching to
          the transformed plane inverse-warps focal/translation by the live
          camera (the native-only glitch/jump/slide bug — web measures page
          coords and never showed it). This wrapper is untransformed, so
          events arrive in stable screen coords, which is what the camera
          math expects. */}
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Reanimated.View style={[styles.plane, planeStyle]}>
          {graph &&
            graph.edges.map((e) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const ra = nodeSize(hops.get(e.from)) / 2;
              const rb = nodeSize(hops.get(e.to)) / 2;
              return <Thread key={e.id} a={a} b={b} ra={ra} rb={rb} />;
            })}
          {graph &&
            graph.nodes.map((n) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              const size = nodeSize(hops.get(n.id));
              return (
                <Pressable
                  key={n.id}
                  onPress={() => n.id !== focusId && tapNode(n.id)}
                  onLongPress={() => openLinker(n)}
                  delayLongPress={450}
                  style={[
                    styles.node,
                    {
                      left: pos.x + CANVAS_HALF - size / 2,
                      top: pos.y + CANVAS_HALF - size / 2,
                      width: size,
                      height: size,
                    },
                  ]}
                >
                  {/* Circular frame: threads meet the rim instead of hiding
                      behind square image corners. The clipping circle is a
                      child so the artist label below isn't clipped. */}
                  {n.kind === 'external' ? (
                    // Outside-the-club pieces: a thick gold ring with a thin
                    // black outline around it (no name label — the caption
                    // names the artist on focus).
                    <View style={[styles.nodeOuterBlack, { borderRadius: size / 2 }]}>
                      <View style={[styles.nodeGoldRing, { borderRadius: size / 2 }]}>
                        <NodeFace n={n} />
                      </View>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.nodeCircle,
                        { borderRadius: size / 2 },
                        n.id === focusId && styles.nodeFocused,
                      ]}
                    >
                      <NodeFace n={n} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Reanimated.View>
        </View>
      </GestureDetector>

      {!graph && (
        <View style={styles.loading} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}

      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
        <Text style={styles.backBtnText}>←</Text>
      </Pressable>

      <Pressable
        style={[styles.toggleBtn, zoomedOut && styles.toggleBtnActive]}
        onPress={toggleWhole}
        hitSlop={8}
      >
        <Image source={require('../../assets/imgs/web.png')} style={styles.toggleIcon} contentFit="contain" />
        <Text style={styles.toggleText}>{zoomedOut ? 'this piece' : 'whole web'}</Text>
      </Pressable>

      {zoomedOut && graph && (
        <View style={styles.caption} pointerEvents="none">
          <Text style={styles.captionTitle}>whole web</Text>
          <Text style={styles.captionByline}>
            {graph.edges.length > 0
              ? `${new Set(graph.edges.flatMap((e) => [e.from, e.to])).size} connected pieces · tap one to focus`
              : 'no connections yet'}
          </Text>
        </View>
      )}

      {!zoomedOut && focused && (
        <View style={styles.caption} pointerEvents="box-none">
          <View style={styles.captionRow}>
            <Pressable
              style={styles.captionText}
              // In-app pieces open on the creator's profile, scrolled to the
              // piece; external art opens a full-image zoom (it has no page).
              onPress={() => {
                if (focused.kind !== 'art') {
                  setZoomExt(focused as WebNodeExternal);
                  return;
                }
                // Route into the Search tab's profile so the bottom tab bar
                // stays (the Web screen sits above the tabs on the root stack;
                // a root-level profile would come up chromeless).
                navigation.navigate('Main', {
                  screen: 'SearchTab',
                  params: {
                    screen: 'UserProfile',
                    params: { username: focused.creator, artId: focused.id, medium: focused.medium },
                  },
                });
              }}
            >
              <Text style={styles.captionTitle} numberOfLines={1}>
                {focused.title || 'untitled'}
              </Text>
              <Text style={styles.captionByline} numberOfLines={1}>
                {focused.kind === 'art' ? `${focused.creator} · ${focused.medium}` : focused.artist}
              </Text>
            </Pressable>
            {focused.kind === 'art' && focused.mine && (
              <Pressable style={styles.addBtn} onPress={() => openLinker(focused)} hitSlop={8}>
                <Text style={styles.addBtnText}>+ inspiration</Text>
              </Pressable>
            )}
          </View>
          {focused.kind === 'art' && focused.mine && focusedOutgoing.length > 0 && (
            <View style={styles.chips}>
              {focusedOutgoing.map(({ edge, target }) => (
                <View key={edge.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {target.kind === 'art' ? target.title || 'untitled' : target.artist}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => removeInspiration(edge.id).then(refresh).catch(() => {})}>
                    <Text style={styles.chipX}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {linkFrom && (
        <ConnectCreateDialog
          fromArt={linkFrom}
          linkedIds={linkedIds}
          onLinked={() => refresh()}
          onClose={() => setLinkFrom(null)}
        />
      )}

      {zoomExt && (
        <ArtZoomIn
          isOwner={false}
          imgPath={externalImageUrl(zoomExt.id, true)}
          headers={authHeaders()}
          onClose={() => setZoomExt(null)}
          backContent={
            <View style={styles.zoomBack}>
              <Text style={styles.captionTitle}>{zoomExt.title || 'untitled'}</Text>
              <Text style={styles.captionByline}>{zoomExt.artist}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    overflow: 'hidden',
  },
  plane: {
    position: 'absolute',
    width: CANVAS,
    height: CANVAS,
  },
  node: {
    position: 'absolute',
  },
  nodeCircle: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    overflow: 'hidden',
  },
  nodeFocused: {
    borderWidth: 3,
  },
  // External (non-club) pieces: thin black outline around a thick gold ring.
  nodeOuterBlack: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: '#000',
  },
  nodeGoldRing: {
    width: '100%',
    height: '100%',
    borderWidth: 6,
    borderColor: Colors.primaryGold,
    backgroundColor: Colors.artCardBg,
    overflow: 'hidden',
  },
  nodeImage: {
    width: '100%',
    height: '100%',
  },
  nodeGlyphWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  nodeGlyph: {
    width: '55%',
    height: '55%',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 54,
    left: 16,
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  toggleBtn: {
    position: 'absolute',
    top: 54,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    height: 36,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primaryGold,
  },
  toggleIcon: {
    width: 18,
    height: 18,
  },
  toggleText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 34,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captionText: {
    flex: 1,
  },
  captionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
  captionByline: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 220,
  },
  chipText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    flexShrink: 1,
  },
  chipX: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  zoomBack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 16,
  },
});
