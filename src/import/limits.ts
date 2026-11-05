/** Defensive limits for untrusted input files. */
export const LIMITS = {
  /** ~50 MB maximum source file size. */
  maxFileBytes: 50 * 1024 * 1024,
  /** Maximum number of data rows accepted per side. */
  maxDataRows: 10_000,
  /** Maximum number of physical rows scanned (includes header/blank/excluded). */
  maxScanRows: 20_000,
  /** Maximum number of columns. */
  maxColumns: 256,
  /** Number of rows shown in the inspect preview grid. */
  previewRows: 25,
  /** Worker wall-clock timeout for a single file operation. */
  operationTimeoutMs: 60_000
} as const;
