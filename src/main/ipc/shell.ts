import { IPC_CHANNELS, type ShellConfig } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { ipcMain, shell } from 'electron';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';
import { shellDetector } from '../services/terminal/ShellDetector';
import { resolveAllowedExternalUrl } from '../utils/externalUrlPolicy';

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_DETECT, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote' && context.connectionId) {
      return await remoteConnectionManager.call(context.connectionId, 'shell:detect', {});
    }
    return await shellDetector.detectShells();
  });

  ipcMain.handle(
    IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND,
    async (
      _,
      repoPath: string | undefined,
      config: ShellConfig
    ): Promise<{ shell: string; execArgs: string[] }> => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'shell:resolveForCommand', {
          config,
        });
      }
      return shellDetector.resolveShellForCommand(config);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_, url: string): Promise<boolean> => {
    const allowedUrl = resolveAllowedExternalUrl(url);
    if (!allowedUrl) {
      return false;
    }

    await shell.openExternal(allowedUrl);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_, path: string): Promise<string> => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      throw new Error('Path is required');
    }

    if (isRemoteVirtualPath(trimmedPath)) {
      throw new Error('Remote paths cannot be revealed locally');
    }

    return await shell.openPath(trimmedPath);
  });
}
