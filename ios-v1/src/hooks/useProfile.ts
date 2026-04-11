import { useEffect, useState, Dispatch, SetStateAction } from 'react';
import { get_profile, Profile } from '../api';
import { useAuth } from '../context/AuthContext';

export function useProfile(
  username: string | undefined
): [Profile | null, Dispatch<SetStateAction<Profile | null>>, Error | null, boolean] {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        const data = await get_profile(username, token);
        setProfile(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [username, token]);

  return [profile, setProfile, error, loading];
}
