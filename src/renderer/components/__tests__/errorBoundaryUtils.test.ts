import { describe, expect, it } from 'vitest';
import {
  buildRendererErrorAutoRecoverySignature,
  DEV_RENDERER_ERROR_AUTO_RECOVERY_COOLDOWN_MS,
  formatErrorBoundaryMessage,
  shouldAutoRecoverRendererError,
} from '../errorBoundaryUtils';

describe('formatErrorBoundaryMessage', () => {
  it('formats standard Error instances', () => {
    const message = formatErrorBoundaryMessage(new Error('Renderer exploded'));

    expect(message).toBe('Error: Renderer exploded');
  });

  it('falls back for unknown thrown values', () => {
    const message = formatErrorBoundaryMessage({
      reason: 'bad-state',
    });

    expect(message).toBe('Unknown renderer error');
  });
});

describe('shouldAutoRecoverRendererError', () => {
  it('allows one dev auto-recovery for Agent terminal React hook order errors', () => {
    const shouldRecover = shouldAutoRecoverRendererError({
      componentStack: '\n    at AgentTerminal',
      errorMessage:
        'Error: Should have a queue. You are likely calling Hooks conditionally, which is not allowed.',
      lastRecoveryAttemptedAt: null,
      now: 1000,
      runtimeChannel: 'dev',
    });

    expect(shouldRecover).toBe(true);
  });

  it('allows one dev auto-recovery for Agent panel React hook order errors', () => {
    const shouldRecover = shouldAutoRecoverRendererError({
      componentStack: '\n    at AgentPanel',
      errorMessage: 'React has detected a change in the order of Hooks called by AgentPanel.',
      lastRecoveryAttemptedAt: null,
      now: 1000,
      runtimeChannel: 'dev',
    });

    expect(shouldRecover).toBe(true);
  });

  it('allows one dev auto-recovery for Agent panel hook-state corruption errors', () => {
    const shouldRecover = shouldAutoRecoverRendererError({
      componentStack: '\n    at AgentPanel',
      errorMessage: "TypeError: Cannot read properties of undefined (reading 'key')",
      lastRecoveryAttemptedAt: null,
      now: 1000,
      runtimeChannel: 'dev',
    });

    expect(shouldRecover).toBe(true);
  });

  it('does not auto-recover production renderer errors', () => {
    const shouldRecover = shouldAutoRecoverRendererError({
      componentStack: '\n    at AgentTerminal',
      errorMessage:
        'Error: Should have a queue. You are likely calling Hooks conditionally, which is not allowed.',
      lastRecoveryAttemptedAt: null,
      now: 1000,
      runtimeChannel: 'prod',
    });

    expect(shouldRecover).toBe(false);
  });

  it('does not auto-recover again inside the retry cooldown', () => {
    const shouldRecover = shouldAutoRecoverRendererError({
      componentStack: '\n    at AgentTerminal',
      errorMessage:
        'Error: Should have a queue. You are likely calling Hooks conditionally, which is not allowed.',
      lastRecoveryAttemptedAt: 1000,
      now: 1000 + DEV_RENDERER_ERROR_AUTO_RECOVERY_COOLDOWN_MS - 1,
      runtimeChannel: 'dev',
    });

    expect(shouldRecover).toBe(false);
  });

  it('builds a stable recovery signature from the message and component stack', () => {
    const signature = buildRendererErrorAutoRecoverySignature({
      componentStack: '\n    at AgentTerminal\n    at AgentPanel',
      errorMessage: 'Error: Should have a queue.',
    });

    expect(signature).toContain('Error: Should have a queue.');
    expect(signature).toContain('at AgentTerminal');
  });
});
