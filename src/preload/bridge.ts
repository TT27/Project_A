/**
 * Preload bridge factory. Kept separate from index.ts so the exact API surface and
 * its validation behaviour can be unit-tested without Electron by injecting a fake
 * ipcRenderer.
 */
import type { z } from 'zod';
import {
  IPC_CHANNELS,
  IPC_CONTRACTS,
  IPC_EVENTS,
  MenuActionSchema,
  NativeThemeSchema,
  LocalPathSchema,
  ImportProgressSchema,
  type ContractChannel,
  type RequestOf,
  type ResponseOf
} from '@shared/contracts';
import type { StatementDeskApi, Unsubscribe } from './api';

/** Minimal subset of Electron's IpcRenderer that the bridge relies on. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

export class PreloadValidationError extends Error {
  constructor(
    public readonly channel: string,
    public readonly direction: 'request' | 'response',
    issues: z.ZodError
  ) {
    super(`IPC ${direction} validation failed on "${channel}": ${issues.issues.map((i) => i.message).join('; ')}`);
    this.name = 'PreloadValidationError';
  }
}

function makeInvoker(ipc: IpcRendererLike) {
  return async function invoke<C extends ContractChannel>(channel: C, request: RequestOf<C>): Promise<ResponseOf<C>> {
    const contract = IPC_CONTRACTS[channel];
    const parsedRequest = contract.request.safeParse(request);
    if (!parsedRequest.success) {
      throw new PreloadValidationError(channel, 'request', parsedRequest.error);
    }
    const raw = parsedRequest.data === undefined ? await ipc.invoke(channel) : await ipc.invoke(channel, parsedRequest.data);
    const parsedResponse = contract.response.safeParse(raw);
    if (!parsedResponse.success) {
      throw new PreloadValidationError(channel, 'response', parsedResponse.error);
    }
    return parsedResponse.data as ResponseOf<C>;
  };
}

function makeSubscriber<T>(ipc: IpcRendererLike, channel: string, schema: z.ZodType<T>) {
  return (listener: (value: T) => void): Unsubscribe => {
    const wrapped = (_event: unknown, payload: unknown) => {
      const parsed = schema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipc.on(channel, wrapped);
    return () => {
      ipc.removeListener(channel, wrapped);
    };
  };
}

export function createBridge(ipc: IpcRendererLike): StatementDeskApi {
  const invoke = makeInvoker(ipc);
  const api: StatementDeskApi = {
    app: {
      getInfo: () => invoke(IPC_CHANNELS.appGetInfo, undefined),
      getRecentProjects: () => invoke(IPC_CHANNELS.appGetRecentProjects, undefined),
      getPendingOpenFile: () => invoke(IPC_CHANNELS.appGetPendingOpenFile, undefined),
      openSample: () => invoke(IPC_CHANNELS.appOpenSample, undefined),
      onMenuAction: makeSubscriber(ipc, IPC_EVENTS.menuAction, MenuActionSchema),
      onOpenFileRequested: makeSubscriber(ipc, IPC_EVENTS.openFileRequested, LocalPathSchema),
      onThemeChanged: makeSubscriber(ipc, IPC_EVENTS.nativeThemeChanged, NativeThemeSchema)
    },
    dialog: {
      pickInputFile: (request) => invoke(IPC_CHANNELS.dialogPickInputFile, request),
      pickProjectPath: (request) => invoke(IPC_CHANNELS.dialogPickProjectPath, request),
      pickExportPath: (request) => invoke(IPC_CHANNELS.dialogPickExportPath, request)
    },
    project: {
      create: (path, setup) => invoke(IPC_CHANNELS.projectCreate, { path, setup }),
      open: (path) => invoke(IPC_CHANNELS.projectOpen, { path }),
      close: () => invoke(IPC_CHANNELS.projectClose, undefined),
      getState: () => invoke(IPC_CHANNELS.projectGetState, undefined),
      saveSettings: (settings) => invoke(IPC_CHANNELS.projectSaveSettings, { settings })
    },
    imports: {
      inspect: (request) => invoke(IPC_CHANNELS.importInspect, request),
      preview: (request) => invoke(IPC_CHANNELS.importPreview, request),
      run: (request) => invoke(IPC_CHANNELS.importRun, request),
      cancel: (request) => invoke(IPC_CHANNELS.importCancel, request),
      onProgress: makeSubscriber(ipc, IPC_EVENTS.importProgress, ImportProgressSchema)
    },
    reconcile: {
      run: () => invoke(IPC_CHANNELS.reconcileRun, undefined),
      getRun: (runId) => invoke(IPC_CHANNELS.reconcileGetRun, { runId }),
      listRuns: () => invoke(IPC_CHANNELS.reconcileListRuns, undefined)
    },
    review: {
      record: (request) => invoke(IPC_CHANNELS.reviewRecord, request),
      list: (request) => invoke(IPC_CHANNELS.reviewList, request ?? {})
    }
  };
  // Freeze so the renderer cannot monkey-patch the bridge.
  Object.freeze(api.app);
  Object.freeze(api.dialog);
  Object.freeze(api.project);
  Object.freeze(api.imports);
  Object.freeze(api.reconcile);
  Object.freeze(api.review);
  return Object.freeze(api);
}

/** The exact list of methods the renderer may call. Tested in tests/unit/preload-surface.test.ts. */
export const EXPECTED_API_SURFACE: Record<keyof StatementDeskApi, readonly string[]> = {
  app: ['getInfo', 'getRecentProjects', 'getPendingOpenFile', 'openSample', 'onMenuAction', 'onOpenFileRequested', 'onThemeChanged'],
  dialog: ['pickInputFile', 'pickProjectPath', 'pickExportPath'],
  project: ['create', 'open', 'close', 'getState', 'saveSettings'],
  imports: ['inspect', 'preview', 'run', 'cancel', 'onProgress'],
  reconcile: ['run', 'getRun', 'listRuns'],
  review: ['record', 'list']
};
