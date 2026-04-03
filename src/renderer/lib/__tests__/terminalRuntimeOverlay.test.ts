import { describe, expect, it } from 'vitest';
import { resolveTerminalRuntimeOverlayState } from '../terminalRuntimeOverlay';

describe('resolveTerminalRuntimeOverlayState', () => {
  it('does not show an overlay while the terminal is loading', () => {
    expect(
      resolveTerminalRuntimeOverlayState({
        isLoading: true,
        isRemoteExecution: true,
        runtimeState: 'dead',
      })
    ).toBeNull();
  });

  it('does not show a disconnect overlay for local dead sessions', () => {
    expect(
      resolveTerminalRuntimeOverlayState({
        isLoading: false,
        isRemoteExecution: false,
        runtimeState: 'dead',
      })
    ).toBeNull();
  });

  it('returns reconnecting for remote sessions that are recovering', () => {
    expect(
      resolveTerminalRuntimeOverlayState({
        isLoading: false,
        isRemoteExecution: true,
        runtimeState: 'reconnecting',
      })
    ).toBe('reconnecting');
  });

  it('returns disconnected for remote sessions that are dead', () => {
    expect(
      resolveTerminalRuntimeOverlayState({
        isLoading: false,
        isRemoteExecution: true,
        runtimeState: 'dead',
      })
    ).toBe('disconnected');
  });
});
