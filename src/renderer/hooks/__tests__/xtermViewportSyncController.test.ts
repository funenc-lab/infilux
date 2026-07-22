import { describe, expect, it, vi } from 'vitest';
import { createXtermViewportSyncController } from '../xtermViewportSyncController';

describe('createXtermViewportSyncController', () => {
  it('defers a viewport sync until the terminal write completes', () => {
    let isWriting = true;
    const syncViewport = vi.fn(() => true);
    const controller = createXtermViewportSyncController({
      isTerminalWriteInProgress: () => isWriting,
      syncViewport,
    });

    expect(controller.request()).toBe(false);
    expect(syncViewport).not.toHaveBeenCalled();

    isWriting = false;

    expect(controller.flush()).toBe(true);
    expect(syncViewport).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated viewport requests made while terminal output is pending', () => {
    let isWriting = true;
    const syncViewport = vi.fn(() => true);
    const controller = createXtermViewportSyncController({
      isTerminalWriteInProgress: () => isWriting,
      syncViewport,
    });

    controller.request();
    controller.request();
    controller.request();

    isWriting = false;
    controller.flush();

    expect(syncViewport).toHaveBeenCalledTimes(1);
    expect(controller.flush()).toBe(false);
  });

  it('does not retain a deferred viewport sync after reset', () => {
    const syncViewport = vi.fn(() => true);
    const controller = createXtermViewportSyncController({
      isTerminalWriteInProgress: () => true,
      syncViewport,
    });

    controller.request();
    controller.reset();

    expect(controller.flush()).toBe(false);
    expect(syncViewport).not.toHaveBeenCalled();
  });
});
