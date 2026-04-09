import {
  IPC_CHANNELS,
  type TmuxKillSessionRequest,
  type TmuxScrollClientRequest,
} from '@shared/types';
import { ipcMain } from 'electron';
import { tmuxDetector } from '../services/cli/TmuxDetector';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';
import { getAppRuntimeIdentity } from '../utils/runtimeIdentity';

export function registerTmuxHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TMUX_CHECK,
    async (_, repoPath: string | undefined, forceRefresh?: boolean) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'tmux:check', {
          forceRefresh,
        });
      }
      return await tmuxDetector.check(forceRefresh);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TMUX_KILL_SESSION,
    async (_, repoPath: string | undefined, request: TmuxKillSessionRequest) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'tmux:killSession', {
          ...request,
        });
      }
      return await tmuxDetector.killSession(request.name, request.serverName);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TMUX_SCROLL_CLIENT,
    async (_, repoPath: string | undefined, request: TmuxScrollClientRequest) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'tmux:scrollClient', {
          ...request,
          serverName: getAppRuntimeIdentity().tmuxServerName,
        });
      }
      return await tmuxDetector.scrollClient(request);
    }
  );
}

export async function cleanupTmux(): Promise<void> {
  await tmuxDetector.killServer();
}

export function cleanupTmuxSync(): void {
  tmuxDetector.killServerSync();
}
