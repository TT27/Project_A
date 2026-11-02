import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/contracts';
import { getApi, hasApi } from './useApi';

export interface AppInfoState {
  info: AppInfo | null;
  error: string | null;
}

export function useAppInfo(): AppInfoState {
  const [state, setState] = useState<AppInfoState>(() =>
    hasApi() ? { info: null, error: null } : { info: null, error: 'Desktop bridge unavailable' }
  );

  useEffect(() => {
    let cancelled = false;
    if (!hasApi()) return;
    getApi()
      .app.getInfo()
      .then((info) => {
        if (!cancelled) setState({ info, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ info: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
