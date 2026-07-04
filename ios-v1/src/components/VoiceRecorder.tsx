import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface VoiceRecorderProps {
  // Called with the finished recording, ready to drop into the upload flow.
  onRecorded: (file: { uri: string; name: string; type: string }, durationSeconds: number) => void;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Live waveform strip (à la Voice Memos): one bar per recent metering sample,
// scrolling left as new samples arrive.
const WAVE_BARS = 28;
const BAR_MAX = 22;
const BAR_MIN = 2;

// Normalize a dB metering value (~ -50..0) to a bar height.
function meterToHeight(db: number | undefined): number {
  if (db == null || !isFinite(db)) return BAR_MIN;
  const clamped = Math.max(-50, Math.min(0, db));
  const frac = (clamped + 50) / 50;
  return BAR_MIN + frac * (BAR_MAX - BAR_MIN);
}

/**
 * In-app voice memo recorder for the audio share flow — record right here
 * instead of round-tripping through Voice Memos + Files. Uses the same boxed
 * design language as the player bar. Only rendered on builds with the real
 * expo-audio module (callers gate on the shim's IS_STUB flag).
 */
export default function VoiceRecorder({ onRecorded }: VoiceRecorderProps) {
  // Metering feeds the live waveform; poll fast enough for it to feel alive.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 90);
  const [busy, setBusy] = useState(false);

  // Rolling buffer of recent bar heights. Pushed on every state poll while
  // recording (the poll itself re-renders, so a ref is enough).
  const waveRef = useRef<number[]>([]);
  if (state.isRecording) {
    const next = [...waveRef.current, meterToHeight(state.metering)];
    waveRef.current = next.slice(-WAVE_BARS);
  }

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'microphone',
          'painting club needs microphone access to record — enable it in Settings.',
        );
        return;
      }
      // iOS: the session must allow recording while we capture.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      waveRef.current = [];
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e: any) {
      Alert.alert('recording failed', e?.message || 'could not start recording');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const seconds = state.durationMillis / 1000;
      await recorder.stop();
      // Restore the playback session config from App.tsx.
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
      }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert('recording failed', 'no audio was captured');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      onRecorded({ uri, name: `memo ${stamp}.m4a`, type: 'audio/m4a' }, seconds);
    } catch (e: any) {
      Alert.alert('recording failed', e?.message || 'could not stop recording');
    } finally {
      setBusy(false);
    }
  };

  if (state.isRecording) {
    const bars = waveRef.current;
    return (
      <View style={[styles.bar, styles.barRecording]}>
        <View style={styles.dot} />
        <View style={styles.wave}>
          {Array.from({ length: WAVE_BARS }).map((_, i) => {
            // Right-align the newest sample; empty slots stay at min height.
            const h = bars[bars.length - WAVE_BARS + i] ?? BAR_MIN;
            return <View key={i} style={[styles.waveBar, { height: h }]} />;
          })}
        </View>
        <Text style={styles.timer}>{fmtTime(state.durationMillis / 1000)}</Text>
        <Pressable style={styles.stopBtn} onPress={stop} hitSlop={8}>
          <Text style={styles.stopBtnText}>stop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.bar} onPress={start}>
      <Text style={styles.micIcon}>●</Text>
      <Text style={styles.label}>or record a voice memo here</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    marginTop: 8,
  },
  barRecording: {
    backgroundColor: Colors.redLight,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  micIcon: {
    fontSize: 12,
    color: Colors.redCoral,
  },
  label: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.black,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.redCoral,
    borderWidth: 1,
    borderColor: '#000',
  },
  wave: {
    flex: 1,
    height: BAR_MAX + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  waveBar: {
    flex: 1,
    minWidth: 2,
    borderRadius: 1,
    backgroundColor: Colors.black,
  },
  timer: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  stopBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  stopBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
});
