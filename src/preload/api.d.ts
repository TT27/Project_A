/**
 * Type of the narrow API exposed to the renderer through contextBridge.
 * This file is consumed by both the preload implementation and the renderer.
 * It must not import Electron.
 */
import type {
  AppInfo,
  Diagnostics,
  ExportWriteResult,
  FeedbackSaveRequest,
  ImportCancelRequest,
  ImportInspectRequest,
  ImportPreviewRequest,
  ImportProgress,
  ImportRunRequest,
  ImportSummary,
  InspectResult,
  MappingPreview,
  MenuAction,
  NativeTheme,
  OpenedProject,
  PickedFile,
  PickedPath,
  PickExportPathRequest,
  PickInputFileRequest,
  PickProjectPathRequest,
  ProjectSetup,
  ProjectSettingsPatch,
  ProjectState,
  ProjectSummary,
  RecentProject,
  Result,
  ReviewEvent,
  ReviewRecordRequest,
  RunMeta,
  RunView
} from '@shared/contracts';

export type Unsubscribe = () => void;

export interface StatementDeskApi {
  readonly app: {
    getInfo(): Promise<AppInfo>;
    getRecentProjects(): Promise<RecentProject[]>;
    /** A .statementdesk path handed to the app by Finder/Dock before the UI was ready. */
    getPendingOpenFile(): Promise<{ path: string } | null>;
    /** Test/e2e helper: create a temp project seeded with the bundled golden samples. */
    openSample(): Promise<Result<ProjectSummary>>;
    onMenuAction(listener: (action: MenuAction) => void): Unsubscribe;
    onOpenFileRequested(listener: (path: string) => void): Unsubscribe;
    onThemeChanged(listener: (theme: NativeTheme) => void): Unsubscribe;
  };
  readonly dialog: {
    pickInputFile(request: PickInputFileRequest): Promise<PickedFile>;
    pickProjectPath(request: PickProjectPathRequest): Promise<PickedPath>;
    pickExportPath(request: PickExportPathRequest): Promise<PickedPath>;
  };
  readonly project: {
    create(path: string, setup: ProjectSetup): Promise<Result<ProjectSummary>>;
    open(path: string): Promise<Result<OpenedProject>>;
    close(): Promise<Result<null>>;
    getState(): Promise<ProjectState>;
    saveSettings(settings: ProjectSettingsPatch): Promise<Result<ProjectSummary>>;
  };
  readonly imports: {
    inspect(request: ImportInspectRequest): Promise<Result<InspectResult>>;
    preview(request: ImportPreviewRequest): Promise<Result<MappingPreview>>;
    run(request: ImportRunRequest): Promise<Result<ImportSummary>>;
    cancel(request: ImportCancelRequest): Promise<Result<null>>;
    onProgress(listener: (progress: ImportProgress) => void): Unsubscribe;
  };
  readonly reconcile: {
    run(request?: { projectId: string; acknowledgeIncompleteDraft?: boolean }): Promise<Result<RunView>>;
    getRun(runId: string): Promise<Result<RunView>>;
    listRuns(): Promise<Result<RunMeta[]>>;
  };
  readonly review: {
    record(request: ReviewRecordRequest): Promise<Result<ReviewEvent>>;
    list(request?: { runId?: string }): Promise<Result<ReviewEvent[]>>;
  };
  readonly exports: {
    writeXlsx(destPath: string, runId: string): Promise<Result<ExportWriteResult>>;
    writeCsv(destPath: string, runId: string): Promise<Result<ExportWriteResult>>;
    writeHtml(destPath: string, runId: string): Promise<Result<ExportWriteResult>>;
  };
  readonly diagnostics: {
    build(): Promise<Result<Diagnostics>>;
  };
  readonly feedback: {
    save(request: FeedbackSaveRequest): Promise<Result<{ path: string; bytes: number }>>;
  };
}

declare global {
  interface Window {
    /** Present only when running inside Electron with the StatementDesk preload. */
    statementdesk?: StatementDeskApi;
  }
}

export {};
