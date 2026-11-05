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

/** Signed integer cents with the absolute line limit of 99,999,999,999 cents. */
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
/* Canonical row and outcomes                                               */
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
  appOpenSample: 'app:openSample',
  dialogPickInputFile: 'dialog:pickInputFile',
  dialogPickProjectPath: 'dialog:pickProjectPath',
  dialogPickExportPath: 'dialog:pickExportPath',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectClose: 'project:close',
  projectGetState: 'project:getState',
  projectSaveSettings: 'project:saveSettings',
  importInspect: 'import:inspect',
  importPreview: 'import:preview',
  importRun: 'import:run',
  importCancel: 'import:cancel',
  reconcileRun: 'reconcile:run',
  reconcileGetRun: 'reconcile:getRun',
  reconcileListRuns: 'reconcile:listRuns',
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

/* Project setup and persistence */
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
export const VoidResultSchema = resultSchema(z.null());

/* Export, feedback and diagnostics */

export const ExportWriteRequestSchema = z.object({
  kind: ExportKindSchema,
  runId: IdSchema,
  destPath: LocalPathSchema
});
export type ExportWriteRequest = z.infer<typeof ExportWriteRequestSchema>;

export const ExportWriteResultSchema = z.object({
  path: LocalPathSchema,
  bytes: z.number().int().nonnegative()
});
export const ExportWriteResponseSchema = resultSchema(ExportWriteResultSchema);
export type ExportWriteResult = z.infer<typeof ExportWriteResultSchema>;

/** Non-identifying technical facts only — never customer data. */
export const DiagnosticsSchema = z.object({
  appVersion: z.string(),
  platform: z.string(),
  osVersion: z.string(),
  electronVersion: z.string(),
  engineVersion: z.string(),
  statementRowCount: z.number().int().nonnegative().nullable(),
  ledgerRowCount: z.number().int().nonnegative().nullable(),
  exceptionCount: z.number().int().nonnegative().nullable(),
  errorCodes: z.array(z.string().max(64)).max(50)
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;
export const DiagnosticsBuildResponseSchema = resultSchema(DiagnosticsSchema);

export const FeedbackSchema = z.object({
  preparationMinutes: z.number().int().min(0).max(100000),
  reviewMinutes: z.number().int().min(0).max(100000),
  usefulness: z.number().int().min(1).max(5),
  likelihood: z.number().int().min(1).max(5),
  problems: z.string().max(8000),
  includeDiagnostics: z.boolean(),
  diagnostics: DiagnosticsSchema.nullable()
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const FeedbackSaveRequestSchema = z.object({
  destPath: LocalPathSchema,
  feedback: FeedbackSchema
});
export type FeedbackSaveRequest = z.infer<typeof FeedbackSaveRequestSchema>;
export const FeedbackSaveResultSchema = z.object({ path: LocalPathSchema, bytes: z.number().int().nonnegative() });
export const FeedbackSaveResponseSchema = resultSchema(FeedbackSaveResultSchema);

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

/* Project settings */

/** Editable, low-risk project display settings (identity fields stay fixed). */
export const ProjectSettingsPatchSchema = z
  .object({
    projectName: z.string().trim().min(1).max(200).optional(),
    supplierName: z.string().trim().min(1).max(200).optional()
  })
  .refine((v) => v.projectName !== undefined || v.supplierName !== undefined, {
    message: 'At least one setting must be provided'
  });
export type ProjectSettingsPatch = z.infer<typeof ProjectSettingsPatchSchema>;

export const ProjectSaveSettingsRequestSchema = z.object({ settings: ProjectSettingsPatchSchema });
export const ProjectSaveSettingsResponseSchema = resultSchema(ProjectSummarySchema);

/* Reconciliation and review */

export const CountsByCategorySchema = z.object({
  EXACT_MATCH: z.number().int().nonnegative(),
  AMOUNT_DIFFERENCE: z.number().int().nonnegative(),
  DATE_DIFFERENCE: z.number().int().nonnegative(),
  STATEMENT_ONLY: z.number().int().nonnegative(),
  LEDGER_ONLY: z.number().int().nonnegative(),
  AMBIGUOUS_DUPLICATE_GROUP: z.number().int().nonnegative()
});
export type CountsByCategory = z.infer<typeof CountsByCategorySchema>;

export const ReconciliationSummarySchema = z.object({
  statementRowCount: z.number().int().nonnegative(),
  ledgerRowCount: z.number().int().nonnegative(),
  statementTotalCents: CentsSchema,
  ledgerTotalCents: CentsSchema,
  differenceCents: z.number().int(),
  exactMatchCount: z.number().int().nonnegative(),
  exceptionCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  countsByCategory: CountsByCategorySchema,
  completeness: CompletenessStatusSchema
});
export type ReconciliationSummaryView = z.infer<typeof ReconciliationSummarySchema>;

/** One source row contributing to an outcome (snapshot captured at run time). */
export const OutcomeRowDetailSchema = z.object({
  rowId: IdSchema,
  side: SideSchema,
  fileName: z.string(),
  sheetName: z.string().nullable(),
  sourceRow: z.number().int().positive(),
  referenceRaw: z.string(),
  documentDate: IsoDateSchema,
  outstandingCents: CentsSchema
});
export type OutcomeRowDetail = z.infer<typeof OutcomeRowDetailSchema>;

export const ReviewEventSchema = z.object({
  id: IdSchema,
  outcomeKey: z.string().min(1),
  runId: IdSchema.nullable(),
  decision: ReviewDecisionSchema,
  reviewer: z.string(),
  note: z.string(),
  createdAt: z.string(),
  supersedesId: IdSchema.nullable()
});
export type ReviewEvent = z.infer<typeof ReviewEventSchema>;

export const OutcomeViewSchema = z.object({
  id: IdSchema,
  outcomeKey: z.string().min(1),
  category: OutcomeCategorySchema,
  referenceKey: z.string(),
  documentType: DocumentTypeSchema,
  statementCents: CentsSchema,
  ledgerCents: CentsSchema,
  differenceCents: z.number().int(),
  reasonCodes: z.array(ReasonCodeSchema),
  statementDate: IsoDateSchema.nullable(),
  ledgerDate: IsoDateSchema.nullable(),
  rows: z.array(OutcomeRowDetailSchema),
  review: ReviewEventSchema.nullable()
});
export type OutcomeView = z.infer<typeof OutcomeViewSchema>;

export const RunSettingsSchema = z.object({
  statementControlCents: CentsSchema.nullable(),
  ledgerControlCents: CentsSchema.nullable(),
  /** Null for runs whose original invalid-row count cannot be established. */
  invalidRowCount: z.number().int().nonnegative().nullable()
});
export type RunSettings = z.infer<typeof RunSettingsSchema>;

export const RunViewSchema = z.object({
  runId: IdSchema,
  projectId: IdSchema,
  engineVersion: z.string(),
  createdAt: z.string(),
  settings: RunSettingsSchema,
  hasSourceSnapshot: z.boolean(),
  summary: ReconciliationSummarySchema,
  outcomes: z.array(OutcomeViewSchema)
});
export type RunView = z.infer<typeof RunViewSchema>;

export const RunMetaSchema = z.object({
  runId: IdSchema,
  createdAt: z.string(),
  engineVersion: z.string(),
  exceptionCount: z.number().int().nonnegative(),
  differenceCents: z.number().int()
});
export type RunMeta = z.infer<typeof RunMetaSchema>;

export const ReconcileRunResponseSchema = resultSchema(RunViewSchema);
export const ReconcileRunRequestSchema = z.object({
  projectId: IdSchema,
  acknowledgeIncompleteDraft: z.boolean().optional()
}).optional();
export const ReconcileGetRunRequestSchema = z.object({ runId: IdSchema });
export const ReconcileListRunsResponseSchema = resultSchema(z.array(RunMetaSchema));

export const ReviewRecordRequestSchema = z.object({
  outcomeKey: z.string().min(1).max(512),
  runId: IdSchema.nullable().optional(),
  decision: ReviewDecisionSchema,
  reviewer: z.string().trim().max(120).optional(),
  note: z.string().max(4000).optional(),
  supersedesId: IdSchema.optional()
});
export const ReviewRecordResponseSchema = resultSchema(ReviewEventSchema);
export const ReviewListRequestSchema = z.object({ runId: IdSchema.optional() });
export const ReviewListResponseSchema = resultSchema(z.array(ReviewEventSchema));
export type ReviewRecordRequest = z.infer<typeof ReviewRecordRequestSchema>;

export const ProjectOpenResponseSchema = resultSchema(z.object({
  project: ProjectSummarySchema,
  run: RunViewSchema.nullable(),
  imports: z.array(ImportSummarySchema)
}));
export type OpenedProject = Extract<z.infer<typeof ProjectOpenResponseSchema>, { ok: true }>['value'];

/* Channel registry: request + response schema per channel. The preload uses this
 * to validate both directions; the main process re-validates requests. */
export const IPC_CONTRACTS = {
  [IPC_CHANNELS.appGetInfo]: { request: z.undefined(), response: AppInfoSchema },
  [IPC_CHANNELS.appGetRecentProjects]: { request: z.undefined(), response: RecentProjectListSchema },
  [IPC_CHANNELS.appGetPendingOpenFile]: { request: z.undefined(), response: PendingOpenFileSchema },
  [IPC_CHANNELS.dialogPickInputFile]: { request: PickInputFileRequestSchema, response: PickedFileSchema },
  [IPC_CHANNELS.dialogPickProjectPath]: { request: PickProjectPathRequestSchema, response: PickedPathSchema },
  [IPC_CHANNELS.dialogPickExportPath]: { request: PickExportPathRequestSchema, response: PickedPathSchema },
  [IPC_CHANNELS.appOpenSample]: { request: z.undefined(), response: ProjectCreateResponseSchema },
  [IPC_CHANNELS.projectCreate]: { request: ProjectCreateRequestSchema, response: ProjectCreateResponseSchema },
  [IPC_CHANNELS.projectOpen]: { request: ProjectOpenRequestSchema, response: ProjectOpenResponseSchema },
  [IPC_CHANNELS.projectClose]: { request: z.undefined(), response: VoidResultSchema },
  [IPC_CHANNELS.projectGetState]: { request: z.undefined(), response: ProjectStateSchema },
  [IPC_CHANNELS.projectSaveSettings]: { request: ProjectSaveSettingsRequestSchema, response: ProjectSaveSettingsResponseSchema },
  [IPC_CHANNELS.importInspect]: { request: ImportInspectRequestSchema, response: ImportInspectResponseSchema },
  [IPC_CHANNELS.importPreview]: { request: ImportPreviewRequestSchema, response: ImportPreviewResponseSchema },
  [IPC_CHANNELS.importRun]: { request: ImportRunRequestSchema, response: ImportRunResponseSchema },
  [IPC_CHANNELS.importCancel]: { request: ImportCancelRequestSchema, response: VoidResultSchema },
  [IPC_CHANNELS.reconcileRun]: { request: ReconcileRunRequestSchema, response: ReconcileRunResponseSchema },
  [IPC_CHANNELS.reconcileGetRun]: { request: ReconcileGetRunRequestSchema, response: ReconcileRunResponseSchema },
  [IPC_CHANNELS.reconcileListRuns]: { request: z.undefined(), response: ReconcileListRunsResponseSchema },
  [IPC_CHANNELS.reviewRecord]: { request: ReviewRecordRequestSchema, response: ReviewRecordResponseSchema },
  [IPC_CHANNELS.reviewList]: { request: ReviewListRequestSchema, response: ReviewListResponseSchema },
  [IPC_CHANNELS.exportWrite]: { request: ExportWriteRequestSchema, response: ExportWriteResponseSchema },
  [IPC_CHANNELS.diagnosticsBuild]: { request: z.undefined(), response: DiagnosticsBuildResponseSchema },
  [IPC_CHANNELS.feedbackSave]: { request: FeedbackSaveRequestSchema, response: FeedbackSaveResponseSchema }
} as const;

export type IpcContracts = typeof IPC_CONTRACTS;
export type ContractChannel = keyof IpcContracts;
export type RequestOf<C extends ContractChannel> = z.infer<IpcContracts[C]['request']>;
export type ResponseOf<C extends ContractChannel> = z.infer<IpcContracts[C]['response']>;
