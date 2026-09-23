import * as SecureStore from 'expo-secure-store';
import { request } from './client';

// Per-artist "wall" pick: the one piece a member pins to the top of a medium's
// wall (visual / written / audio). Keyed by (username, artType).
//
// Pins live on the server (GET /wall-pins, PUT /art/{id}/wall-pin), so a
// member's pin shows for everyone. A copy is kept in SecureStore so walls can
// render pins instantly (and offline) before the server answers. Reads stay
// synchronous for the wall/profile renderers.
export type WallType = 'visual_2d' | 'written_form' | 'audio';

const STORE_KEY = 'wall_pins_v1';
// Set once this device's pre-server pins have been uploaded.
const MIGRATED_KEY = 'wall_pins_migrated_v1';
const REFRESH_MS = 60_000;

// key = `${username}::${artType}` -> artId
let _pins: Record<string, string> = {};
let _ready = false;
let _lastFetch = 0;
let _inFlight: Promise<void> | null = null;
const _listeners = new Set<() => void>();

function keyOf(username: string, artType: WallType): string {
  return `${username.toLowerCase()}::${artType}`;
}

function notify() {
  _listeners.forEach((l) => l());
}

function persist() {
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(_pins)).catch(() => {});
}

const _hydration: Promise<void> = (async () => {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (raw) _pins = JSON.parse(raw) as Record<string, string>;
  } catch {
    /* ignore */
  } finally {
    _ready = true;
    notify();
  }
})();

type ServerPin = { username: string; art_type: WallType; art_id: string };

// One-time: pins made before the server existed only live on this device. Push
// the signed-in member's own ones up (others' can't be set by us anyway) unless
// the server already has a pin for that wall.
async function migrateLocalPins(server: Record<string, string>) {
  if (await SecureStore.getItemAsync(MIGRATED_KEY)) return;
  const me = (await SecureStore.getItemAsync('username'))?.toLowerCase();
  if (!me) return;
  for (const [k, artId] of Object.entries(_pins)) {
    if (!k.startsWith(`${me}::`) || server[k]) continue;
    try {
      await request(`/art/${artId}/wall-pin`, { method: 'PUT' });
      server[k] = artId;
    } catch {
      /* piece gone / not ours — drop it */
    }
  }
  await SecureStore.setItemAsync(MIGRATED_KEY, '1');
}

/** Pull everyone's pins from the server (throttled; force to skip the throttle). */
export function refreshWallPins(force = false): Promise<void> {
  if (_inFlight) return _inFlight;
  if (!force && Date.now() - _lastFetch < REFRESH_MS) return Promise.resolve();
  _inFlight = (async () => {
    try {
      await _hydration;
      const rows = (await request('/wall-pins')) as ServerPin[];
      const next: Record<string, string> = {};
      for (const r of rows) next[keyOf(r.username, r.art_type)] = r.art_id;
      await migrateLocalPins(next);
      _pins = next;
      _lastFetch = Date.now();
      persist();
      notify();
    } catch {
      // offline / older backend: keep showing the stored copy
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/** Await this to be sure stored pins are loaded before reading them. */
export function wallsReady(): Promise<void> { return _hydration; }
export function isWallsReady(): boolean { return _ready; }

/** The pinned artId for this artist + medium, or null. Synchronous. */
export function getPinnedArtId(username: string, artType: WallType): string | null {
  return _pins[keyOf(username, artType)] ?? null;
}

export function isPinned(username: string, artType: WallType, artId: string): boolean {
  return _pins[keyOf(username, artType)] === artId;
}

/** Pin (or, if already pinned to this piece, unpin) the signed-in member's own
 *  piece. Optimistic; reverts if the server refuses. */
export function togglePinnedArt(username: string, artType: WallType, artId: string): void {
  const k = keyOf(username, artType);
  const prev = _pins[k];
  if (prev === artId) delete _pins[k];
  else _pins[k] = artId;
  persist();
  notify();
  request(`/art/${artId}/wall-pin`, { method: 'PUT' })
    .then((res) => {
      const pinned = (res as { pinned?: boolean } | null)?.pinned;
      if (pinned === true) _pins[k] = artId;
      else if (pinned === false && _pins[k] === artId) delete _pins[k];
      persist();
      notify();
    })
    .catch(() => {
      if (prev) _pins[k] = prev;
      else delete _pins[k];
      persist();
      notify();
    });
}

/** Subscribe to pin changes; also kicks a (throttled) server refresh. */
export function subscribeWalls(cb: () => void): () => void {
  _listeners.add(cb);
  refreshWallPins();
  return () => { _listeners.delete(cb); };
}
