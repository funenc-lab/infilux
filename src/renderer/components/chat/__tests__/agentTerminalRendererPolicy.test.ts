import { describe, expect, it } from 'vitest';
import { shouldPreferAgentTerminalCompatibilityRenderer } from '../agentTerminalRendererPolicy';

describe('agentTerminalRendererPolicy', () => {
  it('keeps compatibility rendering for a single canvas terminal', () => {
    expect(
      shouldPreferAgentTerminalCompatibilityRenderer({
        isCanvasDisplayMode: true,
        mountedTerminalCount: 1,
      })
    ).toBe(true);
  });

  it('uses the configured renderer when a canvas mounts multiple terminals', () => {
    expect(
      shouldPreferAgentTerminalCompatibilityRenderer({
        isCanvasDisplayMode: true,
        mountedTerminalCount: 2,
      })
    ).toBe(false);
  });

  it('keeps compatibility rendering outside the canvas', () => {
    expect(
      shouldPreferAgentTerminalCompatibilityRenderer({
        isCanvasDisplayMode: false,
        mountedTerminalCount: 4,
      })
    ).toBe(true);
  });
});
