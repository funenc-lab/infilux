import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const agentInputTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const dispatch = vi.fn();

  function reset() {
    handlers.clear();
    dispatch.mockReset();
  }

  return {
    handlers,
    dispatch,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      agentInputTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/session/AgentInputService', () => ({
  agentInputService: {
    dispatch: agentInputTestDoubles.dispatch,
  },
}));

function getHandler(channel: string): Handler {
  const handler = agentInputTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('agentInput IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    agentInputTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates validated dispatch requests to the agent input service', async () => {
    const { registerAgentInputHandlers } = await import('../agentInput');
    registerAgentInputHandlers();

    const handler = getHandler(IPC_CHANNELS.AGENT_INPUT_DISPATCH);
    const request = {
      sessionId: 'session-1',
      text: 'hello world',
      submit: true,
      submitDelayMs: 120,
    };

    await handler({}, request);

    expect(agentInputTestDoubles.dispatch).toHaveBeenCalledTimes(1);
    expect(agentInputTestDoubles.dispatch).toHaveBeenCalledWith(request);
  });

  it('rejects invalid payloads before reaching the service', async () => {
    const { registerAgentInputHandlers } = await import('../agentInput');
    registerAgentInputHandlers();

    const handler = getHandler(IPC_CHANNELS.AGENT_INPUT_DISPATCH);

    await expect(handler({}, null)).rejects.toThrow('Invalid agent input dispatch request');
    expect(agentInputTestDoubles.dispatch).not.toHaveBeenCalled();
  });
});
