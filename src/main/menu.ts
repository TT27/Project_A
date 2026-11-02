import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC_EVENTS, type MenuAction } from '@shared/contracts';

export interface MenuContext {
  getWindow(): BrowserWindow | null;
  ensureWindow(): BrowserWindow;
  openProjectPath(path: string): void;
  recentProjects(): { path: string; name: string }[];
}

function send(ctx: MenuContext, action: MenuAction): void {
  const win = ctx.ensureWindow();
  win.webContents.send(IPC_EVENTS.menuAction, action);
}

export function buildMenuTemplate(ctx: MenuContext): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';

  const openRecent: MenuItemConstructorOptions = {
    label: 'Open Recent',
    submenu: (() => {
      const recents = ctx.recentProjects();
      const items: MenuItemConstructorOptions[] = recents.map((r) => ({
        label: r.name,
        toolTip: r.path,
        click: () => ctx.openProjectPath(r.path)
      }));
      if (items.length === 0) items.push({ label: 'No Recent Projects', enabled: false });
      return items;
    })()
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'New Reconciliation…', accelerator: 'CmdOrCtrl+N', click: () => send(ctx, 'new-reconciliation') },
      { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send(ctx, 'open-project') },
      openRecent,
      { label: 'Try Sample Project', click: () => send(ctx, 'try-sample') },
      { type: 'separator' },
      { label: 'Close Project', accelerator: 'CmdOrCtrl+Shift+W', click: () => send(ctx, 'close-project') },
      { label: 'Export Reconciliation Pack…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send(ctx, 'export') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]
  };

  const editMenu: MenuItemConstructorOptions = {
    role: 'editMenu'
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      ...(app.isPackaged ? [] : [{ role: 'reload' } as MenuItemConstructorOptions, { role: 'toggleDevTools' } as MenuItemConstructorOptions, { type: 'separator' } as MenuItemConstructorOptions]),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
      : [{ role: 'minimize' }, { role: 'close' }]
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      { label: 'StatementDesk Help', accelerator: isMac ? 'Cmd+?' : 'F1', click: () => send(ctx, 'help') },
      { label: 'Send Feedback (offline form)…', click: () => send(ctx, 'feedback') },
      { type: 'separator' },
      {
        label: 'Show Sample Files in Finder',
        visible: isMac,
        click: () => {
          void shell.openPath(app.isPackaged ? `${process.resourcesPath}/samples` : `${app.getAppPath()}/samples`);
        }
      },
      ...(isMac ? [] : [{ label: 'About StatementDesk', role: 'about' } as MenuItemConstructorOptions])
    ]
  };

  const appMenu: MenuItemConstructorOptions = {
    role: 'appMenu',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  };

  return [...(isMac ? [appMenu] : []), fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
}

export function installApplicationMenu(ctx: MenuContext): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(ctx)));
}
