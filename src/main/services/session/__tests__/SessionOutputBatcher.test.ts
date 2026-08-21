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
      deliveredBatchCount: 2,
      deliveredCharCount: 8,
      resyncCount: 0,
      maxPendingCharCount: 8,
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
      deliveredBatchCount: 0,
      deliveredCharCount: 0,
      resyncCount: 1,
      maxPendingCharCount: 6,
    });

    batcher.discard(1, 'agent-1');
    batcher.enqueue(1, 'agent-1', 'next');
    vi.advanceTimersByTime(10);

    expect(deliver).toHaveBeenCalledWith(1, 'agent-1', 'next');
  });

  it('requests a fresh resync after output arrives before the current resync is acknowledged', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const requestResync = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver,
      requestResync,
      delayMs: 10,
      maxChars: 4,
      maxPendingChars: 16,
    });

    batcher.requestResync(1, 'agent-1');
    batcher.enqueue(1, 'agent-1', 'arrived while restoring');
    batcher.acknowledgeResync(1, 'agent-1');

    expect(requestResync.mock.calls).toEqual([
      [1, 'agent-1'],
      [1, 'agent-1'],
    ]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('requests a fresh resync when an upstream snapshot supersedes a pending snapshot', () => {
    const requestResync = vi.fn();
    const batcher = new SessionOutputBatcher({
      deliver: vi.fn(),
      requestResync,
    });

    batcher.requestResync(1, 'agent-1');
    batcher.requestResync(1, 'agent-1');
    batcher.acknowledgeResync(1, 'agent-1');

    expect(requestResync.mock.calls).toEqual([
      [1, 'agent-1'],
      [1, 'agent-1'],
    ]);
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

  it('reports bounded high-volume delivery metrics without retaining drained output', () => {
    vi.useFakeTimers();
    const deliveredBySessionId = new Map<string, string>();
    const batcher = new SessionOutputBatcher({
      deliver: (_windowId, sessionId, data) => {
        deliveredBySessionId.set(sessionId, `${deliveredBySessionId.get(sessionId) ?? ''}${data}`);
      },
      delayMs: 1,
    });
    const expectedBySessionId = new Map<string, string>();

    for (let round = 0; round < 32; round += 1) {
      for (let agentIndex = 0; agentIndex < 8; agentIndex += 1) {
        const sessionId = `agent-${agentIndex}`;
        const output = `${sessionId}:${round}:${'x'.repeat(4 * 1024)}`;
        expectedBySessionId.set(sessionId, `${expectedBySessionId.get(sessionId) ?? ''}${output}`);
        batcher.enqueue(1, sessionId, output);
      }
    }

    const expectedCharCount = [...expectedBySessionId.values()].reduce(
      (total, output) => total + output.length,
      0
    );
    expect(batcher.getDiagnostics()).toMatchObject({
      pendingBatchCount: 8,
      pendingCharCount: expectedCharCount,
      deliveredBatchCount: 0,
      deliveredCharCount: 0,
      resyncCount: 0,
      resyncSessionCount: 0,
      maxPendingCharCount: expectedCharCount,
    });

    vi.runAllTimers();

    expect(deliveredBySessionId).toEqual(expectedBySessionId);
    expect(batcher.getDiagnostics()).toMatchObject({
      pendingBatchCount: 0,
      pendingCharCount: 0,
      deliveredCharCount: expectedCharCount,
      resyncCount: 0,
      resyncSessionCount: 0,
      maxPendingCharCount: expectedCharCount,
    });
    expect(batcher.getDiagnostics().deliveredBatchCount).toBeGreaterThan(8);
  });

  it('retains cumulative resync metrics after an overloaded queue is acknowledged', () => {
    const batcher = new SessionOutputBatcher({
      deliver: vi.fn(),
      requestResync: vi.fn(),
      maxChars: 4,
      maxPendingChars: 6,
    });

    batcher.enqueue(1, 'agent-1', 'abcdef');
    batcher.enqueue(1, 'agent-1', 'g');
    batcher.acknowledgeResync(1, 'agent-1');

    expect(batcher.getDiagnostics()).toMatchObject({
      pendingBatchCount: 0,
      pendingCharCount: 0,
      resyncCount: 1,
      resyncSessionCount: 0,
      maxPendingCharCount: 6,
    });
  });
});
