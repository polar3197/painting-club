const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:80/api';

const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

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

export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

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

export function getPortfolioUrl(username: string, medium?: string, keywords?: string[]): string {
  const params = new URLSearchParams();
  if (medium) params.set('medium', medium);
  if (keywords && keywords.length > 0) params.set('keywords', keywords.join(','));
  const qs = params.toString();
  return `${SERVER_ORIGIN}/members/${username}/portfolio${qs ? `?${qs}` : ''}`;
}
