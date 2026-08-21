/* @vitest-environment jsdom */

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSessionActivityScheduler, useAgentSessionActivity } from '../useAgentSessionActivity';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class VisibilityDocument {
  hidden = false;
  private readonly listeners = new Set<() => void>();

  addEventListener(_event: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_event: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function createScheduler(document: VisibilityDocument, getActivity = vi.fn(async () => false)) {
  return {
    getActivity,
    scheduler: new AgentSessionActivityScheduler({
      clearTimeout,
      document: document as never,
      getActivity,
      now: () => Date.now(),
      setTimeout,
    }),
  };
}

function ActivityHarness({
  scheduler,
  sessionId,
}: {
  scheduler: AgentSessionActivityScheduler;
  sessionId?: string;
}) {
  const activity = useAgentSessionActivity({
    isActive: true,
    isVisible: true,
    scheduler,
    sessionId,
  });

  useEffect(() => {
    activity.startMonitoring();
  }, [activity]);

  return null;
}

describe('AgentSessionActivityScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses activity requests while the renderer document is hidden and restores them on visibilitychange', async () => {
    const document = new VisibilityDocument();
    document.hidden = true;
    const { getActivity, scheduler } = createScheduler(document);
    const observation = scheduler.observe({
      isActive: true,
      isVisible: true,
      sessionId: 'session-a',
    });
    observation.startMonitoring();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getActivity).not.toHaveBeenCalled();

    document.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(getActivity).toHaveBeenCalledWith('session-a');

    observation.dispose();
  });

  it('prioritizes active visible sessions ahead of background visible sessions', async () => {
    const document = new VisibilityDocument();
    const { getActivity, scheduler } = createScheduler(document);
    const background = scheduler.observe({
      isActive: false,
      isVisible: true,
      sessionId: 'background',
    });
    const active = scheduler.observe({
      isActive: true,
      isVisible: true,
      sessionId: 'active',
    });
    background.startMonitoring();
    active.startMonitoring();

    await vi.advanceTimersByTimeAsync(0);
    expect(getActivity).toHaveBeenCalledTimes(1);
    expect(getActivity).toHaveBeenCalledWith('active');

    background.dispose();
    active.dispose();
  });

  it('defers polling until visible output becomes stale and refreshes observers immediately', async () => {
    const document = new VisibilityDocument();
    const { getActivity, scheduler } = createScheduler(document);
    const onOutput = vi.fn();
    const observation = scheduler.observe({
      isActive: true,
      isVisible: true,
      onOutput,
      sessionId: 'session-a',
    });
    observation.startMonitoring();
    observation.recordOutput();

    expect(onOutput).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(getActivity).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(getActivity).toHaveBeenCalledWith('session-a');

    observation.dispose();
  });

  it('coalesces sustained visible output without rearming a timer for every event', async () => {
    const document = new VisibilityDocument();
    const getActivity = vi.fn(async () => false);
    const setTimeout = vi.fn((callback: () => void, delay: number) =>
      globalThis.setTimeout(callback, delay)
    );
    const clearTimeout = vi.fn((timer: number | ReturnType<typeof globalThis.setTimeout>) => {
      globalThis.clearTimeout(timer);
    });
    const scheduler = new AgentSessionActivityScheduler({
      clearTimeout,
      document,
      getActivity,
      now: () => Date.now(),
      setTimeout,
    });
    const observation = scheduler.observe({
      isActive: true,
      isVisible: true,
      sessionId: 'session-a',
    });
    observation.startMonitoring();

    for (let index = 0; index < 100; index += 1) {
      observation.recordOutput();
    }

    expect(setTimeout).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(getActivity).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(getActivity).toHaveBeenCalledWith('session-a');

    observation.dispose();
  });

  it('does not force an incompatible receiver on injected timer functions', () => {
    const document = new VisibilityDocument();
    const timer = {} as number | ReturnType<typeof globalThis.setTimeout>;
    const setTimeout = vi.fn(function (this: unknown, _callback: () => void, _delay: number) {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation');
      }
      return timer;
    });
    const clearTimeout = vi.fn(function (
      this: unknown,
      _timer: number | ReturnType<typeof globalThis.setTimeout>
    ) {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation');
      }
    });
    const scheduler = new AgentSessionActivityScheduler({
      clearTimeout,
      document,
      getActivity: async () => false,
      setTimeout,
    });
    const observation = scheduler.observe({
      isActive: true,
      isVisible: true,
      sessionId: 'session-a',
    });

    expect(() => observation.startMonitoring()).not.toThrow();
    expect(() => observation.dispose()).not.toThrow();
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(clearTimeout).toHaveBeenCalledWith(timer);
  });

  it('uses the global receiver for default renderer timers during disposal', () => {
    const document = new VisibilityDocument();
    const timer = {} as NodeJS.Timeout;
    const calls: string[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (
      this: unknown,
      _callback: () => void,
      _delay?: number
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      calls.push('set');
      return timer;
    });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(function (
      this: unknown,
      _timer?: string | number | ReturnType<typeof globalThis.setTimeout>
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      calls.push('clear');
    });

    const scheduler = new AgentSessionActivityScheduler({
      document,
      getActivity: async () => false,
    });
    const observation = scheduler.observe({
      isActive: true,
      isVisible: true,
      sessionId: 'session-a',
    });

    expect(() => observation.startMonitoring()).not.toThrow();
    expect(() => observation.dispose()).not.toThrow();
    expect(calls).toEqual(['set', 'clear']);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('cleans up hook registrations on unmount', async () => {
    const visibilityDocument = new VisibilityDocument();
    const { getActivity, scheduler } = createScheduler(visibilityDocument);
    const container = globalThis.document.createElement('div');
    globalThis.document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ActivityHarness, { scheduler, sessionId: 'session-a' }));
    });
    await act(async () => {
      root.unmount();
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getActivity).not.toHaveBeenCalled();
    container.remove();
  });
});
