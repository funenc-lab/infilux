import type {
  GetAgentSubagentTranscriptRequest,
  ListLiveAgentSubagentsRequest,
  ListSessionAgentSubagentsRequest,
  SubscribeSessionAgentSubagentsRequest,
  UnsubscribeSessionAgentSubagentsRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain, type WebContents } from 'electron';
import { CodexRuntimeSubagentService } from '../services/agent/CodexRuntimeSubagentService';
import { SessionSubagentPollingCoordinator } from '../services/agent/SessionSubagentPollingCoordinator';
import { sessionManager } from '../services/session/SessionManager';

const codexRuntimeSubagentService = new CodexRuntimeSubagentService({
  listActiveRuntimeHomePaths: () => sessionManager.listActiveCodexRuntimeHomePaths(),
});
const sessionSubagentPollingCoordinator = new SessionSubagentPollingCoordinator(
  codexRuntimeSubagentService
);

export function registerAgentSubagentHandlers(): void {
  const senderDestroyListeners = new Map<WebContents, () => void>();

  function cleanupSender(sender: WebContents): void {
    sessionSubagentPollingCoordinator.unsubscribeOwner(String(sender.id));

    const destroyListener = senderDestroyListeners.get(sender);
    if (!destroyListener) {
      return;
    }

    senderDestroyListeners.delete(sender);
    sender.off('destroyed', destroyListener);
  }

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_LIST_LIVE,
    async (_, request: ListLiveAgentSubagentsRequest = {}) => {
      return await codexRuntimeSubagentService.listLive(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_LIST_SESSION,
    async (_, request: ListSessionAgentSubagentsRequest) => {
      return await codexRuntimeSubagentService.listSession(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_SUBSCRIBE,
    async (event, request: SubscribeSessionAgentSubagentsRequest) => {
      const sender = event.sender;

      if (!senderDestroyListeners.has(sender)) {
        const destroyListener = () => cleanupSender(sender);
        sender.once('destroyed', destroyListener);
        senderDestroyListeners.set(sender, destroyListener);
      }

      sessionSubagentPollingCoordinator.subscribe(
        {
          ownerId: String(sender.id),
          subscriptionId: request.subscriptionId,
          targets: request.targets,
          pollIntervalMs: request.pollIntervalMs,
        },
        (updatedEvent) => {
          if (sender.isDestroyed()) {
            cleanupSender(sender);
            return;
          }

          sender.send(IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_UPDATED, updatedEvent);
        }
      );
      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_UNSUBSCRIBE,
    async (event, request: UnsubscribeSessionAgentSubagentsRequest) => {
      sessionSubagentPollingCoordinator.unsubscribe({
        ownerId: String(event.sender.id),
        subscriptionId: request.subscriptionId,
      });

      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_GET_TRANSCRIPT,
    async (_, request: GetAgentSubagentTranscriptRequest) => {
      return await codexRuntimeSubagentService.getTranscript(request);
    }
  );
}
