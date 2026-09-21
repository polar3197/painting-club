import { Directory, File, Paths } from 'expo-file-system';

/**
 * Last-known API responses, kept in memory and on disk, so a screen can render
 * (and its images start loading from the image cache) on the very first frame
 * of a cold launch instead of waiting on the network. Callers still fetch and
 * overwrite; this only removes the empty "Loading..." gap. Reads are sync —
 * the files are a few KB. Cleared on logout.
 */
const memory = new Map<string, unknown>();
const dir = new Directory(Paths.document, 'json-cache');

function fileFor(key: string): File {
  return new File(dir, `${key.replace(/[^\w.-]/g, '_')}.json`);
}

export function readCached<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const f = fileFor(key);
    if (!f.exists) return undefined;
    const value = JSON.parse(f.textSync()) as T;
    memory.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

export function writeCached(key: string, value: unknown): void {
  memory.set(key, value);
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    fileFor(key).write(JSON.stringify(value));
  } catch {
    // best-effort: the in-memory copy still serves this session
  }
}

export function clearCached(): void {
  memory.clear();
  try {
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
}
