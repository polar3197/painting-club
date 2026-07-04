import React, { useState } from 'react';
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

/**
 * In-app voice memo recorder for the audio share flow — record right here
 * instead of round-tripping through Voice Memos + Files. Uses the same boxed
 * design language as the player bar. Only rendered on builds with the real
 * expo-audio module (callers gate on the shim's IS_STUB flag).
 */
export default function VoiceRecorder({ onRecorded }: VoiceRecorderProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);

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
    return (
      <View style={[styles.bar, styles.barRecording]}>
        <View style={styles.dot} />
        <Text style={styles.timer}>recording {fmtTime(state.durationMillis / 1000)}</Text>
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
    paddingHorizontal: 14,
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
  timer: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
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
