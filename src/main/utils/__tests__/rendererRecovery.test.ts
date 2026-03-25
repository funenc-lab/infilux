import { describe, expect, it } from 'vitest';
import {
  buildRendererFailureContext,
  type RendererDiagnosticsSnapshot,
  shouldAutoRecoverRenderer,
} from '../rendererRecovery';

describe('rendererRecovery', () => {
  it('auto-recovers for crash-like reasons', () => {
    expect(shouldAutoRecoverRenderer('crashed')).toBe(true);
    expect(shouldAutoRecoverRenderer('oom')).toBe(true);
  });

  it('does not auto-recover after a clean exit', () => {
    expect(shouldAutoRecoverRenderer('clean-exit')).toBe(false);
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
