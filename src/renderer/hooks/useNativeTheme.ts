import { useEffect } from 'react';
import type { NativeTheme } from '@shared/contracts';
import { getApi, hasApi } from './useApi';

function applyTheme(theme: NativeTheme): void {
  document.documentElement.dataset['theme'] = theme;
}

/** Mirrors Electron's nativeTheme onto <html data-theme> so CSS tokens follow the system appearance. */
export function useNativeTheme(initial: NativeTheme | undefined): void {
  useEffect(() => {
    if (initial) applyTheme(initial);
  }, [initial]);

  useEffect(() => {
    if (!hasApi()) return;
    return getApi().app.onThemeChanged(applyTheme);
  }, []);
}
