import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

// Basic loading/error state for a fetch that re-runs whenever `deps` change.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);

  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fn()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, deps);

  useEffect(() => run(), [run, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { data, loading, error, reload };
}
