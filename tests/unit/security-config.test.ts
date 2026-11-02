import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Electron security configuration (static)', () => {
  const windowSource = read('src/main/window.ts');
  const securitySource = read('src/main/security.ts');

  it('BrowserWindow uses context isolation, no node integration and a sandbox', () => {
    expect(windowSource).toMatch(/contextIsolation:\s*true/);
    expect(windowSource).toMatch(/nodeIntegration:\s*false/);
    expect(windowSource).toMatch(/sandbox:\s*true/);
    expect(windowSource).toMatch(/webSecurity:\s*true/);
    expect(windowSource).toMatch(/webviewTag:\s*false/);
  });

  it('applies a CSP that forbids remote origins and inline scripts', () => {
    expect(securitySource).toMatch(/default-src 'self'/);
    expect(securitySource).toMatch(/script-src 'self'/);
    expect(securitySource).not.toMatch(/script-src[^"]*unsafe-inline/);
    expect(securitySource).toMatch(/setPermissionRequestHandler/);
    expect(securitySource).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  });

  it('macOS window uses hiddenInset title bar with traffic light offset', () => {
    expect(windowSource).toMatch(/titleBarStyle:\s*'hiddenInset'/);
    expect(windowSource).toMatch(/trafficLightPosition/);
  });

  it('preload exposes a single frozen namespace and no ipcRenderer', () => {
    const preload = read('src/preload/index.ts');
    expect(preload).toMatch(/exposeInMainWorld\('statementdesk'/);
    expect(preload).not.toMatch(/exposeInMainWorld\('ipc/);
  });
});
