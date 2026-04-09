import { describe, expect, it } from 'vitest';
import { resolveSessionPersistentHostSessionKey } from '../persistentHostSession';

describe('persistentHostSession', () => {
  it('preserves the recovered tmux host session key on unix hosts', () => {
    expect(
      resolveSessionPersistentHostSessionKey({
        session: {
          id: 'session-1',
          hostSessionKey: 'enso-session-1',
        },
        platform: 'darwin',
        runtimeChannel: 'prod',
      })
    ).toBe('enso-session-1');
  });

  it('falls back to the current runtime namespace when no recovered host session key exists', () => {
    expect(
      resolveSessionPersistentHostSessionKey({
        session: {
          id: 'session-1',
        },
        platform: 'linux',
        runtimeChannel: 'test',
      })
    ).toBe('infilux-test-session-1');
  });

  it('uses the backend session id for supervisor-backed windows sessions', () => {
    expect(
      resolveSessionPersistentHostSessionKey({
        session: {
          id: 'session-1',
          backendSessionId: 'backend-1',
        },
        platform: 'win32',
        runtimeChannel: 'prod',
      })
    ).toBe('backend-1');
  });
});
