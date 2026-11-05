import { useEffect } from 'react';
import type { MenuAction } from '@shared/contracts';
import { getApi, hasApi } from './useApi';

export function useMenuActions(handler: (action: MenuAction) => void): void {
  useEffect(() => {
    if (!hasApi()) return;
    return getApi().app.onMenuAction(handler);
  }, [handler]);
}
