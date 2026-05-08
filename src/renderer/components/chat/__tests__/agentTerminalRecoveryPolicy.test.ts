import { describe, expect, it } from 'vitest';
import { shouldRetryDeadAgentSession } from '../agentTerminalRecoveryPolicy';

describe('shouldRetryDeadAgentSession', () => {
  it('enables dead-session retry for persistent recovered host sessions', () => {
    expect(
      shouldRetryDeadAgentSession({
        persistenceEnabled: true,
        recovered: true,
        recoveryState: 'live',
        hostSessionKey: 'infilux-session-1',
      })
    ).toBe(true);
  });

  it('does not retry non-persistent or metadata-only recovery states', () => {
    expect(
      shouldRetryDeadAgentSession({
        persistenceEnabled: false,
        recovered: true,
        recoveryState: 'live',
        hostSessionKey: 'infilux-session-1',
      })
    ).toBe(false);

    expect(
      shouldRetryDeadAgentSession({
        persistenceEnabled: true,
        recovered: true,
        recoveryState: 'missing-host-session',
        hostSessionKey: 'infilux-session-1',
      })
    ).toBe(false);
  });
});
