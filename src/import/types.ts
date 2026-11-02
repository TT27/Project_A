/**
 * Import-layer types. Boundary types (those that cross IPC) are defined once in
 * @shared/contracts and re-exported here; only file-internal structures live here.
 * This layer reads CSV/XLSX files (Node + ExcelJS/PapaParse) and produces canonical
 * rows via the pure domain parsers — it must never live in src/domain.
 */
import type { CanonicalRow } from '@domain/models';
import type {
  ColumnMapping,
  ImportConfig,
  ImportCounts,
  InputKind,
  InspectResult,
  NormaliseOptions,
  ProjectScope,
  RowIssue,
  RowStatus,
  SideControlReport
} from '@shared/contracts';

export type {
  ColumnMapping,
  ImportConfig,
  ImportCounts,
  InputKind,
  InspectResult,
  NormaliseOptions,
  ProjectScope,
  RowIssue,
  RowStatus,
  SideControlReport
};
export type { SheetInfo } from '@shared/contracts';

/** One physical row read from a source file, with traceability metadata (internal). */
export interface RawRow {
  /** 1-based source row number as it appears in the file/worksheet. */
  index: number;
  cells: string[];
  hidden: boolean;
  /** Column indices (0-based) that were formula cells. */
  formulaColumns: number[];
  /** Column indices (0-based) that were formula cells with no usable cached value. */
  formulaWithoutValue: number[];
  /** Column indices (0-based) whose value was stored numerically (XLSX). */
  numericColumns: number[];
}

export interface RawGrid {
  sheetName: string | null;
  rows: RawRow[];
  columnCount: number;
}

export interface InterpretedValues {
  reference: string;
  documentType: string;
  documentDate: string;
  outstanding: string;
}

/** Rich internal row (carries canonical row + raw cells; lean RowView crosses IPC). */
export interface NormalisedRow {
  sourceRow: number;
  status: RowStatus;
  excludedReason?: string;
  warnings: RowIssue[];
  errors: RowIssue[];
  canonical?: CanonicalRow;
  interpreted: InterpretedValues;
  rawCells: string[];
}

export interface NormaliseResult {
  rows: NormalisedRow[];
  canonicalRows: CanonicalRow[];
  counts: ImportCounts;
}

/** Rich internal result: canonical rows stay in main; a lean summary crosses IPC. */
export interface ImportResult {
  side: ImportConfig['side'];
  kind: InputKind;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  sheetName: string | null;
  header: string[];
  rows: NormalisedRow[];
  canonicalRows: CanonicalRow[];
  counts: ImportCounts;
  control: SideControlReport;
  warnings: RowIssue[];
}

export class ImportError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
