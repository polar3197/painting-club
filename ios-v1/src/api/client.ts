import { markBackendUp, markBackendDown } from './backendHealth';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:80/api';

const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

// Gateway statuses Cloudflare returns when the Pi origin is unreachable. A plain
// 500 means the Pi is up but the request errored, so it does NOT count as down.
const GATEWAY_DOWN_STATUSES = new Set([502, 503, 504]);

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

let onAuthExpired: (() => void) | null = null;

/** Register a handler fired when any authenticated request comes back 401. */
export function setAuthExpiredHandler(fn: (() => void) | null) {
  onAuthExpired = fn;
}

// Default bearer token attached to every request that doesn't set its own
// Authorization header. Lets historically token-less calls (search, member art)
// carry the member's auth now that the art routes are gated. Managed by
// AuthContext on login / logout / refresh.
let defaultAuthToken: string | null = null;
export function setAuthToken(t: string | null) {
  defaultAuthToken = t;
}

export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const isFormData = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        // Default token first so an explicit per-call Authorization still wins.
        ...(defaultAuthToken ? { Authorization: `Bearer ${defaultAuthToken}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    // Couldn't even reach the origin (Pi off / no network) — flag it so every
    // surface can show the "power source is weak" notice, then rethrow.
    markBackendDown();
    throw err;
  }

  // A gateway error means the Pi is down; any other real response means it's up.
  if (GATEWAY_DOWN_STATUSES.has(response.status)) markBackendDown();
  else markBackendUp();

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  // Expired/invalid token on an authenticated request → let the app wipe auth state + go to landing.
  // Skip for the login endpoint so a wrong password doesn't trigger a logout navigation.
  if (response.status === 401 && !path.startsWith('/members/login') && onAuthExpired) {
    onAuthExpired();
  }

  if (!response.ok) {
    const detail = (data as any)?.detail;
    throw new Error(
      typeof detail === 'string' ? detail : JSON.stringify(detail) || `Request failed with status ${response.status}`
    );
  }

  return data;
}

export function resolveImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${SERVER_ORIGIN}${path}`;
}

// Query params that rotate on every request (the art URL signature). expo-image
// keys its on-disk cache by the *whole* source URI, so without stripping these
// the same piece is re-saved under a brand-new key on every fetch — which
// ballooned on-device storage into the gigabytes. Stripping them yields one
// cache entry per image. Any other param (e.g. a profile pic's ?v=<mtime>) is
// kept, so a genuine re-upload still busts the cache.
const SIGNING_PARAMS = ['md5', 'expires'];

/** Signature-free cache key for a (possibly signed) image URL. */
export function stableCacheKey(uri: string): string {
  if (!uri) return uri;
  const q = uri.indexOf('?');
  if (q === -1) return uri;
  const params = new URLSearchParams(uri.slice(q + 1));
  SIGNING_PARAMS.forEach((p) => params.delete(p));
  const rest = params.toString();
  return rest ? `${uri.slice(0, q)}?${rest}` : uri.slice(0, q);
}

/** expo-image source for a remote image path: the signed URL to fetch, plus a
 *  stable cacheKey so it occupies one disk entry regardless of signature churn.
 *  Use this for every full-resolution art image. */
export function imageSource(path: string): { uri: string; cacheKey: string } {
  const uri = resolveImageUrl(path);
  return { uri, cacheKey: stableCacheKey(uri) };
}

export function thumbUrl(artId: string): string {
  return `${API_BASE}/art/${artId}/thumb`;
}

/** Bearer header for the current session, or {} when logged out. For image
 *  fetches (which don't go through request()) that hit auth-gated routes. */
export function authHeaders(): Record<string, string> {
  return defaultAuthToken ? { Authorization: `Bearer ${defaultAuthToken}` } : {};
}

/** expo-image source for the (auth-gated) thumbnail route: the URL plus the
 *  bearer header, since a bare <Image> GET carries no token of its own. Reads
 *  the session token from module state, so callers need no token in scope. */
export function thumbSource(
  artId: string,
  version?: string | null,
): { uri: string; headers?: Record<string, string>; cacheKey?: string } {
  // The thumb route is keyed by art id, which does NOT change when a piece is
  // edited — so a stable URL would serve the phone's hour-old cached thumb even
  // though the backend regenerated it on edit. `version` (the piece's file_path,
  // which gets a fresh ...-{rev} suffix on every re-upload) busts both the URL
  // and the expo-image cacheKey so an edited piece refetches its new thumbnail.
  // Strip the signature first so it's stable across signed-URL rotations.
  const v = version ? stableCacheKey(version) : undefined;
  const headers = defaultAuthToken ? { Authorization: `Bearer ${defaultAuthToken}` } : undefined;
  if (!v) return { uri: thumbUrl(artId), headers };
  return {
    uri: `${thumbUrl(artId)}?v=${encodeURIComponent(v)}`,
    headers,
    cacheKey: `art-thumb:${artId}:${v}`,
  };
}

/** Small JPEG placeholder for a member's profile pic. Served directly from nginx. */
export function profileThumbUrl(memberId: string): string {
  return `${SERVER_ORIGIN}/static/profile-thumbs/${memberId}.jpg`;
}

/** expo-image source for the (auth-gated) 256px profile-pic thumbnail route —
 *  the roster/search grid loads this instead of the full multi-MB pic. Carries
 *  the bearer like thumbSource. 404s on a backend that predates the route, so
 *  callers should fall back to the full pic on error. */
export function profileThumbSource(memberId: string): { uri: string; headers?: Record<string, string> } {
  return {
    uri: `${API_BASE}/members/${memberId}/pic/thumb`,
    headers: defaultAuthToken ? { Authorization: `Bearer ${defaultAuthToken}` } : undefined,
  };
}

/** Absolute URL for a member's profile pic — null if none uploaded.
 *  The server already appends `?v=<file-mtime>` (see versioned_pic_path), so the
 *  URL changes whenever the bytes on disk change and every client refetches after
 *  any re-upload. No extra client-side cache-busting needed. */
export function profilePicSrc(
  profile: { profile_pic_path: string | null },
): string | null {
  if (!profile.profile_pic_path) return null;
  return resolveImageUrl(profile.profile_pic_path);
}

/** expo-image source for a member's profile pic WITH a stable cacheKey, so the
 *  rotating signature doesn't re-cache the same photo under a fresh key on every
 *  view (the roster shows many full-res pics at once — that churn ran the on-disk
 *  cache into the gigabytes). null when the member has no pic. Trade-off: keyed
 *  by the signature-free path, so a re-uploaded pic (same filename) can show the
 *  old one until the cache evicts — rare, and far cheaper than the leak. */
export function profilePicSource(
  profile: { profile_pic_path: string | null },
  bust?: string | null,
): { uri: string; cacheKey: string } | null {
  const url = profilePicSrc(profile);
  if (!url) return null;
  // `bust` (the server mtime from a fresh upload) changes the cache key so a
  // re-uploaded pic replaces the cached one. The signed URL drops the ?v= tag,
  // so without this the key would be identical to the previous photo and the
  // owner would keep seeing the old one right after changing it.
  const key = stableCacheKey(url);
  return { uri: url, cacheKey: bust ? `${key}#v=${bust}` : key };
}

export function getPortfolioUrl(username: string, medium?: string, keywords?: string[]): string {
  const params = new URLSearchParams();
  if (medium) params.set('medium', medium);
  if (keywords && keywords.length > 0) params.set('keywords', keywords.join(','));
  const qs = params.toString();
  return `${SERVER_ORIGIN}/members/${username}/portfolio${qs ? `?${qs}` : ''}`;
}
