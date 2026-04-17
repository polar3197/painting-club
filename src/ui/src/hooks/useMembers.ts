import { useEffect, useState } from "react";
import { get_members, Profile } from "../api";

export function useMembers(city: string , username: string ): [Profile[] | [], Error | null, boolean] {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);


  useEffect(() => {
    const fetchMembers = async () => {
      console.log("username: ", username, "city: ", city);
      
      const token = localStorage.getItem("token");
      console.log(token);
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
  }, [city, username]);

  return [members, error, loading];
}
