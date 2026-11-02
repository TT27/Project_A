/**
 * IPC handler registration. Every handler validates its arguments against the
 * shared Zod contract before doing any work, independent of the preload's own check.
 */
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { app, dialog, ipcMain, nativeTheme, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { ENGINE_VERSION } from '@domain/version';
import {
  APP_NAME,
  IPC_CHANNELS,
  IPC_CONTRACTS,
  IPC_EVENTS,
  PROJECT_FILE_EXTENSION,
  type AppInfo,
  type ContractChannel,
  type ErrorInfo,
  type ImportSummary,
  type InspectResult,
  type MappingPreview,
  type PickedFile,
  type ProjectState,
  type ProjectSummary,
  type RequestOf,
  type ResponseOf,
  type RowView
} from '@shared/contracts';
import type { ImportResult, NormalisedRow } from '../import/types';
import { ImportError } from '../import/types';
import { runImportJob, cancelImportJob } from './importService';
import { importSession } from './session';
import { projectStore, PROJECT_SCHEMA_VERSION } from './projectStore';
import { readRecentProjects } from './recent';

function failureFrom(err: unknown): { ok: false; error: ErrorInfo } {
  if (err instanceof ImportError) return { ok: false, error: { code: err.code, message: err.message } };
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  return { ok: false, error: { code: 'UNEXPECTED', message } };
}

function toRowView(row: NormalisedRow): RowView {
  return {
    sourceRow: row.sourceRow,
    status: row.status,
    ...(row.excludedReason === undefined ? {} : { excludedReason: row.excludedReason }),
    warnings: row.warnings,
    errors: row.errors,
    interpreted: row.interpreted
  };
}

function toSummary(result: ImportResult): ImportSummary {
  return {
    side: result.side,
    kind: result.kind,
    fileName: result.fileName,
    sizeBytes: result.sizeBytes,
    sha256: result.sha256,
    sheetName: result.sheetName,
    header: result.header,
    rows: result.rows.map(toRowView),
    counts: result.counts,
    control: result.control,
    warnings: result.warnings
  };
}

export class IpcArgumentError extends Error {
  constructor(channel: string, detail: string) {
    super(`Invalid arguments for ${channel}: ${detail}`);
    this.name = 'IpcArgumentError';
  }
}

type Handler<C extends ContractChannel> = (
  request: RequestOf<C>,
  event: IpcMainInvokeEvent
) => Promise<ResponseOf<C>> | ResponseOf<C>;

/**
 * Validates `rawArgs` for `channel` and returns the typed request, or throws.
 * Exported so the validation layer can be unit-tested without Electron.
 */
export function parseIpcRequest<C extends ContractChannel>(channel: C, rawArgs: unknown[]): RequestOf<C> {
  if (rawArgs.length > 1) throw new IpcArgumentError(channel, 'too many arguments');
  const parsed = IPC_CONTRACTS[channel].request.safeParse(rawArgs[0]);
  if (!parsed.success) {
    throw new IpcArgumentError(channel, parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; '));
  }
  return parsed.data as RequestOf<C>;
}

function handle<C extends ContractChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    const request = parseIpcRequest(channel, rawArgs);
    const response = await handler(request, event);
    // Defence in depth: never hand the renderer something that violates the contract.
    const checked = IPC_CONTRACTS[channel].response.safeParse(response);
    if (!checked.success) throw new Error(`Handler for ${channel} produced an invalid response`);
    return checked.data;
  });
}

export interface IpcContext {
  getWindow(): BrowserWindow | null;
  takePendingOpenFile(): string | null;
}

function inputKind(path: string): NonNullable<PickedFile>['kind'] | null {
  const ext = extname(path).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.xlsx') return 'xlsx';
  return null;
}

export function registerIpcHandlers(ctx: IpcContext): void {
  handle(IPC_CHANNELS.appGetInfo, (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux',
    electron: process.versions.electron ?? 'unknown',
    engineVersion: ENGINE_VERSION,
    theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    locale: app.getLocale()
  }));

  handle(IPC_CHANNELS.appGetRecentProjects, () => readRecentProjects());

  handle(IPC_CHANNELS.appGetPendingOpenFile, () => {
    const path = ctx.takePendingOpenFile();
    return path ? { path } : null;
  });

  handle(IPC_CHANNELS.dialogPickInputFile, async (request) => {
    const owner = ctx.getWindow();
    const title = request.title ?? (request.side === 'statement' ? 'Choose supplier statement' : 'Choose AP ledger export');
    const options: Electron.OpenDialogOptions = {
      title,
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheets and CSV', extensions: ['csv', 'xlsx'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'Excel workbook', extensions: ['xlsx'] }
      ]
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const kind = inputKind(path);
    if (!kind) return null;
    const info = await stat(path);
    return { path, name: basename(path), sizeBytes: info.size, kind };
  });

  handle(IPC_CHANNELS.dialogPickProjectPath, async (request) => {
    const owner = ctx.getWindow();
    const filters = [{ name: 'StatementDesk project', extensions: [PROJECT_FILE_EXTENSION] }];
    if (request.mode === 'open') {
      const options: Electron.OpenDialogOptions = { title: 'Open reconciliation project', properties: ['openFile'], filters };
      const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
      const path = result.filePaths[0];
      return result.canceled || !path ? null : { path };
    }
    const options: Electron.SaveDialogOptions = {
      title: 'Save reconciliation project',
      defaultPath: `${request.suggestedName ?? 'Reconciliation'}.${PROJECT_FILE_EXTENSION}`,
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation']
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    const path = result.filePath.toLowerCase().endsWith(`.${PROJECT_FILE_EXTENSION}`)
      ? result.filePath
      : `${result.filePath}.${PROJECT_FILE_EXTENSION}`;
    return { path };
  });

  handle(IPC_CHANNELS.dialogPickExportPath, async (request) => {
    const owner = ctx.getWindow();
    const names = { xlsx: 'Excel workbook', csv: 'CSV file', html: 'HTML report' } as const;
    const options: Electron.SaveDialogOptions = {
      title: `Export ${names[request.kind]}`,
      defaultPath: `${request.suggestedName ?? 'StatementDesk-export'}.${request.kind}`,
      filters: [{ name: names[request.kind], extensions: [request.kind] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : { path: result.filePath };
  });

  // Phase 3 keeps the open project in memory so the Setup -> Import -> Validation
  // flow works end to end. Phase 4 backs project.create/open with the SQLite
  // repository (writing/reading the .statementdesk file at `path`).
  handle(IPC_CHANNELS.projectCreate, (request) => {
    const now = new Date().toISOString();
    const summary: ProjectSummary = {
      projectId: randomUUID(),
      path: request.path,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      setup: request.setup,
      createdAt: now,
      updatedAt: now
    };
    projectStore.set(summary);
    importSession.bindProject(summary.projectId);
    return { ok: true as const, value: summary };
  });

  handle(IPC_CHANNELS.projectOpen, () => ({
    ok: false as const,
    error: { code: 'NOT_IMPLEMENTED', message: 'Opening saved projects becomes available once persistence lands.' }
  }));

  handle(IPC_CHANNELS.projectClose, () => {
    projectStore.clear();
    importSession.clear();
    return { ok: true as const, value: null };
  });

  handle(IPC_CHANNELS.projectGetState, (): ProjectState => ({ project: projectStore.get() }));

  /* ------------------------- Import (worker-based) ------------------------- */

  handle(IPC_CHANNELS.importInspect, async (request) => {
    try {
      const result = await runImportJob<InspectResult>(`inspect:${randomUUID()}`, {
        op: 'inspect',
        payload: { path: request.path, kind: request.kind, sheetName: request.sheetName }
      });
      return { ok: true as const, value: result };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.importPreview, async (request) => {
    try {
      const result = await runImportJob<MappingPreview>(`preview:${randomUUID()}`, {
        op: 'preview',
        payload: { config: request.config, limit: request.limit }
      });
      return { ok: true as const, value: result };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.importRun, async (request) => {
    const { requestId, config } = request;
    try {
      const result = await runImportJob<ImportResult>(requestId, { op: 'run', payload: { config } }, (fraction) => {
        ctx.getWindow()?.webContents.send(IPC_EVENTS.importProgress, { requestId, side: config.side, fraction });
      });
      importSession.bindProject(config.scope.projectId);
      importSession.set(config.side, config, result);
      return { ok: true as const, value: toSummary(result) };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.importCancel, (request) => {
    cancelImportJob(request.requestId);
    return { ok: true as const, value: null };
  });
}
