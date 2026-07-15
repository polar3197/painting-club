// App-wide "is the backend reachable?" signal.
//
// The API runs on a Raspberry Pi whose power is flaky; when it drops, requests
// either fail to connect or come back as a Cloudflare 502/503/504. The client
// (client.ts) reports every request's outcome here, and any surface can react
// via useBackendDown() to show the "power source is weak" notice instead of a
// blank screen. Kept as a module-level store (not React context) so the client
// — which isn't inside the component tree — can flip it directly.
import { useEffect, useState } from 'react';

let _down = false;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

// Reaching the origin at all (any real HTTP response, even a 4xx/500) means the
// Pi is up. Only a failed connection or a gateway error means it's down.
export function markBackendUp(): void {
  if (!_down) return;
  _down = false;
  notify();
}

export function markBackendDown(): void {
  if (_down) return;
  _down = true;
  notify();
}

export function isBackendDown(): boolean {
  return _down;
}

/** Subscribe to reachability changes. Returns an unsubscribe fn. */
export function subscribeBackendHealth(cb: () => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

/** React hook: re-renders when backend reachability flips. */
export function useBackendDown(): boolean {
  const [down, setDown] = useState(_down);
  useEffect(() => {
    const sync = () => setDown(_down);
    sync(); // in case it changed between initial render and subscribe
    return subscribeBackendHealth(sync);
  }, []);
  return down;
}
