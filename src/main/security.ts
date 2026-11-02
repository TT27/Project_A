import { app, session, type BrowserWindow, type WebContents } from 'electron';

/**
 * Content Security Policy for the renderer. No remote origins of any kind.
 * `style-src 'unsafe-inline'` is required for React inline styles; scripts are never inline.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL'];

function isAllowedUrl(url: string): boolean {
  if (url.startsWith('file://')) return true;
  if (!app.isPackaged && DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return true;
  return false;
}

/** Session-wide hardening: CSP on every response, every permission request denied. */
export function hardenDefaultSession(): void {
  const ses = session.defaultSession;

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY]
      }
    });
  });

  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);

  // Block any outbound request that is not to our own bundle / dev server.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedUrl(details.url) || details.url.startsWith('devtools://');
    callback({ cancel: !allowed });
  });
}

/** Per-webContents hardening: no navigation, no new windows, no attached webviews. */
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('did-create-window', (child) => child.destroy());
}

export function hardenWindow(window: BrowserWindow): void {
  hardenWebContents(window.webContents);
}

/** Sanity assertion used in tests and at startup: the secure defaults must hold. */
export function assertSecureWebPreferences(prefs: Electron.WebPreferences): void {
  if (prefs.contextIsolation !== true) throw new Error('contextIsolation must be enabled');
  if (prefs.nodeIntegration !== false) throw new Error('nodeIntegration must be disabled');
  if (prefs.sandbox !== true) throw new Error('sandbox must be enabled');
  if (prefs.webSecurity !== true) throw new Error('webSecurity must be enabled');
  if (prefs.allowRunningInsecureContent !== false) throw new Error('insecure content must be blocked');
  if (prefs.webviewTag !== false) throw new Error('webviewTag must be disabled');
}
