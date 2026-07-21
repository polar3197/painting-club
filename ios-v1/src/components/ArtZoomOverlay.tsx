import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

// Root-level host for the feed's transient pinch-zoom. The zooming card
// can't escape the header/nav-bar stacking contexts with zIndex alone, so
// the pinched image hides itself in place and a copy is rendered here —
// mounted above the navigator in App.tsx — driven by the same shared values
// the gesture writes. Module-level bridge, same pattern as AppAlertHost.

export type ArtZoomConfig = {
  source: { uri: string; headers?: Record<string, string>; cacheKey?: string };
  x: number;
  y: number;
  width: number;
  height: number;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  // Initial pinch focal point in element coordinates (finger midpoint on
  // native, cursor on web) — the zoom anchors here, not the image center.
  startX: SharedValue<number>;
  startY: SharedValue<number>;
};

let showFn: ((cfg: ArtZoomConfig) => void) | null = null;
let hideFn: (() => void) | null = null;

export function showArtZoom(cfg: ArtZoomConfig) {
  if (showFn) showFn(cfg);
}
export function hideArtZoom() {
  if (hideFn) hideFn();
}

export default function ArtZoomOverlayHost() {
  const [cfg, setCfg] = useState<ArtZoomConfig | null>(null);
  useEffect(() => {
    showFn = setCfg;
    hideFn = () => setCfg(null);
    return () => {
      showFn = null;
      hideFn = null;
    };
  }, []);
  if (!cfg) return null;
  return <Overlay cfg={cfg} />;
}

// Separate component so the animated-style hooks only run while a zoom is
// live (cfg's shared values are stable for the life of one zoom).
function Overlay({ cfg }: { cfg: ArtZoomConfig }) {
  const dimStyle = useAnimatedStyle(() => ({
    // Instagram-style: the world falls away as the piece grows.
    opacity: interpolate(cfg.scale.value, [1, 1.8], [0, 0.55], Extrapolation.CLAMP),
  }));
  const imgStyle = useAnimatedStyle(() => {
    // Anchor the scale at the initial focal point: RN scales about the
    // element center, so shift that center to the focal point, scale, and
    // shift back. tx/ty carry the focal drift on top.
    const fx = cfg.startX.value - cfg.width / 2;
    const fy = cfg.startY.value - cfg.height / 2;
    return {
      transform: [
        { translateX: cfg.tx.value },
        { translateY: cfg.ty.value },
        { translateX: fx },
        { translateY: fy },
        { scale: cfg.scale.value },
        { translateX: -fx },
        { translateY: -fy },
      ],
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
      <Reanimated.View
        style={[
          { position: 'absolute', left: cfg.x, top: cfg.y, width: cfg.width, height: cfg.height },
          imgStyle,
        ]}
      >
        <Image
          source={cfg.source}
          style={styles.img}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000',
  },
  img: {
    width: '100%',
    height: '100%',
  },
});
