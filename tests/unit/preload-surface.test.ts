import { describe, expect, it, vi } from 'vitest';
import { createBridge, EXPECTED_API_SURFACE, PreloadValidationError, type IpcRendererLike } from '../../src/preload/bridge';
import { IPC_CHANNELS, IPC_EVENTS } from '../../src/shared/contracts';

function fakeIpc(responses: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const invokeMock = vi.fn((channel: string) => Promise.resolve(responses[channel]));
  const ipc: IpcRendererLike & { emit(channel: string, payload: unknown): void; invokeMock: typeof invokeMock } = {
    invokeMock,
    invoke: (channel, ...args) => invokeMock(channel, ...(args as [])),
    on: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener);
    },
    emit: (channel, payload) => {
      for (const l of listeners.get(channel) ?? []) l({}, payload);
    }
  };
  return ipc;
}

describe('preload bridge surface', () => {
  it('exposes exactly the expected namespaces and methods, all frozen', () => {
    const api = createBridge(fakeIpc());
    expect(Object.keys(api).sort()).toEqual(Object.keys(EXPECTED_API_SURFACE).sort());
    for (const [ns, methods] of Object.entries(EXPECTED_API_SURFACE)) {
      const actual = api[ns as keyof typeof api] as Record<string, unknown>;
      expect(Object.keys(actual).sort()).toEqual([...methods].sort());
      for (const m of methods) expect(typeof actual[m]).toBe('function');
      expect(Object.isFrozen(actual)).toBe(true);
    }
    expect(Object.isFrozen(api)).toBe(true);
  });

  it('does not expose generic ipc, require or shell access', () => {
    const api = createBridge(fakeIpc()) as unknown as Record<string, unknown>;
    for (const forbidden of ['invoke', 'send', 'on', 'ipcRenderer', 'require', 'shell', 'fs', 'exec']) {
      expect(api[forbidden]).toBeUndefined();
    }
  });

  it('forwards validated requests and returns validated responses', async () => {
    const ipc = fakeIpc({
      [IPC_CHANNELS.appGetInfo]: {
        name: 'StatementDesk',
        version: '0.1.0',
        platform: 'darwin',
        electron: '39.0.0',
        engineVersion: '0.1.0',
        theme: 'light',
        locale: 'en-AU'
      },
      [IPC_CHANNELS.dialogPickInputFile]: { path: '/tmp/a.csv', name: 'a.csv', sizeBytes: 10, kind: 'csv' }
    });
    const api = createBridge(ipc);
    const info = await api.app.getInfo();
    expect(info.version).toBe('0.1.0');
    expect(ipc.invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.appGetInfo);

    const picked = await api.dialog.pickInputFile({ side: 'statement' });
    expect(picked?.kind).toBe('csv');
    expect(ipc.invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.dialogPickInputFile, { side: 'statement' });
  });

  it('rejects invalid request arguments before touching IPC', async () => {
    const ipc = fakeIpc();
    const api = createBridge(ipc);
    await expect(api.dialog.pickInputFile({ side: 'bogus' } as never)).rejects.toBeInstanceOf(PreloadValidationError);
    await expect(api.project.open('')).rejects.toBeInstanceOf(PreloadValidationError);
    await expect(
      api.project.create('/tmp/x.statementdesk', {
        projectName: 'x',
        supplierName: 'y',
        supplierId: 'S',
        cutoffDate: '30/09/2026',
        currency: 'AUD',
        comparableBalancesConfirmed: true
      })
    ).rejects.toBeInstanceOf(PreloadValidationError);
    await expect(
      api.project.create('/tmp/x.statementdesk', {
        projectName: 'x',
        supplierName: 'y',
        supplierId: 'S',
        cutoffDate: '2026-09-30',
        currency: 'USD' as never,
        comparableBalancesConfirmed: true
      })
    ).rejects.toBeInstanceOf(PreloadValidationError);
    expect(ipc.invokeMock).not.toHaveBeenCalled();
  });

  it('rejects malformed responses from the main process', async () => {
    const ipc = fakeIpc({ [IPC_CHANNELS.appGetInfo]: { version: 'nope' } });
    const api = createBridge(ipc);
    await expect(api.app.getInfo()).rejects.toBeInstanceOf(PreloadValidationError);
  });

  it('delivers only schema-valid push events and supports unsubscribe', () => {
    const ipc = fakeIpc();
    const api = createBridge(ipc);
    const seen: string[] = [];
    const off = api.app.onMenuAction((a) => seen.push(a));
    ipc.emit(IPC_EVENTS.menuAction, 'open-project');
    ipc.emit(IPC_EVENTS.menuAction, 'rm -rf /');
    ipc.emit(IPC_EVENTS.menuAction, { action: 'export' });
    expect(seen).toEqual(['open-project']);
    off();
    ipc.emit(IPC_EVENTS.menuAction, 'export');
    expect(seen).toEqual(['open-project']);
  });
});
