import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runImport } from '../../src/import';
import { registerIpcHandlers } from '../../src/main/ipc';
import { projectStore } from '../../src/main/projectStore';
import type { WorkerJob } from '../../src/main/importWorkerTypes';
import { IPC_CHANNELS, IPC_CONTRACTS, type ContractChannel, type ImportConfig, type RequestOf, type ResponseOf } from '../../src/shared/contracts';

const { handlers, runImportJob, app } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => Promise<unknown>>(),
  runImportJob: vi.fn<(id: string, job: WorkerJob) => Promise<unknown>>(),
  app: { isPackaged: false, getAppPath: vi.fn<() => string>() }
}));
vi.mock('electron', () => ({ app, ipcMain: { handle: (channel: string, handler: (event: unknown, request: unknown) => Promise<unknown>) => handlers.set(channel, handler) } }));
vi.mock('../../src/main/importService', () => ({ runImportJob, cancelImportJob: vi.fn() }));
vi.mock('../../src/main/recent', () => ({ addRecentProject: vi.fn().mockResolvedValue(undefined) }));

const samplesDir = join(__dirname, '..', '..', 'samples');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sd-project-ipc-'));
  runImportJob.mockReset();
  app.isPackaged = false;
  app.getAppPath.mockReset().mockReturnValue(join(samplesDir, '..'));
  registerIpcHandlers({ getWindow: () => null, takePendingOpenFile: () => null });
});

afterEach(() => {
  projectStore.clear();
  rmSync(dir, { recursive: true, force: true });
});

async function invoke<C extends ContractChannel>(channel: C, request?: RequestOf<C>): Promise<ResponseOf<C>> {
  const response = await handlers.get(channel)!(null, request);
  return IPC_CONTRACTS[channel].response.parse(response) as ResponseOf<C>;
}

async function create(name: string) {
  const path = join(dir, `${name}.statementdesk`);
  const result = await invoke(IPC_CHANNELS.projectCreate, {
    path,
    setup: { projectName: name, supplierName: 'Supplier One', supplierId: 'SUP001', cutoffDate: '2026-09-30', currency: 'AUD', comparableBalancesConfirmed: true }
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function statementConfig(projectId: string): ImportConfig {
  return {
    side: 'statement', path: join(samplesDir, 'statement_SUP001_2026-09-30.csv'), kind: 'csv', sheetName: null,
    headerRow: 1, dataStartRow: 2, dataEndRow: null, excludedRows: [],
    mapping: { reference: 1, documentType: 2, documentDate: 3, outstanding: 4, supplier: 0, currency: -1, asOfDate: -1 },
    scope: { projectId, sourceId: `${projectId}:statement`, supplierId: 'SUP001', currency: 'AUD', cutoffDate: '2026-09-30' },
    options: { dateFormat: 'DD/MM/YYYY', signMode: 'signed_amount', decimalSeparator: '.', allowParentheses: true, mappingVersion: 1 },
    controlTotalText: null
  };
}

it('rejects an import that finishes after a different project is opened', async () => {
  const other = await create('other');
  const original = await create('original');
  const config = statementConfig(original.projectId);
  const imported = await runImport(config);
  let complete!: (value: typeof imported) => void;
  runImportJob.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));

  const pending = invoke(IPC_CHANNELS.importRun, { requestId: 'old-import', config });
  expect(await invoke(IPC_CHANNELS.projectOpen, { path: other.path })).toMatchObject({ ok: true, value: { project: other, run: null } });
  complete(imported);

  expect(await pending).toMatchObject({ ok: false, error: { code: 'IMPORT_SUPERSEDED' } });
  expect(projectStore.requireRepo().hasImport('statement')).toBe(false);
  expect(await invoke(IPC_CHANNELS.importRun, { requestId: 'stale-request', config })).toMatchObject({ ok: false, error: { code: 'PROJECT_CHANGED' } });
  expect(runImportJob).toHaveBeenCalledTimes(1);
});

it('loads a packaged sample from resources and reopens it with its run and both imports', async () => {
  app.isPackaged = true;
  cpSync(samplesDir, join(dir, 'samples'), { recursive: true });
  const originalResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: dir });
  runImportJob.mockImplementation(async (_id, job) => {
    if (job.op !== 'run') throw new Error('Unexpected worker job');
    expect(job.payload.config.path.startsWith(join(dir, 'samples'))).toBe(true);
    return runImport(job.payload.config);
  });

  let samplePath: string | undefined;
  try {
    const sample = await invoke(IPC_CHANNELS.appOpenSample);
    if (!sample.ok) throw new Error(sample.error.message);
    samplePath = sample.value.path;
    const run = await invoke(IPC_CHANNELS.reconcileRun, { projectId: sample.value.projectId });
    if (!run.ok) throw new Error(run.error.message);
    await invoke(IPC_CHANNELS.projectClose);

    const reopened = await invoke(IPC_CHANNELS.projectOpen, { path: samplePath });
    expect(reopened).toMatchObject({
      ok: true,
      value: {
        project: sample.value,
        run: { runId: run.value.runId, summary: { differenceCents: 32700 } },
        imports: [{ side: 'ledger', counts: { valid: 7 } }, { side: 'statement', counts: { valid: 8 } }]
      }
    });
    expect(app.getAppPath).not.toHaveBeenCalled();
  } finally {
    if (originalResources) Object.defineProperty(process, 'resourcesPath', originalResources);
    else Reflect.deleteProperty(process, 'resourcesPath');
    projectStore.clear();
    if (samplePath) rmSync(join(samplePath, '..'), { recursive: true, force: true });
  }
});
