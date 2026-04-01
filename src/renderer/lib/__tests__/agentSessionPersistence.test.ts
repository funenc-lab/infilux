import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it } from 'vitest';
import {
  isSessionPersistable,
  isSessionPersistenceEnabledForHost,
} from '../agentSessionPersistence';

describe('agentSessionPersistence', () => {
  it('enables persistence for local Windows agent sessions without tmux', () => {
    expect(
      isSessionPersistenceEnabledForHost({
        cwd: 'C:/repo',
        platform: 'win32',
        tmuxEnabled: false,
      })
    ).toBe(true);
  });

  it('requires tmux for local Unix agent session persistence', () => {
    expect(
      isSessionPersistenceEnabledForHost({
        cwd: '/repo',
        platform: 'darwin',
        tmuxEnabled: false,
      })
    ).toBe(false);
    expect(
      isSessionPersistenceEnabledForHost({
        cwd: '/repo',
        platform: 'linux',
        tmuxEnabled: true,
      })
    ).toBe(true);
  });

  it('disables persistence for remote virtual worktrees', () => {
    expect(
      isSessionPersistenceEnabledForHost({
        cwd: toRemoteVirtualPath('conn-1', '/var/repo'),
        platform: 'linux',
        tmuxEnabled: true,
      })
    ).toBe(false);
  });

  it('only persists activated sessions with persistence enabled', () => {
    expect(isSessionPersistable({ activated: true, persistenceEnabled: true })).toBe(true);
    expect(isSessionPersistable({ activated: true, persistenceEnabled: false })).toBe(false);
    expect(isSessionPersistable({ activated: false, persistenceEnabled: true })).toBe(false);
  });
});
