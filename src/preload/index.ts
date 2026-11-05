import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './bridge';

// The renderer only ever sees this frozen, typed object. There is no generic
// `invoke`, `send` or `require` exposure.
contextBridge.exposeInMainWorld('statementdesk', createBridge(ipcRenderer));
