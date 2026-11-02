/**
 * Type of the narrow API exposed to the renderer through contextBridge.
 * This file is consumed by both the preload implementation and the renderer.
 * It must not import Electron.
 */
import type {
  AppInfo,
  MenuAction,
  NativeTheme,
  PickedFile,
  PickedPath,
  PickExportPathRequest,
  PickInputFileRequest,
  PickProjectPathRequest,
  ProjectSetup,
  ProjectState,
  ProjectSummary,
  RecentProject,
  Result
} from '@shared/contracts';

export type Unsubscribe = () => void;

export interface StatementDeskApi {
  readonly app: {
    getInfo(): Promise<AppInfo>;
    getRecentProjects(): Promise<RecentProject[]>;
    /** A .statementdesk path handed to the app by Finder/Dock before the UI was ready. */
    getPendingOpenFile(): Promise<{ path: string } | null>;
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
    open(path: string): Promise<Result<ProjectSummary>>;
    close(): Promise<Result<null>>;
    getState(): Promise<ProjectState>;
  };
}

declare global {
  interface Window {
    /** Present only when running inside Electron with the StatementDesk preload. */
    statementdesk?: StatementDeskApi;
  }
}

export {};
