import { useEffect, useState } from 'react';
import { resolveImageUrl } from '../api';

const TEXT_EXTS = new Set(['txt', 'md']);

export function extFromPath(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isTextExt(ext: string): boolean {
  return TEXT_EXTS.has(ext);
}

/** Fetch a written-form file's text content, with an explicit error state and
 *  retry. `text` is null for non-text extensions and while the fetch is in
 *  flight; "" for an empty file. `error` turns true on network/HTTP failure
 *  (e.g. a 502 during an outage) instead of leaving callers stuck on
 *  "loading…" forever. */
export function useWrittenFormTextState(filePath: string): {
  text: string | null;
  error: boolean;
  retry: () => void;
} {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ext = extFromPath(filePath);

  useEffect(() => {
    if (!isTextExt(ext)) {
      setText(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(resolveImageUrl(filePath))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((t) => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [filePath, ext, attempt]);

  return { text, error, retry: () => setAttempt((a) => a + 1) };
}

/** Back-compat shape used by the tiles: just the text (null while loading or
 *  on error — tiles degrade gracefully without an explicit error UI). */
export function useWrittenFormText(filePath: string): string | null {
  return useWrittenFormTextState(filePath).text;
}
