import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS, type SessionDataEvent, type SessionStateEvent } from '../../shared/types';
import { createSessionEventRouter } from '../sessionEventRouter';

function createIpcRendererMock() {
  const listeners = new Map<string, Set<(_event: unknown, payload: unknown) => void>>();

  return {
    on(channel: string, listener: (_event: unknown, payload: unknown) => void) {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
    },
    off(channel: string, listener: (_event: unknown, payload: unknown) => void) {
      const channelListeners = listeners.get(channel);
      if (!channelListeners) {
        return;
      }
      channelListeners.delete(listener);
      if (channelListeners.size === 0) {
        listeners.delete(channel);
      }
    },
    emit(channel: string, payload: unknown) {
      const channelListeners = listeners.get(channel);
      if (!channelListeners) {
        return;
      }
      for (const listener of channelListeners) {
        listener(undefined, payload);
      }
    },
    listenerCount(channel: string) {
      return listeners.get(channel)?.size ?? 0;
    },
  };
}

describe('sessionEventRouter', () => {
  it('dispatches matching session events without duplicating ipc listeners', () => {
    const ipcRenderer = createIpcRendererMock();
    const router = createSessionEventRouter(ipcRenderer);
    const onAlpha = vi.fn();
    const onBeta = vi.fn();
    const onAny = vi.fn();

    const cleanupAlpha = router.onDataForSession('alpha', onAlpha);
    const cleanupBeta = router.onDataForSession('beta', onBeta);
    const cleanupAny = router.onData(onAny);

    expect(ipcRenderer.listenerCount(IPC_CHANNELS.SESSION_DATA)).toBe(1);

    const alphaEvent: SessionDataEvent = { sessionId: 'alpha', data: 'alpha-data' };
    ipcRenderer.emit(IPC_CHANNELS.SESSION_DATA, alphaEvent);

    expect(onAlpha).toHaveBeenCalledWith(alphaEvent);
    expect(onBeta).not.toHaveBeenCalled();
    expect(onAny).toHaveBeenCalledWith(alphaEvent);

    cleanupAlpha();
    cleanupBeta();
    cleanupAny();

    expect(ipcRenderer.listenerCount(IPC_CHANNELS.SESSION_DATA)).toBe(0);
  });

  it('supports grouped session subscriptions across data, exit, and state', () => {
    const ipcRenderer = createIpcRendererMock();
    const router = createSessionEventRouter(ipcRenderer);
    const onData = vi.fn();
    const onExit = vi.fn();
    const onState = vi.fn();

    const cleanup = router.subscribe('session-1', {
      onData,
      onExit,
      onState,
    });

    ipcRenderer.emit(IPC_CHANNELS.SESSION_DATA, {
      sessionId: 'session-1',
      data: 'payload',
    } satisfies SessionDataEvent);
    ipcRenderer.emit(IPC_CHANNELS.SESSION_STATE, {
      sessionId: 'session-1',
      state: 'reconnecting',
    } satisfies SessionStateEvent);
    ipcRenderer.emit(IPC_CHANNELS.SESSION_EXIT, {
      sessionId: 'session-1',
      exitCode: 1,
    });

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledTimes(1);

    cleanup();

    expect(ipcRenderer.listenerCount(IPC_CHANNELS.SESSION_DATA)).toBe(0);
    expect(ipcRenderer.listenerCount(IPC_CHANNELS.SESSION_EXIT)).toBe(0);
    expect(ipcRenderer.listenerCount(IPC_CHANNELS.SESSION_STATE)).toBe(0);
  });
});
