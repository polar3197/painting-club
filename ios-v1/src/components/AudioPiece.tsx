import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
  PanResponder,
  Animated,
} from 'react-native';
import * as ExpoAudio from 'expo-audio';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAuth } from '../context/AuthContext';
import { remove_audio, resolveImageUrl, AudioOut } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// True when this bundle runs against the OTA stub (build #8 lacks the native
// module) — playback controls are hidden in favour of an update hint.
const AUDIO_IS_STUB = (ExpoAudio as any).IS_STUB === true;

// One-at-a-time playback: starting any player pauses whichever other player
// was going. Module-scoped so it spans every tile (and the AddArt preview).
let _activePause: (() => void) | null = null;
function claimPlayback(pauseSelf: () => void) {
  if (_activePause && _activePause !== pauseSelf) _activePause();
  _activePause = pauseSelf;
}
function releasePlayback(pauseSelf: () => void) {
  if (_activePause === pauseSelf) _activePause = null;
}

interface AudioPieceProps {
  isOwner: boolean;
  piece: AudioOut;
  onRemove: () => void;
  onEdit: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Little animated level bars shown while a track plays (echoes the recorder's
// live waveform). Purely decorative — staggered scaleY loops on the native
// driver, so it costs nothing on the JS thread.
const EQ_BARS = [0, 1, 2, 3];
const EQ_DURATIONS = [340, 260, 420, 300];

function EqBars({ playing }: { playing: boolean }) {
  const anims = useRef(EQ_BARS.map(() => new Animated.Value(0.25))).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (playing) {
      loops.current = anims.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: EQ_DURATIONS[i], useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.2, duration: EQ_DURATIONS[(i + 2) % 4], useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.65, duration: EQ_DURATIONS[(i + 1) % 4], useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.3, duration: EQ_DURATIONS[(i + 3) % 4], useNativeDriver: true }),
          ]),
        ),
      );
      loops.current.forEach((l) => l.start());
    } else {
      loops.current.forEach((l) => l.stop());
      anims.forEach((v) =>
        Animated.timing(v, { toValue: 0.25, duration: 160, useNativeDriver: true }).start(),
      );
    }
    return () => loops.current.forEach((l) => l.stop());
  }, [playing]);

  return (
    <View style={styles.eqWrap}>
      {EQ_BARS.map((i) => (
        <Animated.View key={i} style={[styles.eqBar, { transform: [{ scaleY: anims[i] }] }]} />
      ))}
    </View>
  );
}

/**
 * The actual player. Mounted lazily (only after the first play tap) so a
 * profile with many tracks doesn't spin up a native player per tile up front.
 * Once mounted it auto-plays; background playback is handled globally by the
 * setAudioModeAsync call in App.tsx + UIBackgroundModes in app.json.
 */
export function AudioPlayerBar({
  uri,
  fallbackDuration,
  autoPlay = true,
  onDuration,
}: {
  uri: string;
  fallbackDuration: number | null;
  // false = preview mode (AddArt pre-listen): mount silently, play on demand.
  autoPlay?: boolean;
  // Reports the measured duration once the file loads (used to capture
  // duration_seconds at upload time).
  onDuration?: (seconds: number) => void;
}) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [trackW, setTrackW] = useState(0);
  // Local scrub position while dragging so the thumb tracks the finger 1:1
  // instead of waiting for the (slightly lagged) status.currentTime to catch up.
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);

  // Stable pause closure for the one-at-a-time registry.
  const pauseSelfRef = useRef<() => void>(() => {});
  pauseSelfRef.current = () => player.pause();
  const pauseSelf = useRef(() => pauseSelfRef.current()).current;

  const startPlay = () => {
    claimPlayback(pauseSelf);
    player.play();
  };

  // Auto-play on mount (profile tiles only mount this after the play tap).
  useEffect(() => {
    if (autoPlay) startPlay();
    return () => releasePlayback(pauseSelf);
  }, []);

  // Surface the real duration to the parent once known.
  useEffect(() => {
    if (onDuration && status.duration > 0) onDuration(status.duration);
  }, [status.duration]);

  // When a track finishes, rewind + pause so the play button is ready to replay
  // rather than leaving it stuck at the end.
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish]);

  const duration = status.duration || fallbackDuration || 0;
  const frac = scrubFrac != null
    ? scrubFrac
    : duration > 0
    ? Math.min(1, status.currentTime / duration)
    : 0;

  const seekToFrac = (f: number) => {
    const clamped = Math.max(0, Math.min(1, f));
    if (duration > 0) player.seekTo(clamped * duration);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (trackW > 0) setScrubFrac(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW)));
      },
      onPanResponderMove: (e) => {
        if (trackW > 0) setScrubFrac(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW)));
      },
      onPanResponderRelease: (e) => {
        if (trackW > 0) {
          const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW));
          seekToFrac(f);
        }
        setScrubFrac(null);
      },
      onPanResponderTerminate: () => setScrubFrac(null),
    })
  ).current;

  const displayedTime = scrubFrac != null ? scrubFrac * duration : status.currentTime;

  return (
    <View style={styles.playerBar}>
      <Pressable
        style={styles.playBtn}
        onPress={() => (status.playing ? player.pause() : startPlay())}
      >
        <Text style={styles.playBtnText}>
          {!status.isLoaded ? '…' : status.playing ? '❚❚' : '▶'}
        </Text>
      </Pressable>
      <EqBars playing={status.playing} />
      <View style={styles.scrubCol}>
        <View
          style={styles.track}
          onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
          {...pan.panHandlers}
        >
          <View style={styles.trackBase} />
          <View style={[styles.trackFill, { width: `${frac * 100}%` }]} />
          <View style={[styles.trackThumb, { left: Math.max(0, frac * trackW - 6) }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmtTime(displayedTime)}</Text>
          <Text style={styles.timeText}>{fmtTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AudioPiece({ isOwner, piece, onRemove, onEdit, onLayout }: AudioPieceProps) {
  const { token } = useAuth();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const uri = resolveImageUrl(piece.file_path);

  const removeArt = async () => {
    await remove_audio(piece.id, token);
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
      <View style={styles.element} onLayout={onLayout}>
        <View style={styles.headerRow}>
          <View style={styles.titleCol}>
            <Text style={styles.artTitle} numberOfLines={2}>{piece.title}</Text>
            {!!piece.artist && <Text style={styles.detailText}>{piece.artist}</Text>}
            {!!piece.date && <Text style={styles.detailText}>{piece.date}</Text>}
          </View>
        </View>

        {AUDIO_IS_STUB ? (
          <View style={[styles.bigPlay, styles.bigPlayDisabled]}>
            <Text style={styles.bigPlayLabel}>update the app to play audio</Text>
          </View>
        ) : (
          <AudioPlayerBar
            uri={uri}
            fallbackDuration={piece.duration_seconds}
            autoPlay={false}
          />
        )}

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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  element: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 12,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  artTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  detailText: {
    fontSize: FontSizes.xs,
  },
  durationBadge: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bigPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 14,
    marginBottom: 10,
  },
  bigPlayIcon: {
    fontSize: 20,
    color: Colors.black,
  },
  bigPlayDisabled: {
    opacity: 0.45,
    borderStyle: 'dashed',
  },
  bigPlayLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  // Player bar
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    padding: 10,
    marginBottom: 10,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: {
    fontSize: 16,
    color: Colors.black,
  },
  // Playback level bars (between play button and scrubber).
  eqWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  eqBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
    backgroundColor: Colors.black,
  },
  scrubCol: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 18,
    justifyContent: 'center',
  },
  trackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.textMuted,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    backgroundColor: Colors.black,
  },
  // Base (unfilled) line drawn under the fill via the track's own border-less
  // background; we add a thin baseline using a pseudo layer.
  trackThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  buttons: {
    flexDirection: 'row',
    gap: 6,
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
