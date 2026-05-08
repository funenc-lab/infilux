import { describe, expect, it } from 'vitest';
import { resolveAgentStartupOverlayPresentation } from '../agentStartupOverlay';

describe('agentStartupOverlay', () => {
  it('returns compact startup copy while the session is still expected to appear quickly', () => {
    expect(resolveAgentStartupOverlayPresentation({ isStalled: false })).toEqual({
      eyebrowKey: 'Agent runtime',
      state: 'starting',
      titleKey: 'Preparing runtime',
      descriptionKey: 'Attaching the terminal and waiting for the agent prompt.',
    });
  });

  it('upgrades the copy when startup takes longer than expected', () => {
    expect(resolveAgentStartupOverlayPresentation({ isStalled: true })).toEqual({
      eyebrowKey: 'Agent runtime',
      state: 'stalled',
      titleKey: 'Still preparing',
      descriptionKey: 'Runtime is taking longer than expected. Retry if the terminal stays quiet.',
    });
  });
});
