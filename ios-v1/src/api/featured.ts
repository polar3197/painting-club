import * as SecureStore from 'expo-secure-store';
import { get_profile, get_members, Profile } from '.';

// The "highlighted artist" shown on Home.
//
// NOTE (stopgap): there is no backend field for this yet, so the selection is
// stored ON-DEVICE (SecureStore). That means a contributor's pick shows on
// *their* device but is not yet global to all users. When the backend ships an
// is_featured member flag (or a featured_username setting), swap the two marked
// spots below to read/write the server and this becomes global — the rest of
// the app (picker, home card) stays the same.
const USERNAME_KEY = 'featured_username_v1'; // <- replace with server read/write
const CACHE_KEY = 'featured_member_v1';      // last resolved member, for instant paint

let _username: string | null | undefined = undefined; // undefined = not loaded
let _member: Profile | null = null;

// Seed the in-memory member from disk at import so the first Home render after
// launch has something to show. Fire-and-forget.
const _hydration: Promise<void> = (async () => {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (raw && !_member) _member = JSON.parse(raw) as Profile;
  } catch {
    /* ignore */
  }
})();

function persistMember(m: Profile | null) {
  try {
    if (m) SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(m)).catch(() => {});
  } catch {
    /* ignore */
  }
}

async function loadUsername(): Promise<string | null> {
  if (_username !== undefined) return _username;
  try {
    // <- server read goes here (GET featured artist) instead of SecureStore.
    _username = (await SecureStore.getItemAsync(USERNAME_KEY)) || null;
  } catch {
    _username = null;
  }
  return _username;
}

/** Best snapshot available without waiting on the network (in-memory → disk). */
export async function getCachedFeaturedMember(): Promise<Profile | null> {
  if (_member) return _member;
  await _hydration;
  return _member;
}

/** Resolve the featured member (network). Falls back to a random member
 *  (preferring ones with a photo) when none has been set. */
export async function getFeaturedMember(token: string | null): Promise<Profile | null> {
  const uname = await loadUsername();
  try {
    if (uname) {
      _member = await get_profile(uname, token);
      persistMember(_member);
      return _member;
    }
    const ms = await get_members('', '', token);
    if (ms.length) {
      const withPic = ms.filter((m) => m.profile_pic_path);
      const pool = withPic.length ? withPic : ms;
      _member = pool[Math.floor(Math.random() * pool.length)];
      persistMember(_member);
    }
  } catch {
    // keep whatever we already have
  }
  return _member;
}

/** Contributor action: set the featured artist by username. */
export async function setFeaturedArtist(username: string, _token: string | null): Promise<void> {
  const uname = username.trim().toLowerCase();
  // <- server write goes here (POST feature) instead of SecureStore.
  await SecureStore.setItemAsync(USERNAME_KEY, uname);
  _username = uname;
  _member = null; // re-resolve on next read
}
