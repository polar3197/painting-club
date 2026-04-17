import { useEffect, useState, Dispatch, SetStateAction } from 'react';

import { get_profile, Profile } from "../api";

export function useProfile(username: string | undefined): 
  [
    Profile | null, 
    Dispatch<SetStateAction<Profile | null>>, 
    Error | null, 
    boolean
  ] 
  {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem("token");
      console.log(token);
      try {
        const data = await get_profile(username!, token);
        setProfile(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  return [profile, setProfile, error, loading];
}
