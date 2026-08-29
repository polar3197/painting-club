import { useEffect, useState, Dispatch, SetStateAction } from 'react';

import { get_profile, Profile } from "../api";
import { swr, getCached } from "../cache";
import { useAuth } from "../context/AuthContext";

export function useProfile(username: string | undefined): 
  [
    Profile | null, 
    Dispatch<SetStateAction<Profile | null>>, 
    Error | null, 
    boolean
  ] 
  {
  // A cached profile renders immediately (no "Loading..." wall on every
  // visit); the fetch still runs and refreshes it.
  const cached = username ? getCached<Profile>(`profile:${username}`) : undefined;
  const [profile, setProfile] = useState<Profile | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<Error | null>(null);
  const { token } = useAuth()!;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        await swr(`profile:${username}`, () => get_profile(username!, token), setProfile);
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
