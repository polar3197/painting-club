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

// ---- controls ---------------------------------------------------------------
export function playTrack(uri: string): void {
  claimPlayback(_pauseGlobal);
  if (_player && _activeUri === uri) {
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
    // Rewind-on-finish handled centrally so every surface gets it.
    (_player as any).addListener?.('playbackStatusUpdate', (s: any) => {
      if (s?.didJustFinish && _player) {
        try {
          _player.seekTo(0);
          _player.pause();
        } catch {}
      }
    });
  }
  _activeUri = uri;
  _player.play();
  notify();
}

export function pauseActive(): void {
  _pauseGlobal();
}
