import type { PersistentAgentSessionRecord } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supervisorSessionHostTestDoubles = vi.hoisted(() => {
  const hasSession = vi.fn();
  return {
    hasSession,
  };
});

vi.mock('../LocalSupervisorRuntime', () => ({
  localSupervisorRuntime: {
    hasSession: supervisorSessionHostTestDoubles.hasSession,
  },
}));

import { SupervisorSessionHost } from '../hosts/SupervisorSessionHost';

function makeRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'ui-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'claude',
    agentCommand: 'claude',
    environment: 'native',
    repoPath: 'C:/repo',
    cwd: 'C:/repo',
    displayName: 'Claude',
    activated: true,
    initialized: true,
    hostKind: 'supervisor',
    hostSessionKey: 'host-1',
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
    ...overrides,
  };
}

describe('SupervisorSessionHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supervisorSessionHostTestDoubles.hasSession.mockResolvedValue(true);
  });

  it('returns live when the supervisor runtime still has the backend session', async () => {
    const host = new SupervisorSessionHost();
    const record = makeRecord();

    await expect(host.probeSession(record)).resolves.toBe('live');
    expect(supervisorSessionHostTestDoubles.hasSession).toHaveBeenCalledWith('backend-1');
  });

  it('falls back to the stored host session key and marks missing sessions accordingly', async () => {
    const host = new SupervisorSessionHost();
    const record = makeRecord({
      backendSessionId: undefined,
      hostSessionKey: 'host-fallback',
    });
    supervisorSessionHostTestDoubles.hasSession.mockResolvedValueOnce(false);

    await expect(host.probeSession(record)).resolves.toBe('missing-host-session');
    expect(supervisorSessionHostTestDoubles.hasSession).toHaveBeenCalledWith('host-fallback');
  });

  it('preserves dead records without probing the runtime again', async () => {
    const host = new SupervisorSessionHost();
    const record = makeRecord({
      lastKnownState: 'dead',
    });

    await expect(host.probeSession(record)).resolves.toBe('dead');
    expect(supervisorSessionHostTestDoubles.hasSession).not.toHaveBeenCalled();
  });
});
