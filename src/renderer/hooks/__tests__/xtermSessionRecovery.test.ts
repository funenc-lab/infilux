import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it, vi } from 'vitest';
import {
  buildXtermRecoveryAttemptKey,
  createXtermSessionBindingSnapshot,
  resolveRecoveredInitialTerminalReplay,
  resolveRecoveredReplaySnapshotPersistence,
  resolveReusableBackendSessionId,
  shouldApplyInitialTerminalReplay,
  shouldAttemptDeadSessionRecovery,
  shouldRearmDeadSessionRecovery,
  shouldRebindXtermSession,
  shouldRetryDeadSessionRecovery,
  shouldRetrySessionCreateWithoutHost,
} from '../xtermSessionRecovery';

describe('resolveReusableBackendSessionId', () => {
  it('returns undefined when no backend session id is provided', async () => {
    const getRemoteStatus = vi.fn();

    await expect(
      resolveReusableBackendSessionId({
        cwd: toRemoteVirtualPath('conn-missing', '/workspace'),
        getRemoteStatus,
      })
    ).resolves.toBeUndefined();

    expect(getRemoteStatus).not.toHaveBeenCalled();
  });

  it('keeps the existing backend session id for live but idle local terminals', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalRuntimeInfo = vi.fn().mockResolvedValue({
      pid: 1234,
      isActive: false,
      isAlive: true,
    });

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-1',
        cwd: '/repo',
        getRemoteStatus,
        getLocalRuntimeInfo,
      })
    ).resolves.toBe('backend-1');

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalRuntimeInfo).toHaveBeenCalledWith('backend-1');
  });

  it('drops the existing backend session id for local terminals when the process is gone', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalRuntimeInfo = vi.fn().mockResolvedValue({
      pid: 1234,
      isActive: false,
      isAlive: false,
    });

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-stale',
        cwd: '/repo',
        getRemoteStatus,
        getLocalRuntimeInfo,
      })
    ).resolves.toBeUndefined();

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalRuntimeInfo).toHaveBeenCalledWith('backend-stale');
  });

  it('keeps the existing backend session id for local persistent recovery when untracked attach is allowed', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalRuntimeInfo = vi.fn().mockResolvedValue(null);

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'supervisor-session-1',
        cwd: 'C:/repo',
        getRemoteStatus,
        getLocalRuntimeInfo,
        allowUntrackedLocalAttach: true,
      })
    ).resolves.toBe('supervisor-session-1');

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalRuntimeInfo).not.toHaveBeenCalled();
  });

  it('keeps the existing backend session id when cwd is missing', async () => {
    const getRemoteStatus = vi.fn();

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-no-cwd',
        getRemoteStatus,
      })
    ).resolves.toBe('backend-no-cwd');

    expect(getRemoteStatus).not.toHaveBeenCalled();
  });

  it('keeps the existing backend session id when the remote connection is live', async () => {
    const getRemoteStatus = vi.fn().mockResolvedValue({ connected: true });

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-2',
        cwd: toRemoteVirtualPath('conn-1', '/workspace'),
        getRemoteStatus,
      })
    ).resolves.toBe('backend-2');

    expect(getRemoteStatus).toHaveBeenCalledWith('conn-1');
  });

  it('drops the existing backend session id when the remote connection is not connected', async () => {
    const getRemoteStatus = vi.fn().mockResolvedValue({ connected: false });

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-stale',
        cwd: toRemoteVirtualPath('conn-2', '/workspace'),
        getRemoteStatus,
      })
    ).resolves.toBeUndefined();
  });

  it('drops the existing backend session id when reading remote status fails', async () => {
    const getRemoteStatus = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-stale',
        cwd: toRemoteVirtualPath('conn-3', '/workspace'),
        getRemoteStatus,
      })
    ).resolves.toBeUndefined();
  });
});

describe('resolveRecoveredInitialTerminalReplay', () => {
  it('keeps the attached replay when the recovered backend session was successfully reattached', () => {
    expect(
      resolveRecoveredInitialTerminalReplay({
        attachedReplay: 'live replay',
        persistedReplaySnapshot: 'persisted replay',
        reusedExistingSession: true,
      })
    ).toBe('live replay');
  });

  it('falls back to the persisted replay snapshot when recovery had to create a fresh session', () => {
    expect(
      resolveRecoveredInitialTerminalReplay({
        attachedReplay: '',
        persistedReplaySnapshot: 'persisted replay',
        reusedExistingSession: false,
      })
    ).toBe('persisted replay');
  });

  it('appends new replay output after the persisted snapshot when recovery fell back to a fresh session', () => {
    expect(
      resolveRecoveredInitialTerminalReplay({
        attachedReplay: 'fresh prompt> ',
        persistedReplaySnapshot: 'persisted replay\n',
        reusedExistingSession: false,
      })
    ).toBe('persisted replay\nfresh prompt> ');
  });
});

describe('resolveRecoveredReplaySnapshotPersistence', () => {
  it('keeps the attached replay snapshot when the existing backend session was reused', () => {
    expect(
      resolveRecoveredReplaySnapshotPersistence({
        attachedReplay: 'live replay',
        reusedExistingSession: true,
      })
    ).toBe('live replay');
  });

  it('clears persisted replay snapshots when a fresh session starts without new output', () => {
    expect(
      resolveRecoveredReplaySnapshotPersistence({
        attachedReplay: '',
        reusedExistingSession: false,
      })
    ).toBeUndefined();
  });

  it('persists only the fresh session replay when recovery had to create a new session', () => {
    expect(
      resolveRecoveredReplaySnapshotPersistence({
        attachedReplay: 'fresh prompt> ',
        reusedExistingSession: false,
      })
    ).toBe('fresh prompt> ');
  });
});

describe('shouldApplyInitialTerminalReplay', () => {
  it('applies attached replay when no live output has reached the terminal', () => {
    expect(
      shouldApplyInitialTerminalReplay({
        initialReplay: 'attached replay',
        hasReceivedData: false,
        liveReplaySnapshot: undefined,
      })
    ).toBe(true);
  });

  it('skips attached replay after live output already reached the terminal', () => {
    expect(
      shouldApplyInitialTerminalReplay({
        initialReplay: 'attached replay',
        hasReceivedData: true,
        liveReplaySnapshot: undefined,
      })
    ).toBe(false);
  });

  it('skips attached replay when live output already populated the replay snapshot', () => {
    expect(
      shouldApplyInitialTerminalReplay({
        initialReplay: 'Codex is ready\n',
        hasReceivedData: false,
        liveReplaySnapshot: 'Codex is ready\n',
      })
    ).toBe(false);
  });
});

describe('shouldRebindXtermSession', () => {
  it('creates a binding snapshot from the current session identity inputs', () => {
    expect(
      createXtermSessionBindingSnapshot({
        cwd: '/repo',
        kind: 'terminal',
        persistOnDisconnect: false,
        sessionId: 'session-1',
      })
    ).toEqual({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
  });

  it('does not rebind when there is no previous binding snapshot', () => {
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(null, next)).toBe(false);
  });

  it('does not rebind when the created session id catches up with the prop value', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(false);
  });

  it('rebinds when the bound backend session id changes to another session', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-2',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(true);
  });

  it('rebinds when the terminal binding context changes', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo-a',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo-b',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(true);
  });

  it('rebinds when the terminal kind changes', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(true);
  });

  it('rebinds when the persistence policy changes', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(true);
  });

  it('does not rebind when the binding identity remains unchanged', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });

    expect(shouldRebindXtermSession(previous, next)).toBe(false);
  });
});

describe('shouldRetryDeadSessionRecovery', () => {
  it('builds distinct recovery keys for ephemeral sessions without a backend id', () => {
    const snapshot = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'terminal',
      persistOnDisconnect: false,
    });

    expect(buildXtermRecoveryAttemptKey(snapshot)).toBe('/repo::terminal::ephemeral');
  });

  it('retries once for each unique binding snapshot', () => {
    const snapshot = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });

    expect(shouldRetryDeadSessionRecovery(null, snapshot)).toBe(true);
    expect(shouldRetryDeadSessionRecovery(buildXtermRecoveryAttemptKey(snapshot), snapshot)).toBe(
      false
    );
  });

  it('does not allow another dead-session retry when only the backend session id changes', () => {
    const previous = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });
    const next = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-2',
    });

    expect(shouldRetryDeadSessionRecovery(buildXtermRecoveryAttemptKey(previous), next)).toBe(
      false
    );
  });
});

describe('shouldAttemptDeadSessionRecovery', () => {
  it('does not retry when dead-session recovery is disabled for the binding', () => {
    const snapshot = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });

    expect(
      shouldAttemptDeadSessionRecovery({
        allowDeadSessionRecovery: false,
        lastAttemptKey: null,
        snapshot,
      })
    ).toBe(false);
  });

  it('reuses the default retry policy when dead-session recovery is enabled', () => {
    const snapshot = createXtermSessionBindingSnapshot({
      cwd: '/repo',
      kind: 'agent',
      persistOnDisconnect: true,
      sessionId: 'session-1',
    });

    expect(
      shouldAttemptDeadSessionRecovery({
        allowDeadSessionRecovery: true,
        lastAttemptKey: null,
        snapshot,
      })
    ).toBe(true);
  });
});

describe('shouldRearmDeadSessionRecovery', () => {
  it('does not rearm retries when the restarted session exits before any output arrives', () => {
    expect(
      shouldRearmDeadSessionRecovery({
        hasReceivedData: false,
      })
    ).toBe(false);
  });

  it('rearms retries after the restarted session produces output', () => {
    expect(
      shouldRearmDeadSessionRecovery({
        hasReceivedData: true,
      })
    ).toBe(true);
  });

  it('treats replay as recovered output that can rearm later retries', () => {
    expect(
      shouldRearmDeadSessionRecovery({
        hasReceivedData: false,
        replay: 'restored prompt',
      })
    ).toBe(true);
  });
});

describe('shouldRetrySessionCreateWithoutHost', () => {
  it('retries persistent agent sessions when tmux host recovery fails', () => {
    expect(
      shouldRetrySessionCreateWithoutHost({
        error: new Error(
          "Error invoking remote method 'session:create': Error: Failed to recover tmux server: infilux"
        ),
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-ui-session-1',
        },
        hasFallback: true,
      })
    ).toBe(true);
  });

  it('retries persistent agent sessions when the recovered tmux session is missing', () => {
    expect(
      shouldRetrySessionCreateWithoutHost({
        error: new Error(
          'Failed to recover tmux session: infilux-006c1193-aa07-4954-9378-9eaeb55a20fc'
        ),
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-006c1193-aa07-4954-9378-9eaeb55a20fc',
          mode: 'attach-existing',
        },
        hasFallback: true,
      })
    ).toBe(true);
  });

  it('retries persistent agent sessions when tmux attach reports a missing recovered session', () => {
    expect(
      shouldRetrySessionCreateWithoutHost({
        error: new Error("can't find session: infilux-006c1193-aa07-4954-9378-9eaeb55a20fc"),
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-006c1193-aa07-4954-9378-9eaeb55a20fc',
          mode: 'attach-existing',
        },
        hasFallback: true,
      })
    ).toBe(true);
  });

  it('does not retry when no hostless fallback exists', () => {
    expect(
      shouldRetrySessionCreateWithoutHost({
        error: new Error('Failed to recover tmux server: infilux'),
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-ui-session-1',
        },
        hasFallback: false,
      })
    ).toBe(false);
  });

  it('does not retry unrelated terminal creation failures', () => {
    expect(
      shouldRetrySessionCreateWithoutHost({
        error: new Error('Permission denied'),
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-ui-session-1',
        },
        hasFallback: true,
      })
    ).toBe(false);
  });
});
