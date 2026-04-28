import { IPC_CHANNELS } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const tokenUsageTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const getProjectUsage = vi.fn();

  function reset() {
    handlers.clear();
    getProjectUsage.mockReset();
    getProjectUsage.mockResolvedValue({
      generatedAt: 1,
      providerStatuses: [],
      projects: [],
    });
  }

  return {
    handlers,
    getProjectUsage,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      tokenUsageTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/tokenUsage', () => ({
  tokenUsageService: {
    getProjectUsage: tokenUsageTestDoubles.getProjectUsage,
  },
}));

function getHandler(channel: string): Handler {
  const handler = tokenUsageTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('token usage IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tokenUsageTestDoubles.reset();
  });

  it('delegates project usage requests to the token usage service', async () => {
    const { registerTokenUsageHandlers } = await import('../tokenUsage');
    registerTokenUsageHandlers();

    const request = {
      projectPaths: ['/repo/app'],
      includeSessions: true,
    };

    const handler = getHandler(IPC_CHANNELS.TOKEN_USAGE_PROJECTS_GET);
    await expect(handler({}, request)).resolves.toEqual({
      generatedAt: 1,
      providerStatuses: [],
      projects: [],
    });

    expect(tokenUsageTestDoubles.getProjectUsage).toHaveBeenCalledWith(request);
  });
});
