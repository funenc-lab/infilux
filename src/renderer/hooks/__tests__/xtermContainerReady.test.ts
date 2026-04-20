/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { isXtermContainerReady, scheduleXtermContainerReady } from '../xtermContainerReady';

function setContainerRect(element: HTMLElement, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('xtermContainerReady', () => {
  it('treats detached containers as not ready even when they have a measurable size', () => {
    const container = document.createElement('div');
    setContainerRect(container, 640, 480);

    expect(isXtermContainerReady(container)).toBe(false);
  });

  it('treats connected zero-sized containers as not ready', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    setContainerRect(container, 0, 0);

    expect(isXtermContainerReady(container)).toBe(false);

    container.remove();
  });

  it('waits until the container becomes connected and non-zero before firing', () => {
    const scheduledFrames: Array<{ id: number; callback: FrameRequestCallback }> = [];
    const runFrame = () => {
      const frame = scheduledFrames.shift();
      if (!frame) {
        throw new Error('Expected a scheduled animation frame');
      }
      frame.callback(performance.now());
    };
    const onReady = vi.fn();
    const container = document.createElement('div');
    setContainerRect(container, 640, 480);

    scheduleXtermContainerReady({
      container,
      onReady,
      requestAnimationFrame: (callback) => {
        const id = scheduledFrames.length + 1;
        scheduledFrames.push({ id, callback });
        return id;
      },
      cancelAnimationFrame: vi.fn(),
    });

    expect(onReady).not.toHaveBeenCalled();
    expect(scheduledFrames).toHaveLength(1);

    runFrame();
    expect(onReady).not.toHaveBeenCalled();
    expect(scheduledFrames).toHaveLength(1);

    document.body.appendChild(container);
    runFrame();

    expect(onReady).toHaveBeenCalledTimes(1);

    container.remove();
  });

  it('cancels pending checks when cleanup runs', () => {
    const scheduledFrames: Array<{ id: number; callback: FrameRequestCallback }> = [];
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      const index = scheduledFrames.findIndex((frame) => frame.id === frameId);
      if (index >= 0) {
        scheduledFrames.splice(index, 1);
      }
    });
    const container = document.createElement('div');
    setContainerRect(container, 640, 480);

    const cleanup = scheduleXtermContainerReady({
      container,
      onReady: vi.fn(),
      requestAnimationFrame: (callback) => {
        const id = scheduledFrames.length + 1;
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
