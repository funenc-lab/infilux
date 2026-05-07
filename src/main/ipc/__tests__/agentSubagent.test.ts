import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const agentSubagentTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const listLive = vi.fn();
  const listSession = vi.fn();
  const getTranscript = vi.fn();
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  const unsubscribeOwner = vi.fn();

  function reset() {
    handlers.clear();
    listLive.mockReset();
    listLive.mockResolvedValue({ items: [], generatedAt: 1 });
    listSession.mockReset();
    listSession.mockResolvedValue({ items: [], generatedAt: 2 });
    getTranscript.mockReset();
    getTranscript.mockResolvedValue({
      provider: 'codex',
      threadId: 'thread-1',
      label: 'Worker',
      entries: [],
      generatedAt: 3,
    });
    subscribe.mockReset();
    unsubscribe.mockReset();
    unsubscribeOwner.mockReset();
  }

  return {
    handlers,
    listLive,
    listSession,
    getTranscript,
    subscribe,
    unsubscribe,
    unsubscribeOwner,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      agentSubagentTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/agent/CodexSubagentTracker', () => ({
  codexSubagentTracker: {
    listLive: agentSubagentTestDoubles.listLive,
  },
}));

vi.mock('../../services/agent/CodexSessionSubagentService', () => ({
  CodexSessionSubagentService: class {
    listSession = agentSubagentTestDoubles.listSession;
  },
}));

vi.mock('../../services/agent/CodexSubagentTranscriptService', () => ({
  codexSubagentTranscriptService: {
    getTranscript: agentSubagentTestDoubles.getTranscript,
  },
}));

vi.mock('../../services/agent/SessionSubagentPollingCoordinator', () => ({
  SessionSubagentPollingCoordinator: class {
    subscribe = agentSubagentTestDoubles.subscribe;
    unsubscribe = agentSubagentTestDoubles.unsubscribe;
    unsubscribeOwner = agentSubagentTestDoubles.unsubscribeOwner;
  },
}));

function getHandler(channel: string): Handler {
  const handler = agentSubagentTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

function createSender(id: number) {
  let destroyedHandler: (() => void) | undefined;

  return {
    id,
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'destroyed') {
        destroyedHandler = handler;
      }
    }),
    off: vi.fn(),
    triggerDestroyed() {
      destroyedHandler?.();
    },
  };
}

describe('agentSubagent IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    agentSubagentTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates point-in-time requests to the corresponding services', async () => {
    const { registerAgentSubagentHandlers } = await import('../agentSubagent');
    registerAgentSubagentHandlers();

    await expect(
      getHandler(IPC_CHANNELS.AGENT_SUBAGENT_LIST_LIVE)({}, { cwds: ['/repo'] })
    ).resolves.toEqual({
      items: [],
      generatedAt: 1,
    });
    expect(agentSubagentTestDoubles.listLive).toHaveBeenCalledWith({ cwds: ['/repo'] });

    await expect(
      getHandler(IPC_CHANNELS.AGENT_SUBAGENT_LIST_SESSION)(
        {},
        {
          providerSessionId: 'root-1',
          cwd: '/repo',
        }
      )
    ).resolves.toEqual({
      items: [],
      generatedAt: 2,
    });
    expect(agentSubagentTestDoubles.listSession).toHaveBeenCalledWith({
      providerSessionId: 'root-1',
      cwd: '/repo',
    });

    await expect(
      getHandler(IPC_CHANNELS.AGENT_SUBAGENT_GET_TRANSCRIPT)(
        {},
        {
          threadId: 'thread-1',
        }
      )
    ).resolves.toEqual({
      provider: 'codex',
      threadId: 'thread-1',
      label: 'Worker',
      entries: [],
      generatedAt: 3,
    });
    expect(agentSubagentTestDoubles.getTranscript).toHaveBeenCalledWith({
      threadId: 'thread-1',
    });
  });

  it('binds subscription updates to the sender lifecycle', async () => {
    const { registerAgentSubagentHandlers } = await import('../agentSubagent');
    registerAgentSubagentHandlers();

    const sender = createSender(7);
    const subscribeHandler = getHandler(IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_SUBSCRIBE);
    const unsubscribeHandler = getHandler(IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_UNSUBSCRIBE);
    const request = {
      subscriptionId: 'sub-1',
      pollIntervalMs: 1_000,
      targets: [
        {
          sessionId: 'ui-session-1',
          providerSessionId: 'root-1',
          cwd: '/repo',
        },
      ],
    };

    await expect(subscribeHandler({ sender }, request)).resolves.toBe(true);
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    expect(agentSubagentTestDoubles.subscribe).toHaveBeenCalledWith(
      {
        ownerId: '7',
        subscriptionId: 'sub-1',
        targets: request.targets,
        pollIntervalMs: 1_000,
      },
      expect.any(Function)
    );

    const onUpdated = agentSubagentTestDoubles.subscribe.mock.calls[0]?.[1] as (
      event: Record<string, unknown>
    ) => void;
    onUpdated({
      subscriptionId: 'sub-1',
      itemsBySessionId: {
        'ui-session-1': [],
      },
      generatedAt: 4,
    });
    expect(sender.send).toHaveBeenCalledWith(IPC_CHANNELS.AGENT_SUBAGENT_SESSIONS_UPDATED, {
      subscriptionId: 'sub-1',
      itemsBySessionId: {
        'ui-session-1': [],
      },
      generatedAt: 4,
    });

    await expect(
      unsubscribeHandler(
        { sender },
        {
          subscriptionId: 'sub-1',
        }
      )
    ).resolves.toBe(true);
    expect(agentSubagentTestDoubles.unsubscribe).toHaveBeenCalledWith({
      ownerId: '7',
      subscriptionId: 'sub-1',
    });

    sender.triggerDestroyed();
    expect(agentSubagentTestDoubles.unsubscribeOwner).toHaveBeenCalledWith('7');
    expect(sender.off).toHaveBeenCalledWith('destroyed', expect.any(Function));
  });
});
