import { useEffect, useState, useCallback } from 'react';
import { get_members, Profile } from '../api';
import { useAuth } from '../context/AuthContext';

export function useMembers(
  city: string,
  username: string,
): [Profile[], Error | null, boolean, () => Promise<void>] {
  const { token } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await get_members(city, username, token);
      setMembers(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [city, username, token]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return [members, error, loading, fetchMembers];
}
