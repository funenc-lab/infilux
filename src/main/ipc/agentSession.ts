import type { PersistentAgentSessionRecord, RestoreWorktreeSessionsRequest } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { persistentAgentSessionService } from '../services/session/PersistentAgentSessionService';

export function registerAgentSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE, async () => {
    return persistentAgentSessionService.listRecoverableSessions();
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE,
    async (_, request: RestoreWorktreeSessionsRequest) => {
      return persistentAgentSessionService.restoreWorktreeSessions(request);
    }
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RECONCILE, async (_, uiSessionId: string) => {
    return persistentAgentSessionService.reconcileSession(uiSessionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT,
    async (_, record: PersistentAgentSessionRecord) => {
      return persistentAgentSessionService.upsertSession(record);
    }
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_ABANDON, async (_, uiSessionId: string) => {
    return persistentAgentSessionService.abandonSession(uiSessionId);
  });
}
