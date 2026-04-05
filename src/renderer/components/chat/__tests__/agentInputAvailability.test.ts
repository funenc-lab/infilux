import { describe, expect, it } from 'vitest';
import {
  resolveAgentInputAvailability,
  resolveAgentInputUnavailableReason,
} from '../agentInputAvailability';

const t = (value: string, vars?: Record<string, string | number>) => {
  if (!vars) {
    return value;
  }

  return Object.entries(vars).reduce(
    (result, [key, nextValue]) => result.replace(`{{${key}}}`, String(nextValue)),
    value
  );
};

describe('agentInputAvailability', () => {
  it('maps transport readiness into a stable availability state', () => {
    expect(resolveAgentInputAvailability({ backendSessionId: null, runtimeState: 'live' })).toBe(
      'awaiting-session'
    );
    expect(
      resolveAgentInputAvailability({ backendSessionId: 'backend-1', runtimeState: 'reconnecting' })
    ).toBe('reconnecting');
    expect(
      resolveAgentInputAvailability({ backendSessionId: 'backend-1', runtimeState: 'dead' })
    ).toBe('disconnected');
    expect(
      resolveAgentInputAvailability({
        backendSessionId: 'backend-1',
        runtimeState: 'missing-host-session',
      })
    ).toBe('disconnected');
    expect(
      resolveAgentInputAvailability({ backendSessionId: 'backend-1', runtimeState: 'live' })
    ).toBe('ready');
  });

  it('returns hover copy that explains why send is unavailable', () => {
    expect(
      resolveAgentInputUnavailableReason({
        agentCommand: 'codex',
        availability: 'awaiting-session',
        isRemoteExecution: false,
        t,
      })
    ).toBe('Loading codex...');
    expect(
      resolveAgentInputUnavailableReason({
        agentCommand: 'claude',
        availability: 'reconnecting',
        isRemoteExecution: true,
        t,
      })
    ).toBe('Remote terminal input is temporarily disabled while reconnecting.');
    expect(
      resolveAgentInputUnavailableReason({
        agentCommand: 'claude',
        availability: 'disconnected',
        isRemoteExecution: false,
        t,
      })
    ).toBe('Terminal session is unavailable. Start a fresh session to continue.');
    expect(
      resolveAgentInputUnavailableReason({
        agentCommand: 'claude',
        availability: 'ready',
        isRemoteExecution: false,
        t,
      })
    ).toBeUndefined();
  });
});
