/**
 * IPC handler registration. Every handler validates its arguments against the
 * shared Zod contract before doing any work, independent of the preload's own check.
 */
import { randomUUID } from 'node:crypto';
import { stat, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { release, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { app, dialog, ipcMain, nativeTheme, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { ENGINE_VERSION } from '@domain/version';
import {
  APP_NAME,
  ImportSummarySchema,
  ProjectOpenResponseSchema,
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
  type RequestOf,
  type ResponseOf,
  type RowView,
  type Side
} from '@shared/contracts';
import type { ImportConfig, ImportResult, NormalisedRow } from '../import/types';
import { ImportError } from '../import/types';
import { runImportJob, cancelImportJob } from './importService';
import { importSession } from './session';
import { projectStore } from './projectStore';
import { ProjectRepository, StorageError } from '../storage';
import { buildReport, buildWorkbookBuffer, buildExceptionsCsv, buildHtmlReport, makeDiagnostics } from '../export';
import { authorisePath, isAuthorisedPath } from './exportAuth';
import { readRecentProjects, addRecentProject } from './recent';

function failureFrom(err: unknown): { ok: false; error: ErrorInfo } {
  if (err instanceof ImportError || err instanceof StorageError) return { ok: false, error: { code: err.code, message: err.message } };
  const message = err instanceof Error ? err.message.slice(0, 2000) : 'An unexpected error occurred';
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
  refreshRecentProjects?(): Promise<void>;
}

function inputKind(path: string): NonNullable<PickedFile>['kind'] | null {
  const ext = extname(path).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.xlsx') return 'xlsx';
  return null;
}

export function registerIpcHandlers(ctx: IpcContext): void {
  let projectSelection = 0;
  let recentUpdate = Promise.resolve();
  const pendingImports = new Map<Side, symbol>();

  function rememberProject(path: string): void {
    recentUpdate = recentUpdate.then(async () => {
      await addRecentProject(path);
      await ctx.refreshRecentProjects?.();
    }).catch((err: unknown) => console.warn('Could not update recent projects', err));
  }

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

  // Test/e2e helper: create a fresh temp project and import the bundled golden
  // CSV samples into it, so the e2e can drive a full reconcile/review flow without
  // native dialogs. Reuses the exact same create + import + persist path as production.
  handle(IPC_CHANNELS.appOpenSample, async () => {
    const selection = ++projectSelection;
    let pendingRepo: ProjectRepository | undefined;
    try {
      const samplesDir = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'samples');
      const projectPath = join(mkdtempSync(join(tmpdir(), 'statementdesk-sample-')), `golden${PROJECT_FILE_EXTENSION}`);
      const repo = ProjectRepository.create(projectPath, {
        projectName: 'Golden sample',
        supplierName: 'Supplier One',
        supplierId: 'SUP001',
        cutoffDate: '2026-09-30',
        currency: 'AUD',
        comparableBalancesConfirmed: true
      });
      pendingRepo = repo;

      const mapping = { reference: 1, documentType: 2, documentDate: 3, outstanding: 4, supplier: 0, currency: -1, asOfDate: -1 };
      const sides: { side: 'statement' | 'ledger'; file: string; dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' }[] = [
        { side: 'statement', file: 'statement_SUP001_2026-09-30.csv', dateFormat: 'DD/MM/YYYY' },
        { side: 'ledger', file: 'ap_ledger_SUP001_2026-09-30.csv', dateFormat: 'YYYY-MM-DD' }
      ];
      for (const s of sides) {
        const config: ImportConfig = {
          side: s.side,
          path: join(samplesDir, s.file),
          kind: 'csv',
          sheetName: null,
          headerRow: 1,
          dataStartRow: 2,
          dataEndRow: null,
          excludedRows: [],
          mapping,
          scope: { projectId: repo.projectId, sourceId: `src-${s.side}`, supplierId: 'SUP001', currency: 'AUD', cutoffDate: '2026-09-30' },
          options: { signMode: 'signed_amount', dateFormat: s.dateFormat, decimalSeparator: '.', allowParentheses: true, mappingVersion: 1 },
          controlTotalText: null
        };
        const result = await runImportJob<ImportResult>(`sample:${randomUUID()}`, { op: 'run', payload: { config } });
        if (selection !== projectSelection) throw new StorageError('PROJECT_CHANGED', 'The sample was cancelled because the active project changed.');
        repo.saveImport({
          config,
          fileName: result.fileName,
          kind: result.kind,
          sha256: result.sha256,
          sizeBytes: result.sizeBytes,
          sheetName: result.sheetName,
          importedCents: result.control.importedCents,
          controlCents: result.control.controlCents,
          controlStatus: result.control.status,
          counts: result.counts,
          canonicalRows: result.canonicalRows
        });
      }
      const project = repo.getProject();
      projectStore.set(repo);
      pendingRepo = undefined;
      importSession.bindProject(project.projectId);
      rememberProject(projectPath);
      return { ok: true as const, value: project };
    } catch (err) {
      return failureFrom(err);
    } finally {
      pendingRepo?.close();
    }
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
    if (result.canceled || !result.filePath) return null;
    authorisePath(result.filePath);
    return { path: result.filePath };
  });

  // SQLite-backed: create writes a new .statementdesk file at `path`; open reads one.
  handle(IPC_CHANNELS.projectCreate, (request) => {
    try {
      const repo = ProjectRepository.create(request.path, request.setup);
      projectStore.set(repo);
      projectSelection += 1;
      importSession.bindProject(repo.projectId);
      rememberProject(request.path);
      return { ok: true as const, value: repo.getProject() };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.projectOpen, (request) => {
    let pendingRepo: ProjectRepository | undefined;
    try {
      const repo = ProjectRepository.open(request.path);
      pendingRepo = repo;
      const value = {
        project: repo.getProject(),
        run: repo.latestRun(),
        imports: repo.getSources().map((source) => ({
          ...source,
          header: [],
          rows: [],
          warnings: [],
          control: {
            importedCents: source.importedCents,
            controlCents: source.controlCents,
            varianceCents: source.controlCents === null ? null : source.importedCents - source.controlCents,
            status: source.controlStatus
          }
        }))
      };
      const response = ProjectOpenResponseSchema.parse({ ok: true, value });
      projectStore.set(repo);
      pendingRepo = undefined;
      projectSelection += 1;
      importSession.bindProject(repo.projectId);
      rememberProject(request.path);
      return response;
    } catch (err) {
      return failureFrom(err);
    } finally {
      pendingRepo?.close();
    }
  });

  handle(IPC_CHANNELS.projectClose, () => {
    projectSelection += 1;
    projectStore.clear();
    importSession.clear();
    return { ok: true as const, value: null };
  });

  handle(IPC_CHANNELS.projectGetState, (): ProjectState => ({ project: projectStore.get() }));

  handle(IPC_CHANNELS.projectSaveSettings, (request) => {
    try {
      const repo = projectStore.requireRepo();
      return { ok: true as const, value: repo.updateSettings(request.settings) };
    } catch (err) {
      return failureFrom(err);
    }
  });

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
    const ticket = Symbol();
    try {
      const repo = projectStore.requireRepo();
      const project = repo.getProject();
      const { scope, side } = config;
      if (scope.projectId !== project.projectId || scope.supplierId !== project.setup.supplierId ||
          scope.cutoffDate !== project.setup.cutoffDate || scope.currency !== project.setup.currency) {
        throw new StorageError('PROJECT_CHANGED', 'The import does not belong to the active project.');
      }
      pendingImports.set(side, ticket);
      const isCurrent = () => projectStore.repository() === repo && pendingImports.get(side) === ticket;
      const result = await runImportJob<ImportResult>(requestId, { op: 'run', payload: { config } }, (fraction) => {
        if (isCurrent()) ctx.getWindow()?.webContents.send(IPC_EVENTS.importProgress, { requestId, side, fraction });
      });
      if (!isCurrent()) {
        throw new StorageError('IMPORT_SUPERSEDED', 'The active project or import changed before this import finished.');
      }
      const summary = ImportSummarySchema.parse(toSummary(result));
      repo.saveImport({ ...result, config, importedCents: result.control.importedCents, controlCents: result.control.controlCents, controlStatus: result.control.status });
      importSession.set(side, config, result);
      return { ok: true as const, value: summary };
    } catch (err) {
      return failureFrom(err);
    } finally {
      if (pendingImports.get(config.side) === ticket) pendingImports.delete(config.side);
    }
  });

  handle(IPC_CHANNELS.importCancel, (request) => {
    cancelImportJob(request.requestId);
    return { ok: true as const, value: null };
  });

  /* --------------------------- Reconcile & review -------------------------- */

  handle(IPC_CHANNELS.reconcileRun, (request) => {
    try {
      const repo = projectStore.requireRepo();
      if (request?.projectId && request.projectId !== repo.projectId) {
        throw new StorageError('PROJECT_CHANGED', 'Open the intended project before running the reconciliation.');
      }
      return { ok: true as const, value: repo.createRun(request?.acknowledgeIncompleteDraft) };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.reconcileGetRun, (request) => {
    try {
      return { ok: true as const, value: projectStore.requireRepo().getRun(request.runId) };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.reconcileListRuns, () => {
    try {
      return { ok: true as const, value: projectStore.requireRepo().listRuns() };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.reviewRecord, (request) => {
    try {
      const repo = projectStore.requireRepo();
      const event = repo.recordReview({
        outcomeKey: request.outcomeKey,
        runId: request.runId ?? null,
        decision: request.decision,
        ...(request.reviewer === undefined ? {} : { reviewer: request.reviewer }),
        ...(request.note === undefined ? {} : { note: request.note }),
        ...(request.supersedesId === undefined ? {} : { supersedesId: request.supersedesId })
      });
      return { ok: true as const, value: event };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.reviewList, () => {
    try {
      return { ok: true as const, value: projectStore.requireRepo().listReviews() };
    } catch (err) {
      return failureFrom(err);
    }
  });

  /* ------------------------------- Exports -------------------------------- */

  handle(IPC_CHANNELS.exportWrite, async (request) => {
    try {
      // The destination must be a path the user chose through a native save dialog
      // in this session; refuse anything else (guards path traversal / stray writes).
      if (!isAuthorisedPath(request.destPath)) {
        return { ok: false as const, error: { code: 'UNAUTHORISED_PATH', message: 'Choose a destination with the Save dialog before exporting.' } };
      }
      const repo = projectStore.requireRepo();
      const run = repo.getRun(request.runId);
      const model = buildReport({ repo, run, appVersion: app.getVersion() });
      if (request.kind === 'csv' && run.settings.invalidRowCount !== 0) {
        throw new StorageError('DRAFT_CSV_UNAVAILABLE', 'The exceptions CSV cannot show draft status. Choose Excel or HTML for an incomplete draft.');
      }

      let data: Buffer;
      if (request.kind === 'xlsx') data = await buildWorkbookBuffer(model);
      else if (request.kind === 'csv') data = Buffer.from(buildExceptionsCsv(model), 'utf8');
      else data = Buffer.from(buildHtmlReport(model), 'utf8');

      await writeFile(request.destPath, data);
      return { ok: true as const, value: { path: request.destPath, bytes: data.byteLength } };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.diagnosticsBuild, () => {
    try {
      const repo = projectStore.repository();
      const run = repo?.latestRun() ?? null;
      const diagnostics = makeDiagnostics({
        appVersion: app.getVersion(),
        platform: process.platform,
        osVersion: release(),
        electronVersion: process.versions.electron ?? 'unknown',
        engineVersion: ENGINE_VERSION,
        statementRowCount: run?.summary.statementRowCount ?? null,
        ledgerRowCount: run?.summary.ledgerRowCount ?? null,
        exceptionCount: run?.summary.exceptionCount ?? null,
        errorCodes: []
      });
      return { ok: true as const, value: diagnostics };
    } catch (err) {
      return failureFrom(err);
    }
  });

  handle(IPC_CHANNELS.feedbackSave, async (request) => {
    try {
      if (!isAuthorisedPath(request.destPath)) {
        return { ok: false as const, error: { code: 'UNAUTHORISED_PATH', message: 'Choose a destination with the Save dialog before saving feedback.' } };
      }
      const payload = {
        kind: 'statementdesk-feedback',
        savedAt: new Date().toISOString(),
        ...request.feedback,
        diagnostics: request.feedback.includeDiagnostics ? request.feedback.diagnostics : null
      };
      const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      await writeFile(request.destPath, data);
      return { ok: true as const, value: { path: request.destPath, bytes: data.byteLength } };
    } catch (err) {
      return failureFrom(err);
    }
  });
}
