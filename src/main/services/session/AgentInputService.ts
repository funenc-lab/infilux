import type { AgentInputDispatchRequest, SessionDescriptor } from '@shared/types';
import { supportsAgentNativeTerminalInput } from '@shared/utils/agentInputMode';
import { sessionManager } from './SessionManager';

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';
const SUBMIT_INPUT = '\r';

export interface AgentInputWriter {
  write(sessionId: string, data: string): void | Promise<void>;
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
  private readonly pendingDispatches = new Map<string, Promise<void>>();

  constructor(
    private readonly writer: AgentInputWriter,
    private readonly sessionResolver: AgentInputSessionResolver
  ) {}

  async dispatch(request: AgentInputDispatchRequest): Promise<void> {
    if (request.sessionId.length === 0) {
      throw new Error('Agent input dispatch requires a session id');
    }

    if (request.text.length === 0) {
      return;
    }

    const previousDispatch = this.pendingDispatches.get(request.sessionId);
    const dispatch = previousDispatch
      ? previousDispatch.catch(() => undefined).then(() => this.dispatchInput(request))
      : this.dispatchInput(request);
    this.pendingDispatches.set(request.sessionId, dispatch);

    try {
      await dispatch;
    } finally {
      if (this.pendingDispatches.get(request.sessionId) === dispatch) {
        this.pendingDispatches.delete(request.sessionId);
      }
    }
  }

  private async dispatchInput(request: AgentInputDispatchRequest): Promise<void> {
    const agentId = resolveAgentId(
      this.sessionResolver.getSessionDescriptor(request.sessionId),
      request
    );
    const useNativeTerminalInput = agentId !== null && supportsAgentNativeTerminalInput(agentId);

    await this.writer.write(
      request.sessionId,
      toTerminalPayload(request.text, useNativeTerminalInput)
    );

    if (!request.submit) {
      return;
    }

    const submitDelayMs = normalizeSubmitDelayMs(request.submitDelayMs);
    if (submitDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, submitDelayMs));
    }
    await this.writer.write(request.sessionId, SUBMIT_INPUT);
  }
}

export const agentInputService = new AgentInputService(
  {
    write: (sessionId, data) => sessionManager.writeInput(sessionId, data),
  },
  {
    getSessionDescriptor: (sessionId) => sessionManager.getSessionDescriptor(sessionId),
  }
);
