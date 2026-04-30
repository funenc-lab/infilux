import type { PersistentAgentSessionRecord } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxSessionHostTestDoubles = vi.hoisted(() => ({
  hasSession: vi.fn(),
  probeSession: vi.fn(),
}));

vi.mock('../../cli/TmuxDetector', () => ({
  tmuxDetector: {
    hasSession: tmuxSessionHostTestDoubles.hasSession,
    probeSession: tmuxSessionHostTestDoubles.probeSession,
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
    tmuxSessionHostTestDoubles.probeSession.mockReset();
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
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('exists');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(makeRecord());

    expect(state).toBe('live');
    expect(tmuxSessionHostTestDoubles.probeSession).toHaveBeenCalledWith(
      'infilux-session-1',
      'infilux'
    );
  });

  it('checks legacy persisted sessions against the matching legacy tmux server', async () => {
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('exists');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(
      makeRecord({
        hostSessionKey: 'enso-session-1',
      })
    );

    expect(state).toBe('live');
    expect(tmuxSessionHostTestDoubles.probeSession).toHaveBeenCalledWith('enso-session-1', 'enso');
  });

  it('revives stale dead records when the tmux host session still exists', async () => {
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('exists');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(
      makeRecord({
        lastKnownState: 'dead',
      })
    );

    expect(state).toBe('live');
    expect(tmuxSessionHostTestDoubles.probeSession).toHaveBeenCalledWith(
      'infilux-session-1',
      'infilux'
    );
  });

  it('keeps dead records dead when the tmux host session is missing', async () => {
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('missing');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(
      makeRecord({
        lastKnownState: 'dead',
      })
    );

    expect(state).toBe('dead');
    expect(tmuxSessionHostTestDoubles.probeSession).toHaveBeenCalledWith(
      'infilux-session-1',
      'infilux'
    );
  });

  it('marks non-dead records missing when the tmux host session is missing', async () => {
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('missing');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(makeRecord());

    expect(state).toBe('missing-host-session');
  });

  it('preserves the previous state when tmux probing fails', async () => {
    tmuxSessionHostTestDoubles.probeSession.mockResolvedValue('failed');
    const { TmuxSessionHost } = await import('../hosts/TmuxSessionHost');

    const state = await new TmuxSessionHost().probeSession(
      makeRecord({
        lastKnownState: 'live',
      })
    );

    expect(state).toBe('live');
  });
});
