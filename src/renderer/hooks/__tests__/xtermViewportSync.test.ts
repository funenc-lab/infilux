import { describe, expect, it, vi } from 'vitest';
import { syncXtermViewportToSession } from '../xtermViewportSync';

describe('syncXtermViewportToSession', () => {
  it('fits the viewport and resizes the live backend session with the resulting terminal dimensions', () => {
    const resizeSession = vi.fn();
    const fitViewport = vi.fn();
    const measureViewport = vi
      .fn<() => { cols: number; rows: number } | null>()
      .mockReturnValue({ cols: 132, rows: 41 });

    const didSync = syncXtermViewportToSession({
      fitViewport,
      measureViewport,
      resizeSession,
      runtimeState: 'live',
      sessionId: 'session-1',
    });

    expect(didSync).toBe(true);
    expect(fitViewport).toHaveBeenCalledTimes(1);
    expect(measureViewport).toHaveBeenCalledTimes(1);
    expect(resizeSession).toHaveBeenCalledWith('session-1', {
      cols: 132,
      rows: 41,
    });
  });

  it('fits the local viewport but skips backend resize when the session is not live', () => {
    const resizeSession = vi.fn();
    const fitViewport = vi.fn();
    const measureViewport = vi.fn<() => { cols: number; rows: number } | null>();

    const didSync = syncXtermViewportToSession({
      fitViewport,
      measureViewport,
      resizeSession,
      runtimeState: 'dead',
      sessionId: 'session-1',
    });

    expect(didSync).toBe(false);
    expect(fitViewport).toHaveBeenCalledTimes(1);
    expect(measureViewport).not.toHaveBeenCalled();
    expect(resizeSession).not.toHaveBeenCalled();
  });

  it('fits the local viewport but skips backend resize before a session id is available', () => {
    const resizeSession = vi.fn();
    const fitViewport = vi.fn();
    const measureViewport = vi.fn<() => { cols: number; rows: number } | null>();

    const didSync = syncXtermViewportToSession({
      fitViewport,
      measureViewport,
      resizeSession,
      runtimeState: 'live',
      sessionId: null,
    });

    expect(didSync).toBe(false);
    expect(fitViewport).toHaveBeenCalledTimes(1);
    expect(measureViewport).not.toHaveBeenCalled();
    expect(resizeSession).not.toHaveBeenCalled();
  });

  it('skips backend resize when the measured terminal size is invalid', () => {
    const resizeSession = vi.fn();
    const fitViewport = vi.fn();
    const measureViewport = vi.fn<() => { cols: number; rows: number } | null>().mockReturnValue({
      cols: 0,
      rows: 24,
    });

    const didSync = syncXtermViewportToSession({
      fitViewport,
      measureViewport,
      resizeSession,
      runtimeState: 'live',
      sessionId: 'session-1',
    });

    expect(didSync).toBe(false);
    expect(fitViewport).toHaveBeenCalledTimes(1);
    expect(measureViewport).toHaveBeenCalledTimes(1);
    expect(resizeSession).not.toHaveBeenCalled();
  });
});
