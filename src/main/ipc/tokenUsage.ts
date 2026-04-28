import type { GetProjectTokenUsageRequest } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { tokenUsageService } from '../services/tokenUsage';

export function registerTokenUsageHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TOKEN_USAGE_PROJECTS_GET,
    async (_, request?: GetProjectTokenUsageRequest) => {
      return tokenUsageService.getProjectUsage(request ?? {});
    }
  );
}
