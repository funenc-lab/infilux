import type { OutputState } from '@/stores/agentSessions';

interface AgentTerminalAttachmentInsertOptions {
  attachmentCount: number;
  outputState: OutputState;
  runtimeState: 'live' | 'reconnecting' | 'dead';
  sessionId?: string | null;
  waitingForInput?: boolean;
}

export type AgentTerminalAttachmentInsertDisposition = 'insert' | 'queue' | 'reject';

export function resolveAgentTerminalAttachmentInsertDisposition(
  options: AgentTerminalAttachmentInsertOptions
): AgentTerminalAttachmentInsertDisposition {
  if (!options.sessionId || options.attachmentCount === 0) {
    return 'reject';
  }

  if (options.runtimeState !== 'live') {
    return 'reject';
  }

  if (options.waitingForInput) {
    return 'insert';
  }

  if (options.outputState === 'outputting') {
    return 'queue';
  }

  return 'insert';
}

export function canInsertAgentTerminalAttachments(
  options: AgentTerminalAttachmentInsertOptions
): boolean {
  return resolveAgentTerminalAttachmentInsertDisposition(options) === 'insert';
}
