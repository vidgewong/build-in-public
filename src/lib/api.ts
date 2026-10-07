import { useEffect, useState } from 'react';
import type { Snapshot } from './data';

/** 开发时走 vite 代理（/api → localhost:8787），生产由同域反代提供 */
const BASE = import.meta.env.VITE_API_BASE ?? '';

export type Fetched<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

export function useSnapshot(): Fetched<Snapshot> {
  const [state, setState] = useState<Fetched<Snapshot>>({ status: 'loading' });

  useEffect(() => {
    const ac = new AbortController();

    fetch(`${BASE}/api/snapshot`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`接口返回 ${res.status}`);
        return (await res.json()) as Snapshot;
      })
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => ac.abort();
  }, []);

  return state;
}
