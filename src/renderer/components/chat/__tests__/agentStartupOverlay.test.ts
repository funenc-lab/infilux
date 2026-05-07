import { describe, expect, it } from 'vitest';
import { resolveAgentStartupOverlayPresentation } from '../agentStartupOverlay';

describe('agentStartupOverlay', () => {
  it('returns compact startup copy while the session is still expected to appear quickly', () => {
    expect(resolveAgentStartupOverlayPresentation({ isStalled: false })).toEqual({
      state: 'starting',
      titleKey: 'Starting session',
      descriptionKey: 'Waiting for the agent prompt.',
    });
  });

  it('upgrades the copy when startup takes longer than expected', () => {
    expect(resolveAgentStartupOverlayPresentation({ isStalled: true })).toEqual({
      state: 'stalled',
      titleKey: 'Still starting',
      descriptionKey: 'Session startup is taking longer than expected.',
    });
  });
});
