import type { PersistentAgentSessionRecord } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxSessionHostTestDoubles = vi.hoisted(() => ({
  hasSession: vi.fn(),
}));

vi.mock('../../cli/TmuxDetector', () => ({
  tmuxDetector: {
    hasSession: tmuxSessionHostTestDoubles.hasSession,
  },
}));

function makeRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'codex',
    agentCommand: 'codex',
    environment: 'native',
    repoPath: '/repo',
    cwd: '/repo/worktree',
    displayName: 'Codex',
    activated: true,
    initialized: true,
    hostKind: 'tmux',
    hostSessionKey: 'infilux-session-1',
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
    ...overrides,
  };
}

describe('TmuxSessionHost', () => {
  const originalRuntimeChannel = process.env.INFILUX_RUNTIME_CHANNEL;

  beforeEach(() => {
    tmuxSessionHostTestDoubles.hasSession.mockReset();
    process.env.INFILUX_RUNTIME_CHANNEL = 'prod';
  });

  afterEach(() => {
    if (originalRuntimeChannel === undefined) {
      delete process.env.INFILUX_RUNTIME_CHANNEL;
    } else {
      process.env.INFILUX_RUNTIME_CHANNEL = originalRuntimeChannel;
    }
    vi.restoreAllMocks();
  });

  it('checks current runtime sessions against the current tmux server', async () => {
    tmuxSessionHostTestDoubles.hasSession.mockResolvedValue(true);
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(makeRecord());

    expect(state).toBe('live');
    expect(tmuxSessionHostTestDoubles.hasSession).toHaveBeenCalledWith(
      'infilux-session-1',
      'infilux'
    );
  });

  it('checks legacy persisted sessions against the matching legacy tmux server', async () => {
    tmuxSessionHostTestDoubles.hasSession.mockResolvedValue(true);
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(
      makeRecord({
        hostSessionKey: 'enso-session-1',
      })
    );

    expect(state).toBe('live');
    expect(tmuxSessionHostTestDoubles.hasSession).toHaveBeenCalledWith('enso-session-1', 'enso');
  });
});
