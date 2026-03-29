import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('agent notification listeners', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete (globalThis as { window?: Window }).window;
  });

  it('does not throw when agent activity notifications are unavailable', async () => {
    (globalThis as { window?: object }).window = {};

    const { initAgentActivityListener } = await import('../worktreeActivity');

    expect(() => initAgentActivityListener()).not.toThrow();
    expect(initAgentActivityListener()).toBeTypeOf('function');
  });

  it('does not throw when agent status notifications are unavailable', async () => {
    (globalThis as { window?: object }).window = {};

    const { initAgentStatusListener } = await import('../agentStatus');

    expect(() => initAgentStatusListener()).not.toThrow();
    expect(initAgentStatusListener()).toBeTypeOf('function');
  });
});
