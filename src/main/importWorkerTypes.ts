/** Message contract between the main process and the import worker thread. */
import type { ImportConfig, InputKind, InspectResult, MappingPreview } from '@shared/contracts';
import type { ImportResult } from '../import/types';

export type WorkerJob =
  | { op: 'inspect'; payload: { path: string; kind?: InputKind | undefined; sheetName?: string | undefined } }
  | { op: 'preview'; payload: { config: ImportConfig; limit?: number | undefined } }
  | { op: 'run'; payload: { config: ImportConfig } };

export type WorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; result: InspectResult | MappingPreview | ImportResult }
  | { type: 'error'; code: string; message: string };
