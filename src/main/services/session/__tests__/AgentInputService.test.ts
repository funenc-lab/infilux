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

  it('writes plain text without submitting when submit is omitted', () => {
    service.dispatch({
      sessionId: 'session-1',
      text: '@/tmp/diagram.png',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', '@/tmp/diagram.png');
    expect(getSessionDescriptor).toHaveBeenCalledWith('session-1');
  });

  it('uses native terminal paste semantics for native-input agent sessions', () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'claude-hapi',
        agentCommand: 'claude',
        environment: 'hapi',
      })
    );

    service.dispatch({
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

    vi.advanceTimersByTime(149);
    expect(write).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(2, 'session-1', '\r');
  });

  it('falls back to raw multiline writes for non-native providers', () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'cursor',
        agentCommand: 'cursor-agent',
        environment: 'native',
      })
    );

    service.dispatch({
      sessionId: 'session-1',
      text: 'Review this\nThen continue',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', 'Review this\nThen continue');
  });

  it('uses the request agent hint when live session metadata is unavailable', () => {
    service.dispatch({
      sessionId: 'session-1',
      agentId: 'codex',
      text: 'Review this\nThen continue',
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('session-1', '\x1b[200~Review this\nThen continue\x1b[201~');
  });

  it('submits immediately when submit delay is not positive', () => {
    getSessionDescriptor.mockReturnValueOnce(
      makeSessionDescriptor({
        agentId: 'codex',
        agentCommand: 'codex',
        environment: 'native',
      })
    );

    service.dispatch({
      sessionId: 'session-1',
      text: 'Summarize changes',
      submit: true,
      submitDelayMs: -1,
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, 'session-1', 'Summarize changes');
    expect(write).toHaveBeenNthCalledWith(2, 'session-1', '\r');
  });

  it('ignores empty text payloads', () => {
    service.dispatch({
      sessionId: 'session-1',
      text: '',
      submit: true,
      submitDelayMs: 100,
    });

    vi.runAllTimers();
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects missing session ids', () => {
    expect(() =>
      service.dispatch({
        sessionId: '',
        text: 'hello',
      })
    ).toThrow('session id');
  });
});
