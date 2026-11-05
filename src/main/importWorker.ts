/**
 * Import worker thread. Runs the CPU/IO-bound file reading and normalisation off
 * the main thread so the UI stays responsive, then streams progress and a single
 * result message back. One worker handles exactly one job and then exits.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { inspectInput, runImport, runPreview } from '../import';
import type { WorkerJob, WorkerMessage } from './importWorkerTypes';

function post(message: WorkerMessage): void {
  parentPort?.postMessage(message);
}

async function run(job: WorkerJob): Promise<void> {
  switch (job.op) {
    case 'inspect': {
      const { path, kind, sheetName } = job.payload;
      const result = await inspectInput(path, kind, sheetName);
      post({ type: 'done', result });
      return;
    }
    case 'preview': {
      const result = await runPreview(job.payload.config, job.payload.limit);
      post({ type: 'done', result });
      return;
    }
    case 'run': {
      const result = await runImport(job.payload.config, (fraction) => post({ type: 'progress', fraction }));
      post({ type: 'done', result });
      return;
    }
  }
}

const job = workerData as WorkerJob;
run(job).catch((err: unknown) => {
  const e = err as { code?: string; message?: string };
  post({ type: 'error', code: typeof e.code === 'string' ? e.code : 'IMPORT_FAILED', message: e.message ?? 'The import failed' });
});
