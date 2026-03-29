import type {
  GetAgentSubagentTranscriptRequest,
  ListLiveAgentSubagentsRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { codexSubagentTracker } from '../services/agent/CodexSubagentTracker';
import { codexSubagentTranscriptService } from '../services/agent/CodexSubagentTranscriptService';

export function registerAgentSubagentHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_LIST_LIVE,
    async (_, request: ListLiveAgentSubagentsRequest = {}) => {
      return await codexSubagentTracker.listLive(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SUBAGENT_GET_TRANSCRIPT,
    async (_, request: GetAgentSubagentTranscriptRequest) => {
      return await codexSubagentTranscriptService.getTranscript(request);
    }
  );
}
