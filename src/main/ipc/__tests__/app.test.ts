import { IPC_CHANNELS } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const appHandlerTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const detectApps = vi.fn();
  const openPath = vi.fn();
  const getAppIcon = vi.fn();
  const getRecentProjects = vi.fn();
  const validateLocalPath = vi.fn();
  const applyProxy = vi.fn();
  const testProxy = vi.fn();
  const getResourceSnapshot = vi.fn();
  const executeResourceAction = vi.fn();

  function reset() {
    handlers.clear();
    detectApps.mockReset();
    detectApps.mockResolvedValue([{ name: 'VS Code' }]);
    openPath.mockReset();
    openPath.mockResolvedValue(undefined);
    getAppIcon.mockReset();
    getAppIcon.mockResolvedValue('icon-data');
    getRecentProjects.mockReset();
    getRecentProjects.mockResolvedValue(['/repo/a']);
    validateLocalPath.mockReset();
    validateLocalPath.mockResolvedValue({ exists: true, isDirectory: true });
    applyProxy.mockReset();
    applyProxy.mockReturnValue({ ok: true });
    testProxy.mockReset();
    testProxy.mockResolvedValue({ success: true, latency: 23 });
    getResourceSnapshot.mockReset();
    getResourceSnapshot.mockResolvedValue({
      capturedAt: 1,
      runtime: { capturedAt: 1 },
      resources: [],
    });
    executeResourceAction.mockReset();
    executeResourceAction.mockResolvedValue({
      ok: true,
      resourceId: 'session:session-1',
      kind: 'kill-session',
      message: 'done',
    });
  }

  return {
    handlers,
    detectApps,
    openPath,
    getAppIcon,
    getRecentProjects,
    validateLocalPath,
    applyProxy,
    testProxy,
    getResourceSnapshot,
    executeResourceAction,
    reset,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      appHandlerTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/app/AppDetector', () => ({
  appDetector: {
    detectApps: appHandlerTestDoubles.detectApps,
    openPath: appHandlerTestDoubles.openPath,
    getAppIcon: appHandlerTestDoubles.getAppIcon,
  },
}));

vi.mock('../../services/app/RecentProjectsService', () => ({
  getRecentProjects: appHandlerTestDoubles.getRecentProjects,
}));

vi.mock('../../services/app/PathValidator', () => ({
  validateLocalPath: appHandlerTestDoubles.validateLocalPath,
}));

vi.mock('../../services/proxy/ProxyConfig', () => ({
  applyProxy: appHandlerTestDoubles.applyProxy,
  testProxy: appHandlerTestDoubles.testProxy,
}));

vi.mock('../../services/app/AppResourceManager', () => ({
  appResourceManager: {
    getSnapshot: appHandlerTestDoubles.getResourceSnapshot,
    executeAction: appHandlerTestDoubles.executeResourceAction,
  },
}));

vi.mock('../../utils/runtimeMemory', () => ({
  buildRuntimeMemorySnapshot: vi.fn(),
}));

function getHandler(channel: string): Handler {
  const handler = appHandlerTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('app IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    appHandlerTestDoubles.reset();
  });

  it('delegates app resource snapshot and action handlers to the resource manager', async () => {
    const { registerAppHandlers } = await import('../app');
    registerAppHandlers();

    const event = {
      sender: {
        getOSProcessId: vi.fn(() => 303),
        reload: vi.fn(),
      },
    };
    const action = {
      kind: 'kill-session',
      resourceId: 'session:session-1',
      sessionId: 'session-1',
    };

    expect(await getHandler(IPC_CHANNELS.APP_GET_RESOURCE_SNAPSHOT)(event)).toEqual({
      capturedAt: 1,
      runtime: { capturedAt: 1 },
      resources: [],
    });
    expect(appHandlerTestDoubles.getResourceSnapshot).toHaveBeenCalledWith(
      event.sender,
      event.sender
    );

    expect(await getHandler(IPC_CHANNELS.APP_EXECUTE_RESOURCE_ACTION)(event, action)).toEqual({
      ok: true,
      resourceId: 'session:session-1',
      kind: 'kill-session',
      message: 'done',
    });
    expect(appHandlerTestDoubles.executeResourceAction).toHaveBeenCalledWith(action, event.sender);
  });
});
