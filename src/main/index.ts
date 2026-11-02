import { app, BrowserWindow, nativeTheme } from 'electron';
import { IPC_EVENTS, PROJECT_FILE_EXTENSION } from '@shared/contracts';
import { registerIpcHandlers } from './ipc';
import { installApplicationMenu } from './menu';
import { readRecentProjects } from './recent';
import { hardenDefaultSession, hardenWebContents } from './security';
import { createMainWindow } from './window';

let mainWindow: BrowserWindow | null = null;
let pendingOpenFile: string | null = null;
let recentCache: { path: string; name: string }[] = [];

// No GPU-heavy features, no remote content, no auto-updates: keep the surface small.
app.setAboutPanelOptions({
  applicationName: 'StatementDesk',
  applicationVersion: app.getVersion(),
  copyright: 'Local-first supplier statement reconciliation. Data never leaves this computer.'
});

function isProjectFile(path: string): boolean {
  return path.toLowerCase().endsWith(`.${PROJECT_FILE_EXTENSION}`);
}

function ensureWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

function openProjectPath(path: string): void {
  if (!isProjectFile(path)) return;
  const win = ensureWindow();
  if (win.webContents.isLoading()) {
    pendingOpenFile = path;
  } else {
    win.webContents.send(IPC_EVENTS.openFileRequested, path);
  }
}

async function refreshMenu(): Promise<void> {
  recentCache = await readRecentProjects();
  installApplicationMenu({
    getWindow: () => mainWindow,
    ensureWindow,
    openProjectPath,
    recentProjects: () => recentCache
  });
}

// macOS: Finder/Dock hands us a document, possibly before `ready`.
app.on('open-file', (event, path) => {
  event.preventDefault();
  if (!isProjectFile(path)) return;
  if (app.isReady()) openProjectPath(path);
  else pendingOpenFile = path;
});

// Windows: the document path arrives as a command-line argument.
if (process.platform === 'win32') {
  const argPath = process.argv.slice(1).find((a) => isProjectFile(a));
  if (argPath) pendingOpenFile = argPath;
}

// Single-instance lock so a second Finder/Explorer launch re-uses this instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = ensureWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
    const argPath = argv.find((a) => isProjectFile(a));
    if (argPath) openProjectPath(argPath);
  });
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

void app.whenReady().then(async () => {
  hardenDefaultSession();
  registerIpcHandlers({
    getWindow: () => mainWindow,
    takePendingOpenFile: () => {
      const p = pendingOpenFile;
      pendingOpenFile = null;
      return p;
    }
  });
  await refreshMenu();
  ensureWindow();

  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send(IPC_EVENTS.nativeThemeChanged, nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });

  app.on('activate', () => {
    // macOS: clicking the Dock icon with no windows open re-creates the window.
    if (BrowserWindow.getAllWindows().length === 0) ensureWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS convention: the app stays in the Dock until the user quits explicitly.
  if (process.platform !== 'darwin') app.quit();
});
