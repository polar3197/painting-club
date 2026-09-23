import { useEffect, useState, useCallback, Dispatch, SetStateAction } from 'react';
import { get_profile, Profile } from '../api';
import { useAuth } from '../context/AuthContext';
import { readCached, writeCached } from '../utils/jsonCache';
import { isBackendDown, subscribeBackendHealth } from '../api/backendHealth';

const cacheKey = (username: string) => `profile:${username.toLowerCase()}`;

export function useProfile(
  username: string | undefined
): [Profile | null, Dispatch<SetStateAction<Profile | null>>, Error | null, boolean, () => Promise<void>] {
  const { token } = useAuth();
  // Seed from the last-known copy so the profile (and its images, via the image
  // cache) paints on the first frame; the fetch below then refreshes it.
  const [profile, setProfile] = useState<Profile | null>(
    () => (username ? readCached<Profile>(cacheKey(username)) ?? null : null),
  );
  const [loading, setLoading] = useState(() => !profile);
  const [error, setError] = useState<Error | null>(null);
  // Only re-fetch on login/logout, not on every token refresh: the launch-time
  // sliding-session swap used to trigger a second full profile fetch. request()
  // attaches the current token itself.
  const signedIn = !!token;

  const fetchProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }
    try {
      const data = await get_profile(username, token);
      setProfile(data);
      writeCached(cacheKey(username), data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [username, signedIn]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // The Pi dropped and came back: refresh whatever the cached copy is showing.
  useEffect(
    () =>
      subscribeBackendHealth(() => {
        if (!isBackendDown()) fetchProfile();
      }),
    [fetchProfile],
  );

  return [profile, setProfile, error, loading, fetchProfile];
}
