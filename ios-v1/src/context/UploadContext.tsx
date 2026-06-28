import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import {
  add_new_visual_2d,
  add_new_written_form,
  add_new_audio,
  Visual2DIn,
  WrittenFormIn,
  AudioIn,
} from '../api';
import { useAuth } from './AuthContext';

// Optimistic upload state lives here (rather than inside UserProfile) so the
// global "+" Add flow can kick off an upload and then navigate the user to the
// destination profile, where the placeholder/spinner tile shows up while the
// request is in flight. Pending entries carry username+medium so a profile only
// renders the tiles that belong to the view being shown.
export interface PendingVisual {
  tempId: string;
  username: string;
  medium: string;
  uri: string;
  title: string;
  aspectRatio: number;
}
export interface PendingSimple {
  tempId: string;
  username: string;
  medium: string;
  title: string;
}

interface UploadContextValue {
  pendingPieces: PendingVisual[];
  pendingWritten: PendingSimple[];
  pendingAudio: PendingSimple[];
  // Bumps on every completed (or failed) upload so consumers can refetch.
  version: number;
  startUpload: (payload: Visual2DIn) => void;
  startWrittenUpload: (payload: WrittenFormIn) => void;
  startAudioUpload: (payload: AudioIn) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

function tempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [pendingPieces, setPendingPieces] = useState<PendingVisual[]>([]);
  const [pendingWritten, setPendingWritten] = useState<PendingSimple[]>([]);
  const [pendingAudio, setPendingAudio] = useState<PendingSimple[]>([]);
  const [version, setVersion] = useState(0);

  const startUpload = useCallback((payload: Visual2DIn) => {
    const id = tempId();
    const aspectRatio =
      payload.width && payload.height && payload.height > 0
        ? Number(payload.width) / Number(payload.height)
        : 1;
    setPendingPieces((p) => [
      ...p,
      {
        tempId: id,
        username: payload.username,
        medium: payload.medium,
        uri: payload.file.uri,
        title: payload.title || 'uploading…',
        aspectRatio,
      },
    ]);
    add_new_visual_2d(token, payload)
      .then(() => setVersion((v) => v + 1))
      .catch((err: any) => Alert.alert('Error', err?.message || 'Upload failed'))
      .finally(() => setPendingPieces((p) => p.filter((x) => x.tempId !== id)));
  }, [token]);

  const startWrittenUpload = useCallback((payload: WrittenFormIn) => {
    const id = tempId();
    setPendingWritten((p) => [
      ...p,
      { tempId: id, username: payload.username, medium: payload.medium, title: payload.title || 'uploading…' },
    ]);
    add_new_written_form(token, payload)
      .then(() => setVersion((v) => v + 1))
      .catch((err: any) => Alert.alert('Error', err?.message || 'Upload failed'))
      .finally(() => setPendingWritten((p) => p.filter((x) => x.tempId !== id)));
  }, [token]);

  const startAudioUpload = useCallback((payload: AudioIn) => {
    const id = tempId();
    setPendingAudio((p) => [
      ...p,
      { tempId: id, username: payload.username, medium: payload.medium, title: payload.title || 'uploading…' },
    ]);
    add_new_audio(token, payload)
      .then(() => setVersion((v) => v + 1))
      .catch((err: any) => Alert.alert('Error', err?.message || 'Upload failed'))
      .finally(() => setPendingAudio((p) => p.filter((x) => x.tempId !== id)));
  }, [token]);

  const value = useMemo(
    () => ({
      pendingPieces,
      pendingWritten,
      pendingAudio,
      version,
      startUpload,
      startWrittenUpload,
      startAudioUpload,
    }),
    [pendingPieces, pendingWritten, pendingAudio, version, startUpload, startWrittenUpload, startAudioUpload],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploads must be used within an UploadProvider');
  return ctx;
}
