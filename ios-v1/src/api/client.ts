import { PixelRatio } from 'react-native';
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
export function thumbSource(artId: string): { uri: string; headers?: Record<string, string> } {
  return { uri: thumbUrl(artId), headers: defaultAuthToken ? { Authorization: `Bearer ${defaultAuthToken}` } : undefined };
}

/** Small JPEG placeholder for a member's profile pic. Served directly from nginx. */
export function profileThumbUrl(memberId: string): string {
  return `${SERVER_ORIGIN}/static/profile-thumbs/${memberId}.jpg`;
}

/** Cache key for a signed static URL: the URL minus its `md5`/`expires`
 *  signature, which rotates every few hours. Keying by the full URL made every
 *  cold launch after the rotation re-download images already on disk; `?v=`
 *  (file mtime) is kept, so replaced bytes still bust the cache. */
export function stableCacheKey(uri: string): string {
  const [base, query] = uri.split('?');
  if (!query) return uri;
  const kept = query.split('&').filter((kv) => !/^(md5|expires)=/.test(kv));
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

export type ImageSourceObj = { uri: string; cacheKey: string };

/** expo-image source for a (signed) static path, cache-keyed stably. */
export function imageSource(path: string | null | undefined): ImageSourceObj | undefined {
  if (!path) return undefined;
  const uri = resolveImageUrl(path);
  return { uri, cacheKey: stableCacheKey(uri) };
}

type ArtImagePaths = { file_path: string; thumb_url?: string | null; display_url?: string | null };

/** ~1600px copy for full-width viewing — a fraction of the multi-MB original.
 *  Falls back to the original when the server hasn't generated one (or is an
 *  older backend that doesn't send display_url). */
export function artDisplaySource(p: ArtImagePaths) {
  return imageSource(p.display_url || p.file_path);
}

/** 512px copy for grid tiles / placeholders; falls back like artDisplaySource. */
export function artThumbSource(p: ArtImagePaths) {
  return imageSource(p.thumb_url || p.display_url || p.file_path);
}

/** Right-sized copy for a tile `widthPt` points wide: the 512px thumb while it
 *  still covers the tile at the screen's pixel density, else the display copy. */
export function artTileSource(p: ArtImagePaths, widthPt: number) {
  return widthPt * PixelRatio.get() <= 560 ? artThumbSource(p) : artDisplaySource(p);
}

/** Profile pic for avatars and the profile header (512px copy when available). */
export function profilePicThumbSource(
  profile: { profile_pic_path: string | null; profile_pic_thumb_path?: string | null },
) {
  return imageSource(profile.profile_pic_thumb_path || profile.profile_pic_path);
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

/** The browser signup page a flyer / contributor-screen QR points at. */
export function getJoinUrl(inviteToken: string): string {
  return `${SERVER_ORIGIN}/join?i=${inviteToken}`;
}

export function getPortfolioUrl(username: string, medium?: string, keywords?: string[]): string {
  const params = new URLSearchParams();
  if (medium) params.set('medium', medium);
  if (keywords && keywords.length > 0) params.set('keywords', keywords.join(','));
  const qs = params.toString();
  return `${SERVER_ORIGIN}/members/${username}/portfolio${qs ? `?${qs}` : ''}`;
}
