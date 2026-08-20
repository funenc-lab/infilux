import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionOutputBatcher } from '../SessionOutputBatcher';

describe('SessionOutputBatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drains output in bounded batches without delivering synchronously', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver,
      delayMs: 10,
      maxChars: 4,
      maxPendingChars: 16,
    });

    batcher.enqueue(1, 'agent-1', 'abcdefgh');

    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
    expect(deliver).toHaveBeenLastCalledWith(1, 'agent-1', 'abcd');

    vi.advanceTimersByTime(10);
    expect(deliver).toHaveBeenLastCalledWith(1, 'agent-1', 'efgh');
    expect(batcher.getDiagnostics()).toEqual({
      pendingBatchCount: 0,
      pendingCharCount: 0,
      resyncSessionCount: 0,
    });
  });

  it('drops a saturated window-session queue and requests one archive resync', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const requestResync = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver,
      requestResync,
      delayMs: 10,
      maxChars: 4,
      maxPendingChars: 6,
    });

    batcher.enqueue(1, 'agent-1', 'abcdef');
    batcher.enqueue(1, 'agent-1', 'g');
    batcher.enqueue(1, 'agent-1', 'h');

    expect(deliver).not.toHaveBeenCalled();
    expect(requestResync).toHaveBeenCalledTimes(1);
    expect(requestResync).toHaveBeenCalledWith(1, 'agent-1');
    expect(batcher.getDiagnostics()).toEqual({
      pendingBatchCount: 0,
      pendingCharCount: 0,
      resyncSessionCount: 1,
    });

    batcher.discard(1, 'agent-1');
    batcher.enqueue(1, 'agent-1', 'next');
    vi.advanceTimersByTime(10);

    expect(deliver).toHaveBeenCalledWith(1, 'agent-1', 'next');
  });

  it('round-robins a bounded window budget across busy sessions', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver,
      delayMs: 10,
      maxChars: 4,
      maxPendingChars: 16,
      maxWindowChars: 4,
    });

    batcher.enqueue(1, 'agent-a', 'abcdefgh');
    batcher.enqueue(1, 'agent-b', 'ijkl');

    vi.advanceTimersByTime(10);
    expect(deliver).toHaveBeenLastCalledWith(1, 'agent-a', 'abcd');

    vi.advanceTimersByTime(10);
    expect(deliver).toHaveBeenLastCalledWith(1, 'agent-b', 'ijkl');

    vi.advanceTimersByTime(10);
    expect(deliver).toHaveBeenLastCalledWith(1, 'agent-a', 'efgh');
  });

  it('drains all pending output for a session before its exit is emitted', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver,
      delayMs: 10,
      maxChars: 4,
      maxPendingChars: 16,
    });

    batcher.enqueue(1, 'agent-1', 'abcdefgh');
    batcher.flushSession('agent-1', [1]);

    expect(deliver.mock.calls).toEqual([
      [1, 'agent-1', 'abcd'],
      [1, 'agent-1', 'efgh'],
    ]);
  });
});
