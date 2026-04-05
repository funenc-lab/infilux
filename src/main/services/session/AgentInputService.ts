import type { AgentInputDispatchRequest, SessionDescriptor } from '@shared/types';
import { supportsAgentNativeTerminalInput } from '@shared/utils/agentInputMode';
import { sessionManager } from './SessionManager';

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';
const SUBMIT_INPUT = '\r';

export interface AgentInputWriter {
  write(sessionId: string, data: string): void;
}

export interface AgentInputSessionResolver {
  getSessionDescriptor(sessionId: string): SessionDescriptor | null;
}

function normalizeSubmitDelayMs(delayMs: number | undefined): number {
  if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs <= 0) {
    return 0;
  }

  return Math.floor(delayMs);
}

function resolveAgentId(
  descriptor: SessionDescriptor | null,
  request: AgentInputDispatchRequest
): string | null {
  if (descriptor?.kind !== 'agent') {
    return typeof request.agentId === 'string' && request.agentId.length > 0
      ? request.agentId
      : null;
  }

  const agentId = descriptor.metadata?.agentId;
  if (typeof agentId === 'string' && agentId.length > 0) {
    return agentId;
  }

  return typeof request.agentId === 'string' && request.agentId.length > 0 ? request.agentId : null;
}

function toTerminalPayload(text: string, useNativeTerminalInput: boolean): string {
  if (!useNativeTerminalInput || !text.includes('\n')) {
    return text;
  }

  return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
}

export class AgentInputService {
  constructor(
    private readonly writer: AgentInputWriter,
    private readonly sessionResolver: AgentInputSessionResolver
  ) {}

  dispatch(request: AgentInputDispatchRequest): void {
    if (request.sessionId.length === 0) {
      throw new Error('Agent input dispatch requires a session id');
    }

    if (request.text.length === 0) {
      return;
    }

    const agentId = resolveAgentId(
      this.sessionResolver.getSessionDescriptor(request.sessionId),
      request
    );
    const useNativeTerminalInput = agentId !== null && supportsAgentNativeTerminalInput(agentId);

    this.writer.write(request.sessionId, toTerminalPayload(request.text, useNativeTerminalInput));

    if (!request.submit) {
      return;
    }

    const submitDelayMs = normalizeSubmitDelayMs(request.submitDelayMs);
    if (submitDelayMs === 0) {
      this.writer.write(request.sessionId, SUBMIT_INPUT);
      return;
    }

    setTimeout(() => {
      this.writer.write(request.sessionId, SUBMIT_INPUT);
    }, submitDelayMs);
  }
}

export const agentInputService = new AgentInputService(
  {
    write: (sessionId, data) => {
      sessionManager.write(sessionId, data);
    },
  },
  {
    getSessionDescriptor: (sessionId) => sessionManager.getSessionDescriptor(sessionId),
  }
);
