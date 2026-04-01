import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { webInspectorServer } from '../services/webInspector';

export function registerWebInspectorHandlers() {
  ipcMain.handle(IPC_CHANNELS.WEB_INSPECTOR_START, async () => {
    return webInspectorServer.start();
  });

  ipcMain.handle(IPC_CHANNELS.WEB_INSPECTOR_STOP, async () => {
    await webInspectorServer.stop();
  });

  ipcMain.handle(IPC_CHANNELS.WEB_INSPECTOR_STATUS, () => {
    return webInspectorServer.getStatus();
  });
}
