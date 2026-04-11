import { useEffect, useState } from 'react';
import { get_search_options, SearchOptions } from '../api';

export function useOptions() {
  const [options, setOptions] = useState<SearchOptions>({
    usernames: [],
    fullnames: [],
    cities: [],
    keywords: [],
    titles: [],
    songs: [],
    mediums: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const data = await get_search_options();
        setOptions(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return [options, error, loading] as const;
}
