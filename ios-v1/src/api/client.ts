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
