/**
 * Shared data contracts between the main process, preload bridge and renderer.
 *
 * Every IPC channel has:
 *   - a channel name (IPC_CHANNELS)
 *   - a Zod request schema (validated in preload AND in the main process)
 *   - a Zod response schema (validated in preload before handing data to the UI)
 *
 * Nothing in this module may import Electron, Node built-ins or UI code: it is
 * bundled into the sandboxed preload and the renderer.
 */
import { z } from 'zod';

export const APP_NAME = 'StatementDesk';
export const PROJECT_FILE_EXTENSION = 'statementdesk';
export const SUPPORTED_CURRENCY = 'AUD' as const;

/* ------------------------------------------------------------------------ */
/* Primitive schemas                                                         */
/* ------------------------------------------------------------------------ */

/** ISO calendar date, e.g. 2026-09-30 (no time, no timezone). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a calendar date in YYYY-MM-DD form');

export const CurrencySchema = z.literal(SUPPORTED_CURRENCY);

export const SideSchema = z.enum(['statement', 'ledger']);
export type Side = z.infer<typeof SideSchema>;

export const DocumentTypeSchema = z.enum(['invoice', 'credit_note']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** Signed integer cents with the spec's absolute line limit of 99,999,999,999 cents. */
export const MAX_ABS_LINE_CENTS = 99_999_999_999;
export const CentsSchema = z
  .number()
  .int()
  .refine((v) => Number.isSafeInteger(v) && Math.abs(v) <= MAX_ABS_LINE_CENTS, {
    message: 'Amount exceeds the supported range'
  });

/** A local filesystem path chosen by the user through a native dialog. */
export const LocalPathSchema = z.string().min(1).max(4096);

/** Non-empty identifier (UUID-ish, but we do not force a specific format). */
export const IdSchema = z.string().min(1).max(128);

/* ------------------------------------------------------------------------ */
/* Canonical row and outcomes (section 6 / 7 of the specification)          */
/* ------------------------------------------------------------------------ */

export const CanonicalRowSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  sourceId: IdSchema,
  side: SideSchema,
  sheetName: z.string().nullable(),
  sourceRow: z.number().int().positive(),
  supplierId: z.string().min(1),
  currency: CurrencySchema,
  asOfDate: IsoDateSchema,
  documentType: DocumentTypeSchema,
  referenceRaw: z.string(),
  referenceKey: z.string().min(1),
  documentDate: IsoDateSchema,
  outstandingCents: CentsSchema,
  rawCells: z.array(z.string()),
  mappingVersion: z.number().int().nonnegative()
});
export type CanonicalRow = z.infer<typeof CanonicalRowSchema>;

export const OutcomeCategorySchema = z.enum([
  'EXACT_MATCH',
  'AMOUNT_DIFFERENCE',
  'DATE_DIFFERENCE',
  'STATEMENT_ONLY',
  'LEDGER_ONLY',
  'AMBIGUOUS_DUPLICATE_GROUP'
]);
export type OutcomeCategory = z.infer<typeof OutcomeCategorySchema>;

export const ReasonCodeSchema = z.enum([
  'EXACT',
  'AMOUNT_MISMATCH',
  'DATE_MISMATCH',
  'MISSING_IN_LEDGER',
  'MISSING_IN_STATEMENT',
  'DUPLICATE_ON_STATEMENT',
  'DUPLICATE_ON_LEDGER'
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const CompletenessStatusSchema = z.enum(['Verified', 'Mismatch', 'Unverified']);
export type CompletenessStatus = z.infer<typeof CompletenessStatusSchema>;

export const ReviewDecisionSchema = z.enum(['unreviewed', 'investigate', 'explained', 'needs_source_correction']);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

/* ------------------------------------------------------------------------ */
/* IPC channel contracts                                                     */
/* ------------------------------------------------------------------------ */

export const IPC_CHANNELS = {
  appGetInfo: 'app:getInfo',
  appGetRecentProjects: 'app:getRecentProjects',
  appGetPendingOpenFile: 'app:getPendingOpenFile',
  dialogPickInputFile: 'dialog:pickInputFile',
  dialogPickProjectPath: 'dialog:pickProjectPath',
  dialogPickExportPath: 'dialog:pickExportPath',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectClose: 'project:close',
  projectGetState: 'project:getState',
  importInspect: 'import:inspect',
  importPreview: 'import:preview',
  importRun: 'import:run',
  importCancel: 'import:cancel',
  reconcileRun: 'reconcile:run',
  reconcileGetRun: 'reconcile:getRun',
  reviewRecord: 'review:record',
  reviewList: 'review:list',
  exportWrite: 'export:write',
  feedbackSave: 'feedback:save',
  diagnosticsBuild: 'diagnostics:build'
} as const;
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Main → renderer push events (menu actions, file open requests). */
export const IPC_EVENTS = {
  menuAction: 'menu:action',
  openFileRequested: 'app:openFileRequested',
  nativeThemeChanged: 'app:nativeThemeChanged',
  importProgress: 'import:progress'
} as const;

/** Payload for the import-progress push event. */
export const ImportProgressSchema = z.object({
  requestId: IdSchema,
  side: SideSchema,
  fraction: z.number().min(0).max(1)
});
export type ImportProgress = z.infer<typeof ImportProgressSchema>;

export const MenuActionSchema = z.enum([
  'new-reconciliation',
  'open-project',
  'close-project',
  'export',
  'try-sample',
  'help',
  'feedback'
]);
export type MenuAction = z.infer<typeof MenuActionSchema>;

export const NativeThemeSchema = z.enum(['light', 'dark']);
export type NativeTheme = z.infer<typeof NativeThemeSchema>;

/* app:getInfo */
export const AppInfoSchema = z.object({
  name: z.literal(APP_NAME),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  platform: z.enum(['darwin', 'win32', 'linux']),
  electron: z.string(),
  engineVersion: z.string(),
  theme: NativeThemeSchema,
  locale: z.string()
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const RecentProjectSchema = z.object({
  path: LocalPathSchema,
  name: z.string(),
  lastOpenedAt: z.string()
});
export type RecentProject = z.infer<typeof RecentProjectSchema>;
export const RecentProjectListSchema = z.array(RecentProjectSchema).max(20);

export const PendingOpenFileSchema = z.object({ path: LocalPathSchema }).nullable();

/* dialog:* */
export const PickInputFileRequestSchema = z.object({
  side: SideSchema,
  title: z.string().max(120).optional()
});
export type PickInputFileRequest = z.infer<typeof PickInputFileRequestSchema>;

export const PickedFileSchema = z
  .object({
    path: LocalPathSchema,
    name: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    kind: z.enum(['csv', 'xlsx'])
  })
  .nullable();
export type PickedFile = z.infer<typeof PickedFileSchema>;

export const PickProjectPathRequestSchema = z.object({
  mode: z.enum(['open', 'save']),
  suggestedName: z.string().max(200).optional()
});
export type PickProjectPathRequest = z.infer<typeof PickProjectPathRequestSchema>;

export const PickedPathSchema = z.object({ path: LocalPathSchema }).nullable();
export type PickedPath = z.infer<typeof PickedPathSchema>;

export const ExportKindSchema = z.enum(['xlsx', 'csv', 'html']);
export type ExportKind = z.infer<typeof ExportKindSchema>;

export const PickExportPathRequestSchema = z.object({
  kind: ExportKindSchema,
  suggestedName: z.string().max(200).optional()
});
export type PickExportPathRequest = z.infer<typeof PickExportPathRequestSchema>;

/* project:* — Phase 1 defines the surface; Phase 4 fills in persistence. */
export const ProjectSetupSchema = z.object({
  projectName: z.string().trim().min(1).max(200),
  supplierName: z.string().trim().min(1).max(200),
  supplierId: z.string().trim().min(1).max(64),
  cutoffDate: IsoDateSchema,
  currency: CurrencySchema,
  comparableBalancesConfirmed: z.literal(true)
});
export type ProjectSetup = z.infer<typeof ProjectSetupSchema>;

export const ProjectCreateRequestSchema = z.object({
  path: LocalPathSchema,
  setup: ProjectSetupSchema
});
export const ProjectOpenRequestSchema = z.object({ path: LocalPathSchema });

export const ProjectSummarySchema = z.object({
  projectId: IdSchema,
  path: LocalPathSchema,
  schemaVersion: z.number().int().positive(),
  setup: ProjectSetupSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectStateSchema = z.object({ project: ProjectSummarySchema.nullable() });
export type ProjectState = z.infer<typeof ProjectStateSchema>;

/* Generic result envelope used by handlers that can fail in user-meaningful ways. */
export const ErrorInfoSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().max(2000),
  details: z.array(z.string().max(500)).max(50).optional()
});
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

export function resultSchema<T extends z.ZodTypeAny>(value: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: ErrorInfoSchema })
  ]);
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorInfo };

export const ProjectCreateResponseSchema = resultSchema(ProjectSummarySchema);
export const ProjectOpenResponseSchema = resultSchema(ProjectSummarySchema);
export const VoidResultSchema = resultSchema(z.null());

/* ------------------------------------------------------------------------ */
/* Import and mapping (section 6)                                             */
/* ------------------------------------------------------------------------ */

export const InputKindSchema = z.enum(['csv', 'xlsx']);
export type InputKind = z.infer<typeof InputKindSchema>;

export const SignModeSchema = z.enum(['signed_amount', 'by_document_type']);
export type SignMode = z.infer<typeof SignModeSchema>;

export const DateFormatSchema = z.enum(['DD/MM/YYYY', 'YYYY-MM-DD']);
export type DateFormat = z.infer<typeof DateFormatSchema>;

export const SheetInfoSchema = z.object({
  name: z.string(),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  hidden: z.boolean()
});
export type SheetInfo = z.infer<typeof SheetInfoSchema>;

export const InspectPreviewRowSchema = z.object({
  index: z.number().int().positive(),
  cells: z.array(z.string()),
  hidden: z.boolean(),
  hasFormula: z.boolean(),
  formulaWithoutValue: z.boolean()
});

export const InspectPreviewGridSchema = z.object({
  sheetName: z.string(),
  columnCount: z.number().int().nonnegative(),
  rows: z.array(InspectPreviewRowSchema)
});

export const InspectResultSchema = z.object({
  kind: InputKindSchema,
  sheets: z.array(SheetInfoSchema),
  defaultSheet: z.string(),
  headerRowGuess: z.number().int().positive(),
  preview: InspectPreviewGridSchema
});
export type InspectResult = z.infer<typeof InspectResultSchema>;

/** Canonical field -> 0-based source column index; -1 means "not mapped". */
const ColumnIndexSchema = z.number().int().min(-1);
export const ColumnMappingSchema = z.object({
  reference: ColumnIndexSchema,
  documentType: ColumnIndexSchema,
  documentDate: ColumnIndexSchema,
  outstanding: ColumnIndexSchema,
  supplier: ColumnIndexSchema,
  currency: ColumnIndexSchema,
  asOfDate: ColumnIndexSchema
});
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const ProjectScopeSchema = z.object({
  projectId: IdSchema,
  sourceId: IdSchema,
  supplierId: z.string().min(1),
  currency: CurrencySchema,
  cutoffDate: IsoDateSchema
});
export type ProjectScope = z.infer<typeof ProjectScopeSchema>;

export const NormaliseOptionsSchema = z.object({
  signMode: SignModeSchema,
  dateFormat: DateFormatSchema,
  decimalSeparator: z.enum(['.', ',']),
  allowParentheses: z.boolean(),
  mappingVersion: z.number().int().nonnegative()
});
export type NormaliseOptions = z.infer<typeof NormaliseOptionsSchema>;

export const RowIssueSchema = z.object({
  code: z.string().min(1).max(64),
  field: z.string().max(64).optional(),
  message: z.string().max(500)
});
export type RowIssue = z.infer<typeof RowIssueSchema>;

export const RowStatusSchema = z.enum(['valid', 'invalid', 'excluded']);
export type RowStatus = z.infer<typeof RowStatusSchema>;

export const InterpretedValuesSchema = z.object({
  reference: z.string(),
  documentType: z.string(),
  documentDate: z.string(),
  outstanding: z.string()
});

/** Lean row view that crosses IPC (no canonical row / raw cells). */
export const RowViewSchema = z.object({
  sourceRow: z.number().int().positive(),
  status: RowStatusSchema,
  excludedReason: z.string().max(200).optional(),
  warnings: z.array(RowIssueSchema),
  errors: z.array(RowIssueSchema),
  interpreted: InterpretedValuesSchema
});
export type RowView = z.infer<typeof RowViewSchema>;

/** Preview row additionally carries the original cells for original-vs-interpreted display. */
export const MappingPreviewRowSchema = RowViewSchema.extend({ rawCells: z.array(z.string()) });
export type MappingPreviewRow = z.infer<typeof MappingPreviewRowSchema>;

export const ImportCountsSchema = z.object({
  imported: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative()
});
export type ImportCounts = z.infer<typeof ImportCountsSchema>;

export const SideControlReportSchema = z.object({
  importedCents: CentsSchema,
  controlCents: CentsSchema.nullable(),
  varianceCents: z.number().int().nullable(),
  status: CompletenessStatusSchema
});
export type SideControlReport = z.infer<typeof SideControlReportSchema>;

export const ImportConfigSchema = z.object({
  side: SideSchema,
  path: LocalPathSchema,
  kind: InputKindSchema,
  sheetName: z.string().nullable(),
  headerRow: z.number().int().positive(),
  dataStartRow: z.number().int().positive(),
  dataEndRow: z.number().int().positive().nullable(),
  excludedRows: z.array(z.number().int().positive()).max(20_000),
  mapping: ColumnMappingSchema,
  scope: ProjectScopeSchema,
  options: NormaliseOptionsSchema,
  controlTotalText: z.string().max(64).nullable()
});
export type ImportConfig = z.infer<typeof ImportConfigSchema>;

/** Full import summary returned to the renderer (canonical rows stay in main). */
export const ImportSummarySchema = z.object({
  side: SideSchema,
  kind: InputKindSchema,
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  sheetName: z.string().nullable(),
  header: z.array(z.string()),
  rows: z.array(RowViewSchema),
  counts: ImportCountsSchema,
  control: SideControlReportSchema,
  warnings: z.array(RowIssueSchema)
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

export const MappingPreviewSchema = z.object({
  sheetName: z.string().nullable(),
  header: z.array(z.string()),
  rows: z.array(MappingPreviewRowSchema),
  counts: ImportCountsSchema,
  control: SideControlReportSchema
});
export type MappingPreview = z.infer<typeof MappingPreviewSchema>;

/* import:* request/response schemas */
export const ImportInspectRequestSchema = z.object({
  side: SideSchema,
  path: LocalPathSchema,
  kind: InputKindSchema.optional(),
  sheetName: z.string().optional()
});
export const ImportInspectResponseSchema = resultSchema(InspectResultSchema);

export const ImportPreviewRequestSchema = z.object({ config: ImportConfigSchema, limit: z.number().int().positive().max(500).optional() });
export const ImportPreviewResponseSchema = resultSchema(MappingPreviewSchema);

export const ImportRunRequestSchema = z.object({ requestId: IdSchema, config: ImportConfigSchema });
export const ImportRunResponseSchema = resultSchema(ImportSummarySchema);

export const ImportCancelRequestSchema = z.object({ requestId: IdSchema });

export type ImportInspectRequest = z.infer<typeof ImportInspectRequestSchema>;
export type ImportPreviewRequest = z.infer<typeof ImportPreviewRequestSchema>;
export type ImportRunRequest = z.infer<typeof ImportRunRequestSchema>;
export type ImportCancelRequest = z.infer<typeof ImportCancelRequestSchema>;

/* Channel registry: request + response schema per channel. The preload uses this
 * to validate both directions; the main process re-validates requests. */
export const IPC_CONTRACTS = {
  [IPC_CHANNELS.appGetInfo]: { request: z.undefined(), response: AppInfoSchema },
  [IPC_CHANNELS.appGetRecentProjects]: { request: z.undefined(), response: RecentProjectListSchema },
  [IPC_CHANNELS.appGetPendingOpenFile]: { request: z.undefined(), response: PendingOpenFileSchema },
  [IPC_CHANNELS.dialogPickInputFile]: { request: PickInputFileRequestSchema, response: PickedFileSchema },
  [IPC_CHANNELS.dialogPickProjectPath]: { request: PickProjectPathRequestSchema, response: PickedPathSchema },
  [IPC_CHANNELS.dialogPickExportPath]: { request: PickExportPathRequestSchema, response: PickedPathSchema },
  [IPC_CHANNELS.projectCreate]: { request: ProjectCreateRequestSchema, response: ProjectCreateResponseSchema },
  [IPC_CHANNELS.projectOpen]: { request: ProjectOpenRequestSchema, response: ProjectOpenResponseSchema },
  [IPC_CHANNELS.projectClose]: { request: z.undefined(), response: VoidResultSchema },
  [IPC_CHANNELS.projectGetState]: { request: z.undefined(), response: ProjectStateSchema },
  [IPC_CHANNELS.importInspect]: { request: ImportInspectRequestSchema, response: ImportInspectResponseSchema },
  [IPC_CHANNELS.importPreview]: { request: ImportPreviewRequestSchema, response: ImportPreviewResponseSchema },
  [IPC_CHANNELS.importRun]: { request: ImportRunRequestSchema, response: ImportRunResponseSchema },
  [IPC_CHANNELS.importCancel]: { request: ImportCancelRequestSchema, response: VoidResultSchema }
} as const;

export type IpcContracts = typeof IPC_CONTRACTS;
export type ContractChannel = keyof IpcContracts;
export type RequestOf<C extends ContractChannel> = z.infer<IpcContracts[C]['request']>;
export type ResponseOf<C extends ContractChannel> = z.infer<IpcContracts[C]['response']>;
