import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { assertSecureWebPreferences, hardenWindow } from './security';

export const WINDOW_BACKGROUND = { light: '#f5f5f7', dark: '#1e1e1e' } as const;

export function secureWebPreferences(): Electron.WebPreferences {
  const prefs: Electron.WebPreferences = {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: !app.isPackaged
  };
  assertSecureWebPreferences(prefs);
  return prefs;
}

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'StatementDesk',
    backgroundColor: nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light,
    // macOS: content extends under the title bar; the renderer draws its own toolbar
    // and leaves room for the traffic lights. Windows/Linux keep the native frame.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 16 } }
      : { autoHideMenuBar: false }),
    webPreferences: secureWebPreferences()
  });

  hardenWindow(window);

  window.once('ready-to-show', () => window.show());

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}
