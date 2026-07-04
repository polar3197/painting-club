import { useEffect, useState } from 'react';

// Trails `value` by `delayMs`. Lets a controlled TextInput update instantly
// while expensive consumers (fuzzy search over a whole gallery) re-run only
// once typing pauses.
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
