// In-memory, per-page-load caches so switching pages doesn't visibly reload
// what was already on screen. Not persistence — a hard refresh starts clean.

const responses = new Map<string, unknown>();

/** Stale-while-revalidate: hand back the cached value immediately (if any),
 *  then fetch, store, and hand back the fresh one. `onData` may run twice. */
export async function swr<T>(key: string, fetcher: () => Promise<T>, onData: (data: T, fromCache: boolean) => void): Promise<void> {
  const cached = responses.get(key) as T | undefined;
  if (cached !== undefined) onData(cached, true);
  const fresh = await fetcher();
  responses.set(key, fresh);
  onData(fresh, false);
}

export function getCached<T>(key: string): T | undefined {
  return responses.get(key) as T | undefined;
}

export function invalidateCached(prefix: string): void {
  for (const k of responses.keys()) if (k.startsWith(prefix)) responses.delete(k);
}

/** Full-res art URLs that have finished loading at least once this page load. */
export const loadedImages = new Set<string>();
