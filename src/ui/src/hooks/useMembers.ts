import { useEffect, useState } from "react";
import { get_members, Profile } from "../api";
import { useAuth } from "../context/AuthContext";

export function useMembers(city: string , username: string ): [Profile[] | [], Error | null, boolean] {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { token } = useAuth()!;


  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const data = await get_members(city, username, token);
        setMembers(data);
        console.log("members: ", data);
      } catch (err) {
        console.log("fetch error: ", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [city, username, token]);

  return [members, error, loading];
}
