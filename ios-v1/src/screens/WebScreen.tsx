import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { useAuth } from '../context/AuthContext';
import { thumbSource } from '../api';
import * as Haptics from 'expo-haptics';
import {
  getWeb,
  removeInspiration,
  setInspirationViewer,
  WebGraph,
  WebNode,
  WebNodeArt,
} from '../api/inspiration';
import Spinner from '../components/Spinner';
import ConnectCreateDialog from '../components/ConnectCreateDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// The content plane is a large fixed square; node positions (centered on 0,0)
// are offset by CANVAS_HALF into it, and the plane starts translated so the
// focus sits mid-screen.
const CANVAS = 4000;
const CANVAS_HALF = CANVAS / 2;

type Pos = { x: number; y: number };

// Static force layout — run the simulation to rest, read positions.
function layoutGraph(g: WebGraph): Map<string, Pos> {
  type SimNode = { id: string; x?: number; y?: number; fx?: number | null; fy?: number | null };
  const nodes: SimNode[] = g.nodes.map((n) => ({ id: n.id }));
  const focus = nodes.find((n) => n.id === g.focusId);
  if (focus) {
    focus.fx = 0;
    focus.fy = 0;
  }
  const links = g.edges.map((e) => ({ source: e.from, target: e.to }));
  const sim = forceSimulation(nodes as any)
    .force('link', forceLink(links as any).id((d: any) => d.id).distance(150))
    .force('charge', forceManyBody().strength(-420))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(72))
    .stop();
  for (let i = 0; i < 250; i++) sim.tick();
  return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}

// Hop distance from the focus over the returned edges (for node sizing).
function hopMap(g: WebGraph): Map<string, number> {
  const hops = new Map<string, number>([[g.focusId, 0]]);
  let frontier = [g.focusId];
  let hop = 0;
  while (frontier.length) {
    hop += 1;
    const next: string[] = [];
    for (const e of g.edges) {
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

// Ink thread between two node centers; arrowhead points at the inspired
// piece (`a` = edge.from).
function Thread({ a, b }: { a: Pos; b: Pos }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ang = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: a.x + CANVAS_HALF,
        top: a.y + CANVAS_HALF,
        width: len,
        height: 2,
        backgroundColor: '#222',
        opacity: 0.7,
        transform: [{ rotate: `${ang}rad` }],
        transformOrigin: 'left center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: len * 0.4,
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

function nodeImageSource(n: WebNode) {
  return n.kind === 'art' ? thumbSource(n.id, n.file_path) : n.image;
}

export default function WebScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { currentUser } = useAuth();
  const entryArtId: string = route.params?.artId;

  const [graph, setGraph] = useState<WebGraph | null>(null);
  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());
  const [linkFrom, setLinkFrom] = useState<WebNodeArt | null>(null);

  // Canvas pan/zoom.
  const txv = useSharedValue(SCREEN_W / 2 - CANVAS_HALF);
  const tyv = useSharedValue(SCREEN_H / 2 - CANVAS_HALF);
  const scalev = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  useEffect(() => {
    setInspirationViewer(currentUser);
  }, [currentUser]);

  const focusNode = useCallback((id: string) => {
    getWeb(id)
      .then((g) => {
        setGraph(g);
        setPositions(layoutGraph(g));
        // Re-center the plane on the (pinned-at-origin) focus.
        txv.value = withTiming(SCREEN_W / 2 - CANVAS_HALF, { duration: 240 });
        tyv.value = withTiming(SCREEN_H / 2 - CANVAS_HALF, { duration: 240 });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (entryArtId) focusNode(entryArtId);
  }, [entryArtId, focusNode]);

  const pan = Gesture.Pan()
    .onStart(() => {
      startTx.value = txv.value;
      startTy.value = tyv.value;
    })
    .onUpdate((e) => {
      txv.value = startTx.value + e.translationX;
      tyv.value = startTy.value + e.translationY;
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scalev.value;
    })
    .onUpdate((e) => {
      scalev.value = Math.min(2.5, Math.max(0.4, startScale.value * e.scale));
    });
  const gestures = Gesture.Simultaneous(pan, pinch);

  // Web dev preview: ctrl+wheel zooms the canvas.
  const rootRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node || !node.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      scalev.value = Math.min(2.5, Math.max(0.4, scalev.value * (1 - e.deltaY / 300)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: txv.value },
      { translateY: tyv.value },
      { scale: scalev.value },
    ],
  }));

  const hops = useMemo(() => (graph ? hopMap(graph) : new Map<string, number>()), [graph]);
  const focused = graph?.nodes.find((n) => n.id === graph.focusId) ?? null;

  // The focused piece's own outgoing threads (for the caption's delete chips)
  // and everything already linked (filtered out of the connect pane).
  const focusedOutgoing = useMemo(() => {
    if (!graph) return [] as { edge: { id: string; from: string; to: string }; target: WebNode }[];
    return graph.edges
      .filter((e) => e.from === graph.focusId)
      .map((edge) => ({ edge, target: graph.nodes.find((n) => n.id === edge.to)! }))
      .filter((x) => !!x.target);
  }, [graph]);
  const linkedIds = useMemo(
    () => new Set(focusedOutgoing.map((x) => x.target.id)),
    [focusedOutgoing],
  );

  const refresh = useCallback(() => {
    if (graph) focusNode(graph.focusId);
  }, [graph, focusNode]);

  const openLinker = useCallback((n: WebNode) => {
    if (n.kind !== 'art' || !n.mine) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLinkFrom(n);
  }, []);

  return (
    <View style={styles.container} ref={rootRef}>
      <GestureDetector gesture={gestures}>
        <Reanimated.View style={[styles.plane, planeStyle]}>
          {graph &&
            graph.edges.map((e) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              return <Thread key={e.id} a={a} b={b} />;
            })}
          {graph &&
            graph.nodes.map((n) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              const size = nodeSize(hops.get(n.id));
              return (
                <Pressable
                  key={n.id}
                  onPress={() => n.id !== graph.focusId && focusNode(n.id)}
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
                  <View
                    style={[
                      styles.nodeCircle,
                      { borderRadius: size / 2 },
                      n.id === graph.focusId && styles.nodeFocused,
                    ]}
                  >
                    <Image
                      source={nodeImageSource(n)}
                      style={styles.nodeImage}
                      contentFit="cover"
                      transition={Platform.OS === 'web' ? 0 : 150}
                      cachePolicy="memory-disk"
                    />
                  </View>
                  {n.kind === 'external' && (
                    <Text style={styles.nodeArtist} numberOfLines={1}>
                      {n.artist}
                    </Text>
                  )}
                </Pressable>
              );
            })}
        </Reanimated.View>
      </GestureDetector>

      {!graph && (
        <View style={styles.loading} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}

      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
        <Text style={styles.backBtnText}>←</Text>
      </Pressable>

      {focused && (
        <View style={styles.caption} pointerEvents="box-none">
          <View style={styles.captionRow}>
            <View style={styles.captionText}>
              <Text style={styles.captionTitle} numberOfLines={1}>
                {focused.title || 'untitled'}
              </Text>
              <Text style={styles.captionByline} numberOfLines={1}>
                {focused.kind === 'art'
                  ? `${focused.creator} · ${focused.medium}`
                  : focused.artist}
              </Text>
            </View>
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
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      removeInspiration(edge.id).then(refresh).catch(() => {});
                    }}
                  >
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
  nodeImage: {
    width: '100%',
    height: '100%',
  },
  nodeArtist: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    right: -20,
    textAlign: 'center',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textMuted,
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
});
