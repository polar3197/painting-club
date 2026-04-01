
import { useEffect, useState } from "react";
import { get_search_options } from "../api";

export function useOptions() {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);


  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [fetchedUsernames, fetchedCities] = await get_search_options();
        setUsernames(fetchedUsernames);
        setCities(fetchedCities);
        console.log("usernames: ", fetchedUsernames, "cities: ", fetchedCities);
      } catch (err) {
        console.log("fetch error: ", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, []);

  return [usernames, cities, error, loading] as const;
}