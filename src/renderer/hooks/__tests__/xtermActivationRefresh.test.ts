import { describe, expect, it, vi } from 'vitest';
import { scheduleXtermActivationRefresh } from '../xtermActivationRefresh';

describe('xtermActivationRefresh', () => {
  it('runs fit, refresh, and focus after the activation frame settles', () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    const runFrame = () => {
      const callback = scheduledFrames.shift();
      if (!callback) {
        throw new Error('Expected a scheduled animation frame');
      }
      callback(performance.now());
    };

    const fitViewport = vi.fn();
    const refresh = vi.fn();
    const focus = vi.fn();

    scheduleXtermActivationRefresh({
      fitViewport,
      refresh,
      focus,
      requestAnimationFrame: (callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      },
      cancelAnimationFrame: vi.fn(),
    });

    expect(fitViewport).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();

    runFrame();
    expect(fitViewport).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();

    runFrame();
    expect(fitViewport).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(refresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      fitViewport.mock.invocationCallOrder[0]
    );
    expect(focus.mock.invocationCallOrder[0]).toBeGreaterThan(refresh.mock.invocationCallOrder[0]);
  });

  it('cancels any pending activation refresh frames during cleanup', () => {
    const scheduledFrames: Array<{ id: number; callback: FrameRequestCallback }> = [];
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      const index = scheduledFrames.findIndex((frame) => frame.id === frameId);
      if (index >= 0) {
        scheduledFrames.splice(index, 1);
      }
    });
    let nextId = 1;

    const cleanup = scheduleXtermActivationRefresh({
      fitViewport: vi.fn(),
      refresh: vi.fn(),
      focus: vi.fn(),
      requestAnimationFrame: (callback) => {
        const id = nextId++;
        scheduledFrames.push({ id, callback });
        return id;
      },
      cancelAnimationFrame,
    });

    expect(scheduledFrames).toHaveLength(1);
    cleanup();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(scheduledFrames).toHaveLength(0);
  });
});
