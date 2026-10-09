import type { SessionDescriptor } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentInputService } from '../AgentInputService';

function makeSessionDescriptor(metadata?: Record<string, unknown>): SessionDescriptor {
  return {
    sessionId: 'session-1',
    backend: 'local',
    kind: 'agent',
    cwd: '/repo',
    persistOnDisconnect: true,
    createdAt: 1,
    metadata,
  };
}

describe('AgentInputService', () => {
  const write = vi.fn();
  const getSessionDescriptor = vi.fn();
  let service: AgentInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    write.mockReset();
    getSessionDescriptor.mockReset();
    getSessionDescriptor.mockReturnValue(null);
    service = new AgentInputService({ write }, { getSessionDescriptor });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('writes plain text without submitting when submit is omitted', async () => {
    await service.dispatch({
      sessionId: 'session-1',
      text: '@/tmp/diagram.png',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', '@/tmp/diagram.png');
    expect(getSessionDescriptor).toHaveBeenCalledWith('session-1');
  });

  it('uses native terminal paste semantics for native-input agent sessions', async () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'claude-hapi',
        agentCommand: 'claude',
        environment: 'hapi',
      })
    );

    const dispatch = service.dispatch({
      sessionId: 'session-1',
      text: 'Review this\nThen continue',
      submit: true,
      submitDelayMs: 150,
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenNthCalledWith(
      1,
      'session-1',
      '\x1b[200~Review this\nThen continue\x1b[201~'
    );

    await vi.advanceTimersByTimeAsync(149);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await dispatch;
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(2, 'session-1', '\r');
  });

  it('falls back to raw multiline writes for non-native providers', async () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'cursor',
        agentCommand: 'cursor-agent',
        environment: 'native',
      })
    );

    await service.dispatch({
      sessionId: 'session-1',
      text: 'Review this\nThen continue',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', 'Review this\nThen continue');
  });

  it('uses the request agent hint when live session metadata is unavailable', async () => {
    await service.dispatch({
      sessionId: 'session-1',
      agentId: 'codex',
      text: 'Review this\nThen continue',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', '\x1b[200~Review this\nThen continue\x1b[201~');
  });

  it('submits immediately when submit delay is not positive', async () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'codex',
        agentCommand: 'codex',
        environment: 'native',
      })
    );

    await service.dispatch({
      sessionId: 'session-1',
      text: 'Summarize changes',
      submit: true,
      submitDelayMs: -1,
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, 'session-1', 'Summarize changes');
    expect(write).toHaveBeenNthCalledWith(2, 'session-1', '\r');
  });

  it('ignores empty text payloads', async () => {
    await service.dispatch({
      sessionId: 'session-1',
      text: '',
      submit: true,
      submitDelayMs: 100,
    });

    vi.runAllTimers();
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects missing session ids', async () => {
    await expect(
      service.dispatch({
        sessionId: '',
        text: 'hello',
      })
    ).rejects.toThrow('session id');
  });

  it('does not submit before an asynchronous text write is accepted', async () => {
    let accept: (() => void) | undefined;
    write.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        accept = resolve;
      })
    );
    const dispatch = service.dispatch({ sessionId: 'session-1', text: 'hello', submit: true });
    expect(write.mock.calls).toEqual([['session-1', 'hello']]);
    accept?.();
    await dispatch;
    expect(write.mock.calls).toEqual([
      ['session-1', 'hello'],
      ['session-1', '\r'],
    ]);
  });

  it('does not submit or retry after asynchronous text write failure', async () => {
    const failure = Promise.reject(new Error('text rejected'));
    void failure.catch(() => undefined);
    write.mockReturnValueOnce(failure);
    await expect(
      service.dispatch({ sessionId: 'session-1', text: 'hello', submit: true })
    ).rejects.toThrow('text rejected');
    await vi.runAllTimersAsync();
    expect(write.mock.calls).toEqual([['session-1', 'hello']]);
  });

  it('returns delayed submit failure rather than reporting early success', async () => {
    const failure = Promise.reject(new Error('submit rejected'));
    void failure.catch(() => undefined);
    write.mockReturnValueOnce(undefined).mockReturnValueOnce(failure);
    const dispatch = service.dispatch({
      sessionId: 'session-1',
      text: 'hello',
      submit: true,
      submitDelayMs: 100,
    });
    const rejection = expect(dispatch).rejects.toThrow('submit rejected');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(write.mock.calls).toEqual([
      ['session-1', 'hello'],
      ['session-1', '\r'],
    ]);
  });

  it('serializes concurrent text and submit transactions for the same session', async () => {
    let acceptFirst: (() => void) | undefined;
    write.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        acceptFirst = resolve;
      })
    );
    const first = service.dispatch({ sessionId: 'session-1', text: 'first', submit: true });
    const second = service.dispatch({ sessionId: 'session-1', text: 'second', submit: true });
    const callsBeforeAcceptance = [...write.mock.calls];
    acceptFirst?.();
    await Promise.all([first, second]);

    expect(callsBeforeAcceptance).toEqual([['session-1', 'first']]);
    expect(write.mock.calls).toEqual([
      ['session-1', 'first'],
      ['session-1', '\r'],
      ['session-1', 'second'],
      ['session-1', '\r'],
    ]);
  });

  it('keeps delayed submission inside the same-session transaction', async () => {
    const first = service.dispatch({
      sessionId: 'session-1',
      text: 'first',
      submit: true,
      submitDelayMs: 100,
    });
    const second = service.dispatch({ sessionId: 'session-1', text: 'second', submit: true });
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);

    expect(write.mock.calls).toEqual([
      ['session-1', 'first'],
      ['session-1', '\r'],
      ['session-1', 'second'],
      ['session-1', '\r'],
    ]);
  });

  it('allows another session to submit while the first session waits for acceptance', async () => {
    let acceptFirst: (() => void) | undefined;
    write.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        acceptFirst = resolve;
      })
    );
    const first = service.dispatch({ sessionId: 'session-1', text: 'first', submit: true });
    await service.dispatch({ sessionId: 'session-2', text: 'second', submit: true });
    const callsBeforeAcceptance = [...write.mock.calls];
    acceptFirst?.();
    await first;

    expect(callsBeforeAcceptance).toEqual([
      ['session-1', 'first'],
      ['session-2', 'second'],
      ['session-2', '\r'],
    ]);
  });

  it('continues queued input after failure without retrying uncertain text', async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    write.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      })
    );
    const first = service.dispatch({ sessionId: 'session-1', text: 'first', submit: true });
    const rejection = expect(first).rejects.toThrow('reply lost');
    const second = service.dispatch({ sessionId: 'session-1', text: 'second', submit: true });
    const callsBeforeFailure = [...write.mock.calls];
    rejectFirst?.(new Error('reply lost'));
    await rejection;
    await second;

    expect(callsBeforeFailure).toEqual([['session-1', 'first']]);
    expect(write.mock.calls).toEqual([
      ['session-1', 'first'],
      ['session-1', 'second'],
      ['session-1', '\r'],
    ]);
  });
});
