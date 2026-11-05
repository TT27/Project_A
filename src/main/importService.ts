/**
 * Main-process client for the import worker: spawns a worker per request, enforces
 * a wall-clock timeout, forwards progress and supports cancellation by request id.
 */
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { LIMITS } from '../import/limits';
import { ImportError } from '../import/types';
import type { WorkerJob, WorkerMessage } from './importWorkerTypes';

const activeWorkers = new Map<string, Worker>();

function workerPath(): string {
  // Built alongside the main entry as out/main/importWorker.js.
  return join(__dirname, 'importWorker.js');
}

export function runImportJob<T>(requestId: string, job: WorkerJob, onProgress?: (fraction: number) => void): Promise<T> {
  if (activeWorkers.has(requestId)) {
    return Promise.reject(new ImportError('IMPORT_IN_PROGRESS', 'An import with this request ID is already running'));
  }
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(workerPath(), { workerData: job });
    activeWorkers.set(requestId, worker);
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeWorkers.get(requestId) === worker) activeWorkers.delete(requestId);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new ImportError('TIMEOUT', 'The import timed out and was cancelled')));
    }, LIMITS.operationTimeoutMs);

    worker.on('message', (raw: unknown) => {
      const msg = raw as WorkerMessage;
      if (msg.type === 'progress') onProgress?.(msg.fraction);
      else if (msg.type === 'done') finish(() => resolve(msg.result as T));
      else finish(() => reject(new ImportError(msg.code, msg.message)));
    });
    worker.on('error', (err) => finish(() => reject(err)));
    worker.on('exit', (code) => {
      if (!settled) finish(() => reject(new ImportError('WORKER_EXIT', `Import worker stopped unexpectedly (code ${code})`)));
    });
  });
}

/** Terminates an in-flight import job. Returns true when a job was cancelled. */
export function cancelImportJob(requestId: string): boolean {
  const worker = activeWorkers.get(requestId);
  if (!worker) return false;
  activeWorkers.delete(requestId);
  void worker.terminate();
  return true;
}
