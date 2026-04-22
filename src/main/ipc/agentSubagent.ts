import type {
  GetAgentSubagentTranscriptRequest,
  ListLiveAgentSubagentsRequest,
  ListSessionAgentSubagentsRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { CodexSessionSubagentService } from '../services/agent/CodexSessionSubagentService';
import { codexSubagentTracker } from '../services/agent/CodexSubagentTracker';
import { codexSubagentTranscriptService } from '../services/agent/CodexSubagentTranscriptService';

const codexSessionSubagentService = new CodexSessionSubagentService(codexSubagentTracker);

export function registerAgentSubagentHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_LIST_LIVE,
    async (_, request: ListLiveAgentSubagentsRequest = {}) => {
      return await codexSubagentTracker.listLive(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_LIST_SESSION,
    async (_, request: ListSessionAgentSubagentsRequest) => {
      return await codexSessionSubagentService.listSession(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_GET_TRANSCRIPT,
    async (_, request: GetAgentSubagentTranscriptRequest) => {
      return await codexSubagentTranscriptService.getTranscript(request);
    }
  );
}
