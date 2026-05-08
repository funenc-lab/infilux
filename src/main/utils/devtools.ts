import type { WebContents } from 'electron';

const DETACHED_DEVTOOLS_OPTIONS = {
  mode: 'detach',
} satisfies Electron.OpenDevToolsOptions;

export function openDetachedDevTools(webContents: Pick<WebContents, 'openDevTools'>): void {
  webContents.openDevTools(DETACHED_DEVTOOLS_OPTIONS);
}

export function toggleDetachedDevTools(
  webContents: Pick<WebContents, 'closeDevTools' | 'isDevToolsOpened' | 'openDevTools'>
): void {
  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools();
    return;
  }

  openDetachedDevTools(webContents);
}
