import type { BootstrapMainStage } from '@shared/utils/bootstrapMainStage';
import type { BrowserWindow } from 'electron';
import { createMainWindow } from './MainWindow';

export function openLocalWindow(options?: {
  bootstrapMainStage?: BootstrapMainStage | null;
  replaceWindow?: BrowserWindow | null;
}): BrowserWindow {
  return createMainWindow({
    bootstrapMainStage: options?.bootstrapMainStage ?? null,
    replaceWindow: options?.replaceWindow ?? null,
  });
}
