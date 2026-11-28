import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api, errText } from './client';

/**
 * Load one API path with loading and error state. Reloads when the screen comes back into
 * focus (so data is fresh after going back), and on reload(). `null` path: nothing loaded.
 */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const live = useRef(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const j = await api(path);
      if (!live.current || n !== seq.current) return;
      setData(j.data);
      setMeta(j.meta ?? null);
      setError('');
    } catch (e) {
      if (live.current && n === seq.current) setError(errText(e));
    } finally {
      if (live.current && n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    live.current = true;
    setData(null);
    load();
    return () => {
      live.current = false;
    };
  }, [load]);

  // Fresh data when the user comes back to this screen (skips the first focus).
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      load();
    }, [load]),
  );

  return { data, meta, error, loading, reload: load, setData };
}
