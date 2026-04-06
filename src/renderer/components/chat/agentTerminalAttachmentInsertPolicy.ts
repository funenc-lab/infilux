import type { OutputState } from '@/stores/agentSessions';

interface AgentTerminalAttachmentInsertOptions {
  attachmentCount: number;
  outputState: OutputState;
  runtimeState: 'live' | 'reconnecting' | 'dead';
  sessionId?: string | null;
}

export function canInsertAgentTerminalAttachments(
  options: AgentTerminalAttachmentInsertOptions
): boolean {
  if (!options.sessionId || options.attachmentCount === 0) {
    return false;
  }

  if (options.runtimeState !== 'live') {
    return false;
  }

  return options.outputState !== 'outputting';
}
