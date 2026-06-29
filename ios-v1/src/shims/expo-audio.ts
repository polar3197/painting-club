// OTA build-#8 compatibility shim — see metro.config.js.
// The live App Store binary predates the expo-audio native module, so this stub
// stands in for it in OTA bundles: audio playback is inert (no crash) until a
// native rebuild ships the real module. Remove the metro alias to restore it.

export async function setAudioModeAsync(_mode?: unknown): Promise<void> {}

export function useAudioPlayer(_source?: unknown) {
  return {
    play() {},
    pause() {},
    seekTo(_seconds: number) {},
    remove() {},
  };
}

export function useAudioPlayerStatus(_player?: unknown) {
  return {
    playing: false,
    isLoaded: false,
    duration: 0,
    currentTime: 0,
    didJustFinish: false,
  };
}
