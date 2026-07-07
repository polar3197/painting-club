// App-wide audio playback singleton.
//
// One player instance owned at module level — NOT by any component — so a
// track keeps playing while the user navigates anywhere in the app. The only
// thing that stops it is starting other audio (playTrack/claimPlayback) or
// pausing it explicitly. Background playback is covered by the audio-session
// config in App.tsx + UIBackgroundModes.
import { createAudioPlayer, AudioPlayer } from 'expo-audio';

let _player: AudioPlayer | null = null;
let _activeUri: string | null = null;
// Album queue: when the active track belongs to this ordered list, finishing
// it auto-advances to the next uri; the last track stops (no wrap-around).
// Starting playback from any non-album surface clears it.
let _queue: string[] = [];
const _listeners = new Set<() => void>();

// ---- one-at-a-time coordination (also spans the AddArt pre-listen player) --
let _activePause: (() => void) | null = null;
export function claimPlayback(pauseSelf: () => void) {
  if (_activePause && _activePause !== pauseSelf) _activePause();
  _activePause = pauseSelf;
}
export function releasePlayback(pauseSelf: () => void) {
  if (_activePause === pauseSelf) _activePause = null;
}
const _pauseGlobal = () => {
  try { _player?.pause(); } catch {}
};

// ---- active-track pub/sub ---------------------------------------------------
function notify() {
  _listeners.forEach((l) => l());
}
export function subscribeActiveTrack(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
export function getActiveUri(): string | null {
  return _activeUri;
}
export function getActivePlayer(): AudioPlayer | null {
  return _player;
}

// ---- finish handling ---------------------------------------------------------
// Advance through the album queue when there is one, else rewind + stop.
// Debounced so the event listener and the watchdog can't both fire for the
// same finish (that would skip a track).
let _lastFinishAt = 0;
function handleFinished() {
  const now = Date.now();
  if (now - _lastFinishAt < 1500) return;
  _lastFinishAt = now;
  const idx = _activeUri ? _queue.indexOf(_activeUri) : -1;
  if (idx >= 0 && idx < _queue.length - 1) {
    // Tear the player down for the hop: replace()+play() on a player that
    // ended naturally doesn't restart on device — a fresh create+play (the
    // same path as any first play) does.
    if (_player) {
      try { _player.remove(); } catch {}
      _player = null;
    }
    playTrack(_queue[idx + 1], undefined, _queue);
    return;
  }
  if (_player) {
    try {
      _player.seekTo(0);
      _player.pause();
    } catch {}
  }
}

// The didJustFinish event proved unreliable on-device, so a low-cost interval
// backstops it: a loaded track sitting paused at its own end has finished.
let _watchdog: ReturnType<typeof setInterval> | null = null;
function ensureWatchdog() {
  if (_watchdog) return;
  _watchdog = setInterval(() => {
    const p = _player;
    if (!p || !_activeUri) return;
    try {
      const dur = p.duration;
      if (!p.playing && dur > 0 && p.currentTime >= dur - 0.35) {
        handleFinished();
      }
    } catch {}
  }, 700);
}

// ---- controls ---------------------------------------------------------------
// `queue` is the album context of whoever started playback: album rows pass
// their ordered track list, standalone tiles pass nothing (clearing any queue).
export function playTrack(uri: string, startAtSeconds?: number, queue?: string[]): void {
  _queue = queue ?? [];
  claimPlayback(_pauseGlobal);
  ensureWatchdog();
  if (_player && _activeUri === uri) {
    if (startAtSeconds != null) {
      try { _player.seekTo(startAtSeconds); } catch {}
    }
    _player.play();
    return;
  }
  if (_player) {
    try {
      _player.pause();
      _player.replace({ uri });
    } catch {
      // replace failed (e.g. released player) — rebuild from scratch
      try { _player.remove(); } catch {}
      _player = null;
    }
  }
  if (!_player) {
    _player = createAudioPlayer({ uri });
    (_player as any).addListener?.('playbackStatusUpdate', (s: any) => {
      if (s?.didJustFinish && _player) handleFinished();
    });
  }
  _activeUri = uri;
  if (startAtSeconds != null && startAtSeconds > 0) {
    // Seek is queued against the freshly-loaded item; lets an idle-tile drag
    // start playback from the dragged position.
    try { _player.seekTo(startAtSeconds); } catch {}
  }
  _player.play();
  notify();
}

export function pauseActive(): void {
  _pauseGlobal();
}
