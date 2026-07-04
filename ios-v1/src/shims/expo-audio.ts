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

// Lets OTA code detect it's running against the stub (real module lacks this)
// and degrade gracefully instead of rendering dead controls.
export const IS_STUB = true;

// --- Recording stubs (VoiceRecorder is hidden on stub builds, but the bundle
// still needs these exports to resolve) ---
export const RecordingPresets = { HIGH_QUALITY: {}, LOW_QUALITY: {} };

export async function requestRecordingPermissionsAsync() {
  return { granted: false, status: 'denied' as const };
}

export function useAudioRecorder(_options?: unknown) {
  return {
    id: 0,
    uri: null as string | null,
    currentTime: 0,
    isRecording: false,
    record() {},
    async stop() {},
    async prepareToRecordAsync() {},
  };
}

export function useAudioRecorderState(_recorder?: unknown) {
  return {
    canRecord: false,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null as string | null,
  };
}
