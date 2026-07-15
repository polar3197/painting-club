import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, Dimensions, Animated, Easing, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  withDecay,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useAdminPending } from '../hooks';
import Announcements from '../components/Announcements';
import { get_active_prompt, PromptOut } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeFeed'>;

// Home screen is being cleared out for now. Everything below is kept fully
// intact — flip these flags back to `true` to restore each piece. The weekly
// prompt in particular is preserved so it can be re-added later.
const SHOW_INTRO = false; // title bar + welcome blurb
const SHOW_WEEKLY_PROMPT = true; // the week's-prompt circle

// Fidget spinner (the spinning diamond + its ∗/○ toggle) is hidden for now —
// the Home toy is the two bouncing balls. Flip back to true to restore the
// toggle and the spinning-diamond mode.
const SHOW_FIDGET = false;

// Temporary type-sampler. These are the sharp-edged / monoline fonts that iOS
// ships with (so they render without embedding). The Google picks (Jost,
// Chakra Petch, Space Mono, …) need a font file + rebuild to preview.
const SHOW_FONT_SAMPLES = false;
const FONT_SAMPLES: { label: string; family: string; weight?: 'normal' | 'bold' }[] = [
  { label: 'Futura', family: 'Futura' },
  { label: 'Avenir Next', family: 'Avenir Next' },
  { label: 'Helvetica Neue', family: 'Helvetica Neue' },
  { label: 'Gill Sans', family: 'Gill Sans' },
  { label: 'American Typewriter', family: 'American Typewriter' },
  { label: 'Copperplate', family: 'Copperplate' },
  { label: 'Menlo', family: 'Menlo' },
  { label: 'Courier New', family: 'Courier New' },
  // iOS ignores fontWeight when an explicit family is set, so name the bold
  // face directly by its PostScript name.
  { label: 'Courier New — Bold', family: 'CourierNewPS-BoldMT' },
  { label: 'Trebuchet MS', family: 'Trebuchet MS' },
  { label: 'Arial', family: 'Arial' },
];

// Slightly smaller cap so the circle clears the tab bar on a 6.1" iPhone
// (16/15 standard size) without crowding the welcome blurb above.
const CIRCLE_SIZE = Math.min(Dimensions.get('window').width - 100, 240);

// Sparkles scattered across the interior of the circle. Each entry is a
// (angle, normalized radius 0..1, delay ms, size). Fixed at module load so
// positions don't shift between renders.
const SPARKLES = [
  { angle: -1.4, r: 0.20, delay: 0,    size: 22 },
  { angle: 0.5,  r: 0.55, delay: 300,  size: 16 },
  { angle: 2.2,  r: 0.35, delay: 600,  size: 28 },
  { angle: -2.6, r: 0.65, delay: 900,  size: 14 },
  { angle: 1.7,  r: 0.80, delay: 1200, size: 20 },
  { angle: -0.4, r: 0.85, delay: 200,  size: 18 },
  { angle: 3.0,  r: 0.10, delay: 1500, size: 24 },
  { angle: -2.0, r: 0.30, delay: 1800, size: 14 },
  { angle: 0.9,  r: 0.15, delay: 1100, size: 26 },
  { angle: 2.7,  r: 0.75, delay: 500,  size: 12 },
];
const SPARKLE_MAX_RADIUS = CIRCLE_SIZE / 2 - 14;

// --- Diamond zigzag layout ---
// Each diamond is a square rotated 45° inside a CELL×CELL box (its vertices
// touch the cell edge midpoints). Consecutive cells alternate left/right and
// overlap vertically by DIAMOND_OVERLAP, so the right vertex of one meets the
// left vertex of the next — a corner-to-corner zigzag.
const SCREEN_W = Dimensions.get('window').width;
const DIAMOND_CELL = Math.min(SCREEN_W * 0.78, 320);
const DIAMOND_INNER = DIAMOND_CELL / Math.SQRT2; // side of the un-rotated square
const DIAMOND_OFFSET = (DIAMOND_CELL - DIAMOND_INNER) / 2;
const DIAMOND_OVERLAP = 0.46; // fraction of a cell that neighbors overlap vertically

// Sparkles for the weekly-prompt diamond — kept near center (small radius) so
// they stay inside the diamond rather than the bounding box corners.
const DIAMOND_SPARKLES = [
  { angle: -1.2, r: 0.16, delay: 0, size: 18 },
  { angle: 1.0, r: 0.26, delay: 400, size: 14 },
  { angle: 2.6, r: 0.20, delay: 800, size: 20 },
  { angle: -2.4, r: 0.28, delay: 1200, size: 12 },
  { angle: 0.3, r: 0.10, delay: 600, size: 16 },
];

function Sparkle({ angle, r, delay, size }: { angle: number; r: number; delay: number; size: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.6, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.delay(1500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale, delay]);

  const radius = r * SPARKLE_MAX_RADIUS;
  // Position by the sparkle's *center*. Wrap in an absolutely-positioned View
  // and let the Text render naturally inside — that avoids text-box baseline
  // drift that was pushing visible glyphs down out of their bounding boxes.
  const cx = CIRCLE_SIZE / 2 + Math.cos(angle) * radius;
  const cy = CIRCLE_SIZE / 2 + Math.sin(angle) * radius;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - size,
        top: cy - size,
        width: size * 2,
        height: size * 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [{ scale }],
      }}
    >
      <Text style={{ fontSize: size, color: '#E30022', textAlign: 'center', lineHeight: size }}>✦</Text>
    </Animated.View>
  );
}

// --- Bounce mode physics (independent of the fidget diamond) ---
const BALL_SIZE = 150;
const WALL_RESTITUTION = 0.94;  // energy kept per wall bounce (high elasticity)
const LAUNCH_GAIN = 78;         // launch px/s per px of pull (opposite the pull) — ~3x strong
const MAX_PULL = 185;           // ~1.2 inches of stretch (≈155 pt/inch on these screens)
const MAX_SPEED = 6000;         // ceiling: fast but still reads as motion, not a vibrating blur
const REST_DAMPING = 0.7;       // per-second exponential velocity decay (light)
const MIN_SPEED = 24;           // px/s below which the ball is treated as at rest

// A single slingshot "ball" living inside a shared play area. The arena owns
// the measured width/height (passed in as shared values); the ball owns its own
// position/velocity. Grab it (freezes it), drag to stretch from its rest
// anchor, release and it launches OPPOSITE the pull, bouncing off the arena
// walls with high elasticity and light friction until it settles. Each ball
// also gets an initial velocity so they're already bouncing on load. A clean
// tap fires onOpen. Physics runs on the UI thread via useFrameCallback, paused
// whenever the screen isn't focused. Fully separate from SpinningPromptDiamond.
function Ball({ label, sublabel, accent, onOpen, W, H, initFracX, initFracY, initVX, initVY }: {
  label: string;
  sublabel?: string | null;
  accent: string;
  onOpen?: () => void;
  W: Reanimated.SharedValue<number>;
  H: Reanimated.SharedValue<number>;
  initFracX: number;
  initFracY: number;
  initVX: number;
  initVY: number;
}) {
  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const velX = useSharedValue(0);
  const velY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const inited = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const isFocused = useIsFocused();

  const frame = useFrameCallback((info) => {
    'worklet';
    if (W.value === 0 || H.value === 0) return;
    // Lazy init once the arena is measured: drop the ball at its start fraction
    // and give it an initial velocity so it's bouncing the moment it appears.
    if (!inited.value) {
      posX.value = (W.value - BALL_SIZE) * initFracX;
      posY.value = (H.value - BALL_SIZE) * initFracY;
      velX.value = initVX;
      velY.value = initVY;
      inited.value = true;
    }
    if (dragging.value) return;
    const dt = Math.min((info.timeSincePreviousFrame ?? 16) / 1000, 0.05);
    if (dt <= 0) return;
    let x = posX.value + velX.value * dt;
    let y = posY.value + velY.value * dt;
    const maxX = W.value - BALL_SIZE;
    const maxY = H.value - BALL_SIZE;
    if (x < 0) { x = 0; velX.value = -velX.value * WALL_RESTITUTION; }
    else if (x > maxX) { x = maxX; velX.value = -velX.value * WALL_RESTITUTION; }
    if (y < 0) { y = 0; velY.value = -velY.value * WALL_RESTITUTION; }
    else if (y > maxY) { y = maxY; velY.value = -velY.value * WALL_RESTITUTION; }
    const damp = Math.exp(-REST_DAMPING * dt);
    velX.value *= damp;
    velY.value *= damp;
    if (Math.hypot(velX.value, velY.value) < MIN_SPEED) { velX.value = 0; velY.value = 0; }
    posX.value = x;
    posY.value = y;
  }, false);

  // Only integrate while this screen is focused — no physics off-screen.
  useEffect(() => {
    frame.setActive(isFocused);
    return () => frame.setActive(false);
  }, [isFocused, frame]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      // Catch the ball: freeze it and anchor the sling at its current spot.
      dragging.value = true;
      velX.value = 0;
      velY.value = 0;
      startX.value = posX.value;
      startY.value = posY.value;
      anchorX.value = posX.value;
      anchorY.value = posY.value;
    })
    .onUpdate((e) => {
      'worklet';
      let nx = startX.value + e.translationX;
      let ny = startY.value + e.translationY;
      // Cap the stretch distance from the anchor.
      const dx = nx - anchorX.value;
      const dy = ny - anchorY.value;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_PULL) {
        const s = MAX_PULL / dist;
        nx = anchorX.value + dx * s;
        ny = anchorY.value + dy * s;
      }
      // Keep the ball fully within the play area while dragging.
      nx = Math.max(0, Math.min(nx, W.value - BALL_SIZE));
      ny = Math.max(0, Math.min(ny, H.value - BALL_SIZE));
      posX.value = nx;
      posY.value = ny;
    })
    .onEnd(() => {
      'worklet';
      // Slingshot: fling opposite the pull, magnitude ∝ pull distance, but
      // capped so a big pull can't send it vibrating faster than the eye tracks.
      let vx = (anchorX.value - posX.value) * LAUNCH_GAIN;
      let vy = (anchorY.value - posY.value) * LAUNCH_GAIN;
      const spd = Math.hypot(vx, vy);
      if (spd > MAX_SPEED) {
        const s = MAX_SPEED / spd;
        vx *= s;
        vy *= s;
      }
      velX.value = vx;
      velY.value = vy;
    })
    .onFinalize(() => {
      'worklet';
      // Always clear the drag flag, even on a tap where onEnd never fires.
      dragging.value = false;
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success && onOpen) runOnJS(onOpen)();
    });

  const composed = Gesture.Race(tap, pan);

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[styles.ball, { borderColor: accent }, ballStyle]}>
        <Text style={styles.diamondHeading}>{label}</Text>
        {sublabel ? <Text style={styles.diamondSub} numberOfLines={2}>{sublabel}</Text> : null}
      </Reanimated.View>
    </GestureDetector>
  );
}

// The Home "toy": two slingshot balls — the week's prompt and an event ball —
// bouncing around a shared full-bleed play area behind the title and buttons.
// The arena measures the play area once and hands its width/height to each ball
// so they share one set of walls. box-none lets touches on empty space fall
// through; each ball grabs only its own circle. Bounded to the Home area (above
// the tab bar), so a ball can never reach the nav bar.
function BounceArena({ prompt, onOpenPrompt, onOpenEvent, topInset }: {
  prompt: PromptOut | null;
  onOpenPrompt: () => void;
  onOpenEvent?: () => void;
  topInset: number;
}) {
  const W = useSharedValue(0);
  const H = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    W.value = e.nativeEvent.layout.width;
    H.value = e.nativeEvent.layout.height;
  };
  return (
    <View style={[styles.bounceLayer, { top: topInset }]} onLayout={onLayout} pointerEvents="box-none">
      <Ball
        label={"week's\nprompt"}
        sublabel={prompt?.title ?? null}
        accent="#E30022"
        onOpen={prompt ? onOpenPrompt : undefined}
        W={W}
        H={H}
        initFracX={0.26}
        initFracY={0.2}
        initVX={1600}
        initVY={1300}
      />
      <Ball
        label="event"
        accent="#1E73BE"
        onOpen={onOpenEvent}
        W={W}
        H={H}
        initFracX={0.72}
        initFracY={0.66}
        initVX={-1500}
        initVY={-1400}
      />
    </View>
  );
}

// The weekly-prompt diamond, spinnable like a fidget spinner. Drag anywhere on
// it to whirl it around the center; on release it keeps spinning and slows under
// friction (withDecay). A plain tap still opens the prompt. The gesture lives on
// a NON-rotating outer view so touch coordinates stay in a stable frame; only
// the inner layer rotates.
function SpinningPromptDiamond({ prompt, onOpen }: { prompt: PromptOut | null; onOpen: () => void }) {
  const spin = useSharedValue(0);
  const prevAngle = useSharedValue(0);
  const cx = useSharedValue(DIAMOND_CELL / 2);
  const cy = useSharedValue(DIAMOND_CELL / 2);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      prevAngle.value = Math.atan2(e.y - cy.value, e.x - cx.value);
    })
    .onUpdate((e) => {
      const a = Math.atan2(e.y - cy.value, e.x - cx.value);
      let d = a - prevAngle.value;
      // Unwrap so crossing the ±π seam doesn't jump.
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      spin.value += (d * 180) / Math.PI;
      prevAngle.value = a;
    })
    .onEnd((e) => {
      // Angular velocity ω = (r × v) / |r|², converted to deg/s, fed to a
      // decaying spin so the flick coasts to a stop.
      const rx = e.x - cx.value;
      const ry = e.y - cy.value;
      const r2 = rx * rx + ry * ry;
      const omega = r2 > 0 ? (rx * e.velocityY - ry * e.velocityX) / r2 : 0;
      // Boost the flick (more momentum) and lower friction (deceleration nearer
      // 1.0) so it really winds up and keeps spinning for a good while.
      spin.value = withDecay({
        velocity: ((omega * 180) / Math.PI) * 2.2,
        deceleration: 0.9995,
      });
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success && prompt) runOnJS(onOpen)();
    });

  const composed = Gesture.Race(tap, pan);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={[styles.diamondCell, { alignSelf: 'center' }]}
        onLayout={(e) => {
          cx.value = e.nativeEvent.layout.width / 2;
          cy.value = e.nativeEvent.layout.height / 2;
        }}
      >
        <Reanimated.View style={[StyleSheet.absoluteFill, spinStyle]}>
          <View style={[styles.diamondShape, styles.diamondAccent]} />
          {prompt && (
            <View pointerEvents="none" style={styles.diamondSparkleLayer}>
              {DIAMOND_SPARKLES.map((s, i) => (
                <Sparkle key={i} angle={s.angle} r={s.r} delay={s.delay} size={s.size} />
              ))}
            </View>
          )}
          <View style={styles.diamondContent}>
            <Text style={styles.diamondHeading}>week's{'\n'}prompt</Text>
            {prompt && <Text style={styles.diamondSub}>{prompt.title}</Text>}
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  const [prompt, setPrompt] = useState<PromptOut | null>(null);
  // Distinguish "still fetching" (show the skeleton circle so it appears in
  // sync with the rest of the page) from "resolved, no active prompt" (render
  // nothing). Starts true so the banner shell paints on the first frame.
  const [promptLoading, setPromptLoading] = useState(true);

  // Home toy mode: 'fidget' (spinning diamond, the default) or 'bounce'
  // (slingshot ball). Persisted so it reopens in the last-used mode.
  const [mode, setMode] = useState<'fidget' | 'bounce'>('fidget');
  useEffect(() => {
    SecureStore.getItemAsync('home_toy_mode')
      .then((v) => { if (v === 'bounce' || v === 'fidget') setMode(v); })
      .catch(() => {});
  }, []);
  const changeMode = (m: 'fidget' | 'bounce') => {
    setMode(m);
    SecureStore.setItemAsync('home_toy_mode', m).catch(() => {});
  };

  // Fidget spinner is hidden for now (SHOW_FIDGET). When it's off, the Home toy
  // is always the bouncing balls and the ∗/○ toggle disappears.
  const showBounce = !SHOW_FIDGET || mode === 'bounce';
  const showFidget = SHOW_FIDGET && mode === 'fidget';

  // Admin-only: pending account/media requests. total > 0 only for admins, so
  // the alert below is implicitly admin-gated.
  const adminPending = useAdminPending();
  const adminAlertLabel = (() => {
    const parts: string[] = [];
    if (adminPending.applications > 0) parts.push(`${adminPending.applications} account`);
    if (adminPending.media > 0) parts.push(`${adminPending.media} media`);
    return `${parts.join(' + ')} request${adminPending.total === 1 ? '' : 's'} to review`;
  })();

  useEffect(() => {
    let cancelled = false;
    setPromptLoading(true);
    get_active_prompt(token)
      .then((p) => { if (!cancelled) setPrompt(p); })
      .catch(() => { if (!cancelled) setPrompt(null); })
      .finally(() => { if (!cancelled) setPromptLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <View style={[styles.gradient, styles.homeBg]}>
    {/* The bouncing balls ride a full-bleed layer BEHIND everything below, so
        they pass behind the title and the corner buttons. Bounded to the Home
        area (which sits above the tab bar), so they never reach the nav bar. */}
    {showBounce && (
      <BounceArena
        prompt={prompt}
        topInset={insets.top}
        onOpenPrompt={() => prompt && navigation.navigate('WeeklyPromptDetail', { promptId: prompt.id })}
        onOpenEvent={() => navigation.navigate('Events')}
      />
    )}
    {/* Fixed (non-scrollable) so vertical flicks spin the diamond instead of
        being captured by a scroll view. box-none in bounce mode lets touches on
        empty areas fall through to the balls behind. */}
    <View
      style={[styles.container, styles.content, { paddingTop: insets.top + 20 }]}
      pointerEvents={showBounce ? 'box-none' : 'auto'}
    >
      <Text style={styles.homeTitle}>paint club</Text>

      {adminPending.total > 0 && (
        <Pressable style={styles.adminAlert} onPress={() => (navigation as any).navigate('Admin')}>
          <View style={styles.adminAlertDot} />
          <Text style={styles.adminAlertText}>{adminAlertLabel}</Text>
        </Pressable>
      )}

      {/* Live announcements feed card. Renders nothing when empty for
          non-contributors, so Home stays minimal until there's something to say. */}
      <Announcements />

      {SHOW_INTRO && (
        <>
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{'-• Painting Club •-'}</Text>
          </View>

          <View style={styles.messageContainer}>
            <Image
              source={require('../../assets/imgs/groups.png')}
              style={styles.messageImage}
              resizeMode="contain"
            />
            <Text style={styles.messageText}>Welcome to Painting Club.</Text>
            <View style={styles.spacer} />
            <Text style={styles.messageText}>I built this space for artists to share their art.</Text>
            <View style={styles.spacer} />
            <Text style={styles.messageText}>The goal is to center art around sincerity.</Text>
          </View>
        </>
      )}

      {/* Fidget spinner lives centered in the available height. In bounce mode
          the ball is the full-screen layer above, so this stays empty and
          passes touches through to it. */}
      <View
        style={styles.diamondsWrap}
        pointerEvents={showBounce ? 'none' : 'auto'}
      >
        {showFidget && (
          <SpinningPromptDiamond
            prompt={prompt}
            onOpen={() => prompt && navigation.navigate('WeeklyPromptDetail', { promptId: prompt.id })}
          />
        )}
      </View>

      {SHOW_FONT_SAMPLES && (
        <View style={styles.samples}>
          {FONT_SAMPLES.map((f) => (
            <View key={f.label}>
              <Text style={styles.sampleLabel}>{f.label}</Text>
              <Text style={[styles.sampleText, { fontFamily: f.family, fontWeight: f.weight }]}>painting club</Text>
            </View>
          ))}
        </View>
      )}

    </View>

    {/* fidget (∗) / bounce (○) toggle — hidden while SHOW_FIDGET is off. */}
    {SHOW_FIDGET && (
      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeChip, mode === 'fidget' && styles.modeChipOn]}
          onPress={() => changeMode('fidget')}
          hitSlop={6}
        >
          <Text style={styles.modeChipIcon}>∗</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, styles.modeChipBottom, mode === 'bounce' && styles.modeChipOn]}
          onPress={() => changeMode('bounce')}
          hitSlop={6}
        >
          <Text style={styles.modeChipIcon}>○</Text>
        </Pressable>
      </View>
    )}

    {/* Pinned to the bottom-left corner of the screen. */}
    <Pressable style={styles.aboutBtn} onPress={() => navigation.navigate('About')}>
      <Text style={styles.aboutBtnText}>about the app</Text>
    </Pressable>

    {/* Pinned to the bottom-right corner, mirroring "about the app". */}
    <Pressable style={styles.requestBtn} onPress={() => navigation.navigate('RequestFeature')}>
      <Text style={styles.requestBtnText}>request something for the app</Text>
    </Pressable>
    </View>
  );
}


const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  homeBg: {
    backgroundColor: 'rgb(216, 237, 138)',
  },
  homeTitle: {
    fontFamily: 'CourierNewPS-BoldMT',
    fontSize: 30,
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 8,
  },
  aboutBtn: {
    position: 'absolute',
    left: 20,
    bottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aboutBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  requestBtn: {
    position: 'absolute',
    right: 20,
    bottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  requestBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },

  adminAlert: {
    alignSelf: 'center',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adminAlertDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E30022',
  },
  adminAlertText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  modeToggle: {
    position: 'absolute',
    left: 20,
    bottom: 54,
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#000',
  },
  modeChip: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  // Hairline between the stacked chips.
  modeChipBottom: {
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  modeChipOn: {
    backgroundColor: Colors.primaryGold,
  },
  modeChipIcon: {
    fontSize: 18,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  bounceLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // top set inline to the safe-area inset so the ball clears the notch.
    overflow: 'hidden',
  },
  ball: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: Colors.secondary,
    borderWidth: 6,
    borderColor: '#E30022',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...Shadows.card,
  },
  diamondsWrap: {
    // Fill the space below the title and center the chain vertically so the
    // zigzag sits evenly in the available height rather than bunching at top.
    flex: 1,
    justifyContent: 'center',
    marginTop: 8,
  },
  diamondCell: {
    width: DIAMOND_CELL,
    height: DIAMOND_CELL,
    position: 'relative',
  },
  diamondShape: {
    position: 'absolute',
    width: DIAMOND_INNER,
    height: DIAMOND_INNER,
    top: DIAMOND_OFFSET,
    left: DIAMOND_OFFSET,
    transform: [{ rotate: '45deg' }],
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: '#000',
    ...Shadows.card,
  },
  diamondAccent: {
    borderColor: '#E30022',
    borderWidth: 6,
  },
  diamondSparkleLayer: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    left: (DIAMOND_CELL - CIRCLE_SIZE) / 2,
    top: (DIAMOND_CELL - CIRCLE_SIZE) / 2,
  },
  diamondContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: DIAMOND_CELL * 0.2,
  },
  diamondHeading: {
    fontFamily: 'CourierNewPS-BoldMT',
    fontSize: 17,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
  },
  diamondSub: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  diamondMuted: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  eventsBox: {
    marginTop: 28,
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: '#000',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...Shadows.card,
  },
  eventsTitle: {
    fontFamily: 'CourierNewPS-BoldMT',
    fontSize: 22,
    color: Colors.textPrimary,
  },
  eventsSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 6,
  },
  samples: {
    gap: 20,
    paddingTop: 8,
  },
  sampleLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(40, 60, 10, 0.55)',
    marginBottom: 2,
  },
  sampleText: {
    fontSize: 34,
    color: '#1a1a1a',
  },
  container: {
    flex: 1,
    // Transparent so the LinearGradient backdrop shows through.
    backgroundColor: 'transparent',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    // Let the diamonds wrap stretch to fill the height below the title.
    flexGrow: 1,
  },
  titleContainer: {
    // Same cream as the blurb box and the tab bar — title + blurb read as
    // one surface family, floated on the blue page background.
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: '#000',
    padding: 16,
    alignItems: 'center',
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.textPrimary,
  },
  messageContainer: {
    // Match the bottom tab bar so the page bottom and the message panel
    // read as one surface family.
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    marginTop: 20,
    ...Shadows.card,
  },
  messageImage: {
    // Explicit width + height (no aspectRatio shorthand) so RN can't fall
    // back to the source's native dimensions, which were 450x582 and would
    // make this fill the screen.
    alignSelf: 'center',
    width: 80,
    height: 104,
    marginTop: 8,
    marginBottom: 8,
  },
  messageText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  spacer: {
    height: 14,
  },
  promptBannerWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  promptBanner: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: Colors.secondary,
    borderWidth: 6,
    borderColor: '#E30022',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 6,
    ...Shadows.card,
  },
  promptBannerPressed: {
    opacity: 0.85,
  },
  promptBannerHeading: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  promptBannerTitle: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  promptBannerMedium: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  // Placeholder bars shown inside the circle while the prompt is loading, so
  // the banner appears in sync with the page and fills in a beat later.
  skeletonLineWide: {
    width: '70%',
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  skeletonLineNarrow: {
    width: '45%',
    height: 11,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  sparkle: {
    position: 'absolute',
    width: 18,
    height: 18,
    textAlign: 'center',
    fontSize: 16,
    color: '#E30022',
  },
});
