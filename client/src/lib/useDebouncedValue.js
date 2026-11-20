import { useEffect, useState } from 'react';

/**
 * Returns a copy of `value` that only updates after `delay` ms of no changes.
 * Use it for search inputs that trigger server requests on every keystroke.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
