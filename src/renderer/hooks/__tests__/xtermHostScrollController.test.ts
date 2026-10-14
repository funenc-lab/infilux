import type { TmuxScrollClientResult } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import { XtermHostScrollController } from '../xtermHostScrollController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('XtermHostScrollController', () => {
  it('serializes history requests and cancels queued scrolling before input', async () => {
    const first = deferred<TmuxScrollClientResult>();
    const operations: string[] = [];
    const controller = new XtermHostScrollController({
      scroll: async (direction) => {
        operations.push(direction);
        return direction === 'up' ? first.promise : { applied: true, inMode: false };
      },
      onStateChange: vi.fn(),
    });
    const up = controller.scroll('up', 4);
    await Promise.resolve();
    const stale = controller.scroll('up', 8);
    const input = controller.returnToLive(() => {
      operations.push('input');
    });
    expect(operations).toEqual(['up']);
    first.resolve({ applied: true, inMode: true });
    await Promise.all([up, stale, input]);
    expect(operations).toEqual(['up', 'bottom', 'input']);
    expect(controller.inMode).toBe(false);
  });

  it('delivers ordinary input synchronously when no host scroll is pending', async () => {
    const scroll = vi.fn();
    const write = vi.fn();
    const controller = new XtermHostScrollController({ scroll, onStateChange: vi.fn() });
    const input = controller.returnToLive(write);
    expect(write).toHaveBeenCalledOnce();
    await input;
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not send input when copy mode exit cannot be confirmed, and supports retry', async () => {
    const scroll = vi
      .fn()
      .mockResolvedValueOnce({ applied: true, inMode: true })
      .mockResolvedValueOnce({ applied: false })
      .mockResolvedValueOnce({ applied: true, inMode: false });
    const write = vi.fn();
    const controller = new XtermHostScrollController({ scroll, onStateChange: vi.fn() });
    await controller.scroll('up', 4);
    await expect(controller.returnToLive(write)).rejects.toThrow('copy mode exit');
    expect(write).not.toHaveBeenCalled();
    await controller.returnToLive(write);
    expect(write).toHaveBeenCalledOnce();
  });

  it('exits uncertain copy mode after a failed scroll transport', async () => {
    const scroll = vi
      .fn()
      .mockRejectedValueOnce(new Error('Transport disconnected'))
      .mockResolvedValueOnce({ applied: true, inMode: false });
    const controller = new XtermHostScrollController({ scroll, onStateChange: vi.fn() });
    await expect(controller.scroll('up', 4)).rejects.toThrow('Transport');
    await controller.returnToLive();
    expect(scroll).toHaveBeenLastCalledWith('bottom');
  });

  it('rechecks copy mode before input after a failed recovery cancellation', async () => {
    const scroll = vi
      .fn()
      .mockResolvedValueOnce({ applied: false })
      .mockResolvedValueOnce({ applied: true, inMode: false });
    const write = vi.fn();
    const controller = new XtermHostScrollController({ scroll, onStateChange: vi.fn() });
    await expect(controller.returnToLive(undefined, true)).rejects.toThrow('copy mode exit');
    await controller.returnToLive(write);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledOnce();
  });

  it('cleans up in-flight copy mode without delivering input to a disposed binding', async () => {
    const first = deferred<TmuxScrollClientResult>();
    const scroll = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ applied: true, inMode: false });
    const write = vi.fn();
    const onStateChange = vi.fn();
    const controller = new XtermHostScrollController({ scroll, onStateChange });
    const up = controller.scroll('up', 4);
    await Promise.resolve();
    const input = controller.returnToLive(write);
    const cleanup = controller.dispose();
    first.resolve({ applied: true, inMode: true });
    await Promise.all([up, input, cleanup]);
    expect(write).not.toHaveBeenCalled();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenLastCalledWith('bottom');
  });
});
