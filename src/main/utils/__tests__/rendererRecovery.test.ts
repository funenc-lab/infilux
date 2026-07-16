import { describe, expect, it } from 'vitest';
import {
  buildRendererFailureContext,
  type RendererDiagnosticsSnapshot,
  resolveRendererRecoveryReloadDecision,
  shouldAutoRecoverRenderer,
} from '../rendererRecovery';

describe('rendererRecovery', () => {
  it('auto-recovers for crash-like reasons', () => {
    expect(shouldAutoRecoverRenderer('crashed')).toBe(true);
    expect(shouldAutoRecoverRenderer('oom')).toBe(true);
  });

  it('does not auto-recover after a clean exit', () => {
    expect(shouldAutoRecoverRenderer('clean-exit')).toBe(false);
    expect(shouldAutoRecoverRenderer('killed')).toBe(false);
  });

  it('does not reload an unresponsive renderer while its previous recovery load is pending', () => {
    expect(
      resolveRendererRecoveryReloadDecision({
        isLoading: true,
        recoveryAttemptCount: 1,
        maxRecoveryAttempts: 2,
      })
    ).toBe('skip-loading');
  });

  it('stops reloading after the recovery budget is exhausted', () => {
    expect(
      resolveRendererRecoveryReloadDecision({
        isLoading: false,
        recoveryAttemptCount: 2,
        maxRecoveryAttempts: 2,
      })
    ).toBe('budget-exhausted');
  });

  it('allows a recovery reload while the renderer is idle and within budget', () => {
    expect(
      resolveRendererRecoveryReloadDecision({
        isLoading: false,
        recoveryAttemptCount: 1,
        maxRecoveryAttempts: 2,
      })
    ).toBe('reload');
  });

  it('builds a structured failure context for logging', () => {
    const diagnostics: RendererDiagnosticsSnapshot = {
      windowId: 7,
      totalWindowCount: 2,
      isMainWindow: true,
      isWindowVisible: true,
      isWindowFocused: false,
      isWindowLoading: false,
      url: 'app://index.html',
    };

    expect(
      buildRendererFailureContext({
        diagnostics,
        reason: 'crashed',
        exitCode: 133,
      })
    ).toEqual({
      reason: 'crashed',
      exitCode: 133,
      windowId: 7,
      totalWindowCount: 2,
      isMainWindow: true,
      isWindowVisible: true,
      isWindowFocused: false,
      isWindowLoading: false,
      url: 'app://index.html',
    });
  });
});
