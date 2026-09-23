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
import {
  playTrack,
  getActiveUri,
  getActivePlayer,
  subscribeActiveTrack,
  claimPlayback,
  releasePlayback,
} from '../audio/playback';
import { useAuth } from '../context/AuthContext';
import { remove_audio, resolveImageUrl, AudioOut } from '../api';
import ConfirmDialog from './ConfirmDialog';
import BookmarkButton from './BookmarkButton';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// True when this bundle runs against the OTA stub (build #8 lacks the native
// module) — playback controls are hidden in favour of an update hint.
const AUDIO_IS_STUB = (ExpoAudio as any).IS_STUB === true;

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
 * Shared scrubber track. Fixes two bugs the old per-bar PanResponders had:
 * (1) the responder closure captured trackW from the first render (always 0),
 * so every handler bailed and drags did nothing; (2) touches landing on the
 * thumb/fill children reported locationX relative to the child, not the track.
 * Geometry now lives in refs (always current inside the stable responder) and
 * moves use pageX against the track's left edge, so the drag keeps tracking
 * even when the finger wanders off the bar.
 */
function ScrubTrack({
  frac,
  onPreview,
  onCommit,
}: {
  frac: number;
  // Live fraction while dragging (null = drag ended/cancelled).
  onPreview: (f: number | null) => void;
  // Final fraction on release.
  onCommit: (f: number) => void;
}) {
  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);
  const trackLeftRef = useRef(0);
  const cbRef = useRef({ onPreview, onCommit });
  cbRef.current = { onPreview, onCommit };

  const fracFromPageX = (pageX: number) => {
    const w = trackWRef.current;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(1, (pageX - trackLeftRef.current) / w));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Don't let the surrounding ScrollView steal the drag mid-scrub.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // Children are pointerEvents:none, so locationX is track-relative —
        // anchoring the track's page-left here survives any prior scrolling.
        trackLeftRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        cbRef.current.onPreview(fracFromPageX(e.nativeEvent.pageX));
      },
      onPanResponderMove: (e) => {
        cbRef.current.onPreview(fracFromPageX(e.nativeEvent.pageX));
      },
      onPanResponderRelease: (e) => {
        cbRef.current.onCommit(fracFromPageX(e.nativeEvent.pageX));
        cbRef.current.onPreview(null);
      },
      onPanResponderTerminate: () => cbRef.current.onPreview(null),
    })
  ).current;

  return (
    <View
      style={styles.track}
      onLayout={(e: LayoutChangeEvent) => {
        trackWRef.current = e.nativeEvent.layout.width;
        setTrackW(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={styles.trackBase} />
      <View pointerEvents="none" style={[styles.trackFill, { width: `${frac * 100}%` }]} />
      <View pointerEvents="none" style={[styles.trackThumb, { left: Math.max(0, frac * trackW - 6) }]} />
    </View>
  );
}

/**
 * Profile-tile player bar, bound to the app-wide playback singleton — audio
 * keeps playing when the user navigates anywhere else; only starting another
 * track (or pausing) stops it. While this tile's track isn't the active one,
 * an idle bar renders (play button + stored duration) and tapping play claims
 * the global player. `queue` is the surrounding album's ordered uris — every
 * play started from this bar carries it so finished tracks auto-advance.
 */
export function AudioPlayerBar({
  uri,
  fallbackDuration,
  queue,
}: {
  uri: string;
  fallbackDuration: number | null;
  queue?: string[];
}) {
  // Re-render when the active track changes so tiles swap active/idle modes.
  const [, setTick] = useState(0);
  useEffect(() => subscribeActiveTrack(() => setTick((t) => t + 1)), []);

  const active = getActiveUri() === uri && !!getActivePlayer();
  if (active) {
    return <ActiveTrackBar uri={uri} fallbackDuration={fallbackDuration} queue={queue} />;
  }
  return <IdleTrackBar uri={uri} fallbackDuration={fallbackDuration} queue={queue} />;
}

// Idle (not-the-active-track) bar. The scrubber is still live: dragging the
// dot starts playback from the dragged position (using the stored duration
// for the math), so seeking works without a prior play tap.
function IdleTrackBar({ uri, fallbackDuration, queue }: { uri: string; fallbackDuration: number | null; queue?: string[] }) {
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);

  const frac = scrubFrac ?? 0;
  const displayed = frac * (fallbackDuration || 0);

  return (
    <View style={styles.playerBar}>
      <Pressable style={styles.playBtn} onPress={() => playTrack(uri, undefined, queue)}>
        <Text style={styles.playBtnText}>▶</Text>
      </Pressable>
      <EqBars playing={false} />
      <View style={styles.scrubCol}>
        <ScrubTrack
          frac={frac}
          onPreview={setScrubFrac}
          onCommit={(f) => playTrack(uri, (fallbackDuration || 0) * f, queue)}
        />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmtTime(displayed)}</Text>
          <Text style={styles.timeText}>{fmtTime(fallbackDuration || 0)}</Text>
        </View>
      </View>
    </View>
  );
}

// The bound (active-track) bar: full controls against the global player.
function ActiveTrackBar({ uri, fallbackDuration, queue }: { uri: string; fallbackDuration: number | null; queue?: string[] }) {
  const player = getActivePlayer()!;
  const status = useAudioPlayerStatus(player);
  // Local scrub position while dragging so the thumb tracks the finger 1:1
  // instead of waiting for the (slightly lagged) status.currentTime to catch up.
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);

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

  const displayedTime = scrubFrac != null ? scrubFrac * duration : status.currentTime;

  return (
    <View style={styles.playerBar}>
      <Pressable
        style={styles.playBtn}
        onPress={() => (status.playing ? player.pause() : playTrack(uri, undefined, queue))}
      >
        <Text style={styles.playBtnText}>
          {!status.isLoaded ? '…' : status.playing ? '❚❚' : '▶'}
        </Text>
      </Pressable>
      <EqBars playing={status.playing} />
      <View style={styles.scrubCol}>
        <ScrubTrack frac={frac} onPreview={setScrubFrac} onCommit={seekToFrac} />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmtTime(displayedTime)}</Text>
          <Text style={styles.timeText}>{fmtTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Pre-listen bar for the share/edit flows. Owns a LOCAL player (released when
 * the form unmounts — previews shouldn't outlive the flow) and reports the
 * measured duration for the upload payload. Coordinates with the global
 * player through the claim registry so only one thing plays at a time.
 */
export function AudioPreviewBar({
  uri,
  onDuration,
}: {
  uri: string;
  onDuration?: (seconds: number) => void;
}) {
  // Tighter update interval than the 500ms default: the play/pause icon and the
  // play-vs-pause decision were lagging reality and desyncing on rapid taps.
  const player = useAudioPlayer({ uri }, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);

  // Stable pause closure for the one-at-a-time registry.
  const pauseSelfRef = useRef<() => void>(() => {});
  pauseSelfRef.current = () => player.pause();
  const pauseSelf = useRef(() => pauseSelfRef.current()).current;

  useEffect(() => () => releasePlayback(pauseSelf), []);

  // A freshly recorded take can leave the iOS session in record mode; re-assert
  // playback so the just-recorded file is audible on the first tap.
  useEffect(() => {
    ExpoAudio.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, []);

  // Branch off the player's SYNCHRONOUS state, not the (lagged) status snapshot,
  // and never call play() before the item is loaded — that no-op was the
  // "recorded memo won't play," and the stale-status branch was the play/pause
  // spam getting stuck.
  const toggle = () => {
    if (!player.isLoaded) return;
    if (player.playing) {
      player.pause();
    } else {
      claimPlayback(pauseSelf);
      player.play();
    }
  };

  useEffect(() => {
    if (onDuration && status.duration > 0) onDuration(status.duration);
  }, [status.duration]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish]);

  const duration = status.duration || 0;
  const frac = scrubFrac != null ? scrubFrac : duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const displayedTime = scrubFrac != null ? scrubFrac * duration : status.currentTime;

  return (
    <View style={styles.playerBar}>
      <Pressable style={styles.playBtn} onPress={toggle}>
        <Text style={styles.playBtnText}>
          {!status.isLoaded ? '…' : status.playing ? '❚❚' : '▶'}
        </Text>
      </Pressable>
      <EqBars playing={status.playing} />
      <View style={styles.scrubCol}>
        <ScrubTrack
          frac={frac}
          onPreview={setScrubFrac}
          onCommit={(f) => { if (duration > 0) player.seekTo(f * duration); }}
        />
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
  // Collapsed by default: the tile shows only its title + a play button, so a
  // long list of songs reads as a compact tracklist. Tapping the title or the
  // play button opens the scrubber and the owner's edit/remove controls.
  const [expanded, setExpanded] = useState(false);

  const uri = resolveImageUrl(piece.file_path);

  // Follow global playback: if this track becomes the active one (its play was
  // tapped, or it auto-advanced into focus), open so the live scrubber shows.
  useEffect(
    () =>
      subscribeActiveTrack(() => {
        if (getActiveUri() === uri) setExpanded(true);
      }),
    [uri],
  );

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
          <Pressable style={styles.titleCol} onPress={() => setExpanded((v) => !v)}>
            <Text style={styles.artTitle} numberOfLines={2}>{piece.title}</Text>
            {!!piece.artist && <Text style={styles.detailText}>{piece.artist}</Text>}
          </Pressable>
          {!AUDIO_IS_STUB && !expanded && (
            <Pressable
              style={({ pressed }) => [styles.rowPlayBtn, pressed && { opacity: 0.7 }]}
              onPress={() => { playTrack(uri); setExpanded(true); }}
              hitSlop={6}
            >
              <Text style={styles.rowPlayText}>▶</Text>
            </Pressable>
          )}
          {/* Always in the header, right of the play button (or far right when
              the track is expanded and the play button moves into the body). */}
          <BookmarkButton artId={piece.id} size={34} />
        </View>

        {expanded && (
          <View style={styles.expandedBody}>
            {!!piece.date && <Text style={styles.detailText}>{piece.date}</Text>}
            {AUDIO_IS_STUB ? (
              <View style={[styles.bigPlay, styles.bigPlayDisabled]}>
                <Text style={styles.bigPlayLabel}>update the app to play audio</Text>
              </View>
            ) : (
              <AudioPlayerBar uri={uri} fallbackDuration={piece.duration_seconds} />
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
    alignItems: 'center',
    gap: 10,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  // Compact play button in the collapsed header (mirrors the album tracklist).
  rowPlayBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPlayText: {
    fontSize: 13,
    color: Colors.black,
  },
  expandedBody: {
    marginTop: 10,
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
