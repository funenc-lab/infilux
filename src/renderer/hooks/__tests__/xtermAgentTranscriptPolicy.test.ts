import { describe, expect, it } from 'vitest';
import {
  shouldSuppressAgentAlternateScreenSwitch,
  shouldSuppressAgentMouseTrackingSwitch,
  shouldSuppressAgentPrivateModeSwitch,
} from '../xtermAgentTranscriptPolicy';

describe('xtermAgentTranscriptPolicy', () => {
  it('suppresses alternate-screen enable sequences so agent transcript output stays in scrollback', () => {
    expect(shouldSuppressAgentAlternateScreenSwitch([1049])).toBe(true);
    expect(shouldSuppressAgentAlternateScreenSwitch([1047])).toBe(true);
    expect(shouldSuppressAgentAlternateScreenSwitch([47])).toBe(true);
  });

  it('suppresses mixed DECSET payloads when they would switch the agent terminal into the alternate screen', () => {
    expect(shouldSuppressAgentAlternateScreenSwitch([1, 1049])).toBe(true);
  });

  it('suppresses mouse-tracking private modes so pointer and wheel gestures do not escape the input area', () => {
    expect(shouldSuppressAgentMouseTrackingSwitch([1000])).toBe(true);
    expect(shouldSuppressAgentMouseTrackingSwitch([1002])).toBe(true);
    expect(shouldSuppressAgentMouseTrackingSwitch([1003])).toBe(true);
    expect(shouldSuppressAgentMouseTrackingSwitch([1006])).toBe(true);
  });

  it('suppresses combined private mode payloads when either alternate-screen or mouse tracking would be enabled', () => {
    expect(shouldSuppressAgentPrivateModeSwitch([1, 1000])).toBe(true);
    expect(shouldSuppressAgentPrivateModeSwitch([25, 1049])).toBe(true);
  });

  it('keeps non alternate-screen private modes untouched', () => {
    expect(shouldSuppressAgentAlternateScreenSwitch([1, 25])).toBe(false);
    expect(shouldSuppressAgentAlternateScreenSwitch([1048])).toBe(false);
    expect(shouldSuppressAgentMouseTrackingSwitch([1, 25])).toBe(false);
    expect(shouldSuppressAgentPrivateModeSwitch([1, 25])).toBe(false);
  });
});
