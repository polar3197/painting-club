import { useEffect, useState, useCallback, Dispatch, SetStateAction } from 'react';
import { get_profile, Profile } from '../api';
import { useAuth } from '../context/AuthContext';

export function useProfile(
  username: string | undefined
): [Profile | null, Dispatch<SetStateAction<Profile | null>>, Error | null, boolean, () => Promise<void>] {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }
    try {
      const data = await get_profile(username, token);
      setProfile(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [username, token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return [profile, setProfile, error, loading, fetchProfile];
}
