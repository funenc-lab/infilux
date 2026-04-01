import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it, vi } from 'vitest';
import {
  buildXtermRecoveryAttemptKey,
  createXtermSessionBindingSnapshot,
  resolveReusableBackendSessionId,
  shouldRebindXtermSession,
  shouldRetryDeadSessionRecovery,
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

  it('keeps the existing backend session id for local terminals', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalActivity = vi.fn().mockResolvedValue(true);

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-1',
        cwd: '/repo',
        getRemoteStatus,
        getLocalActivity,
      })
    ).resolves.toBe('backend-1');

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalActivity).toHaveBeenCalledWith('backend-1');
  });

  it('drops the existing backend session id for local terminals when the session is stale', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalActivity = vi.fn().mockResolvedValue(false);

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'backend-stale',
        cwd: '/repo',
        getRemoteStatus,
        getLocalActivity,
      })
    ).resolves.toBeUndefined();

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalActivity).toHaveBeenCalledWith('backend-stale');
  });

  it('keeps the existing backend session id for local persistent recovery when untracked attach is allowed', async () => {
    const getRemoteStatus = vi.fn();
    const getLocalActivity = vi.fn().mockResolvedValue(false);

    await expect(
      resolveReusableBackendSessionId({
        backendSessionId: 'supervisor-session-1',
        cwd: 'C:/repo',
        getRemoteStatus,
        getLocalActivity,
        allowUntrackedLocalAttach: true,
      })
    ).resolves.toBe('supervisor-session-1');

    expect(getRemoteStatus).not.toHaveBeenCalled();
    expect(getLocalActivity).not.toHaveBeenCalled();
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

    expect(buildXtermRecoveryAttemptKey(snapshot)).toBe('/repo::terminal::ephemeral::no-session');
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

  it('allows retry again when the bound session changes', () => {
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

    expect(shouldRetryDeadSessionRecovery(buildXtermRecoveryAttemptKey(previous), next)).toBe(true);
  });
});
