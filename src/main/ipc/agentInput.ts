import { type AgentInputDispatchRequest, IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { agentInputService } from '../services/session/AgentInputService';

function validateAgentInputDispatchRequest(request: unknown): AgentInputDispatchRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid agent input dispatch request');
  }

  const { sessionId, agentId, text, submit, submitDelayMs } =
    request as Partial<AgentInputDispatchRequest>;

  if (typeof sessionId !== 'string' || typeof text !== 'string') {
    throw new Error('Invalid agent input dispatch request');
  }

  if (agentId !== undefined && typeof agentId !== 'string') {
    throw new Error('Invalid agent input dispatch request');
  }

  if (submit !== undefined && typeof submit !== 'boolean') {
    throw new Error('Invalid agent input dispatch request');
  }

  if (
    submitDelayMs !== undefined &&
    (typeof submitDelayMs !== 'number' || Number.isNaN(submitDelayMs))
  ) {
    throw new Error('Invalid agent input dispatch request');
  }

  return {
    sessionId,
    agentId,
    text,
    submit,
    submitDelayMs,
  };
}

export function registerAgentInputHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_INPUT_DISPATCH, async (_, request: unknown) => {
    agentInputService.dispatch(validateAgentInputDispatchRequest(request));
  });
}
