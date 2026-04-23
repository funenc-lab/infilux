import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('electronNotification', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete (globalThis as { window?: Window }).window;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns noop cleanup functions when the renderer notification API is unavailable', async () => {
    const {
      onNotificationClick,
      onAgentStopNotification,
      onAskUserQuestionNotification,
      onPreToolUseNotification,
      onAgentStatusUpdateNotification,
    } = await import('../electronNotification');

    const cleanups = [
      onNotificationClick(() => undefined),
      onAgentStopNotification(() => undefined),
      onAskUserQuestionNotification(() => undefined),
      onPreToolUseNotification(() => undefined),
      onAgentStatusUpdateNotification(() => undefined),
    ];

    for (const cleanup of cleanups) {
      expect(cleanup).toBeTypeOf('function');
      expect(() => cleanup()).not.toThrow();
    }
  });

  it('returns noop cleanup functions when window exists without a notification bridge', async () => {
    (globalThis as { window?: object }).window = {
      electronAPI: {},
    };

    const { onNotificationClick } = await import('../electronNotification');

    const cleanup = onNotificationClick(() => undefined);

    expect(cleanup).toBeTypeOf('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('subscribes through the renderer notification bridge and falls back to noop when a handler is missing', async () => {
    const onClick = vi.fn(() => vi.fn());
    const onAgentStop = vi.fn(() => vi.fn());
    const onAskUserQuestion = vi.fn(() => vi.fn());
    const onPreToolUse = vi.fn(() => vi.fn());
    const onAgentStatusUpdate = vi.fn(() => vi.fn());

    (globalThis as { window?: object }).window = {
      electronAPI: {
        notification: {
          onClick,
          onAgentStop,
          onAskUserQuestion,
          onPreToolUse,
          onAgentStatusUpdate,
        },
      },
    };

    const {
      onNotificationClick,
      onAgentStopNotification,
      onAskUserQuestionNotification,
      onPreToolUseNotification,
      onAgentStatusUpdateNotification,
    } = await import('../electronNotification');

    const clickCleanup = onNotificationClick(() => undefined);
    const stopCleanup = onAgentStopNotification(() => undefined);
    const askCleanup = onAskUserQuestionNotification(() => undefined);
    const preToolCleanup = onPreToolUseNotification(() => undefined);
    const statusCleanup = onAgentStatusUpdateNotification(() => undefined);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onAgentStop).toHaveBeenCalledTimes(1);
    expect(onAskUserQuestion).toHaveBeenCalledTimes(1);
    expect(onPreToolUse).toHaveBeenCalledTimes(1);
    expect(onAgentStatusUpdate).toHaveBeenCalledTimes(1);
    expect(preToolCleanup).toBeTypeOf('function');

    expect(() => {
      clickCleanup();
      stopCleanup();
      askCleanup();
      preToolCleanup();
      statusCleanup();
    }).not.toThrow();
  });

  it('returns noop cleanups when the notification bridge exists without handlers or cleanups', async () => {
    const onClick = vi.fn(() => undefined);
    (globalThis as { window?: object }).window = {
      electronAPI: {
        notification: {
          onClick,
        },
      },
    };

    const { onNotificationClick, showRendererNotification } = await import(
      '../electronNotification'
    );

    const cleanup = onNotificationClick(() => undefined);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(() => cleanup()).not.toThrow();
    await expect(
      showRendererNotification({
        title: 'No show handler',
      })
    ).resolves.toBeUndefined();
  });

  it('shows renderer notifications only when a show handler is available', async () => {
    const { showRendererNotification } = await import('../electronNotification');

    await expect(
      showRendererNotification({
        title: 'Skipped notification',
      })
    ).resolves.toBeUndefined();

    const show = vi.fn(async () => undefined);
    (globalThis as { window?: object }).window = {
      electronAPI: {
        notification: {
          show,
        },
      },
    };

    await showRendererNotification({
      title: 'Review complete',
      body: 'Ready to inspect',
      silent: true,
      sessionId: 'session-1',
    });

    expect(show).toHaveBeenCalledWith({
      title: 'Review complete',
      body: 'Ready to inspect',
      silent: true,
      sessionId: 'session-1',
    });
  });
});
