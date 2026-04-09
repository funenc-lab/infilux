import type { SessionDescriptor } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppMetrics: vi.fn(() => []),
    getPath: vi.fn(() => '/tmp'),
  },
}));

vi.mock('../../../utils/runtimeMemory', () => ({
  buildRuntimeMemorySnapshot: vi.fn(),
}));

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: vi.fn(),
}));

vi.mock('../../session/SessionManager', () => ({
  sessionManager: {
    list: vi.fn(() => []),
    kill: vi.fn(async () => undefined),
    getSessionRuntimeInfo: vi.fn(async () => null),
    localPtyManager: {
      getProcessInfo: vi.fn(async () => null),
    },
  },
}));

vi.mock('../../hapi/HapiServerManager', () => ({
  hapiServerManager: {
    getStatus: vi.fn(() => ({ running: false })),
    stop: vi.fn(async () => ({ running: false })),
  },
}));

vi.mock('../../hapi/HapiRunnerManager', () => ({
  hapiRunnerManager: {
    getStatus: vi.fn(() => ({ running: false })),
    stop: vi.fn(async () => ({ running: false })),
  },
}));

vi.mock('../../hapi/CloudflaredManager', () => ({
  cloudflaredManager: {
    getStatus: vi.fn(() => ({ installed: false, running: false })),
    stop: vi.fn(async () => ({ installed: false, running: false })),
  },
}));

function createProcessMetric(options: {
  pid: number;
  type: string;
  workingSetSizeKb: number;
  peakWorkingSetSizeKb?: number;
  privateBytesKb?: number | null;
  name?: string | null;
  serviceName?: string | null;
}): Electron.ProcessMetric {
  return {
    pid: options.pid,
    type: options.type,
    name: options.name ?? null,
    serviceName: options.serviceName ?? null,
    creationTime: 1,
    cpu: {
      percentCPUUsage: 0,
      idleWakeupsPerSecond: 0,
    },
    memory: {
      workingSetSize: options.workingSetSizeKb,
      peakWorkingSetSize: options.peakWorkingSetSizeKb ?? options.workingSetSizeKb,
      privateBytes: options.privateBytesKb ?? undefined,
    },
  } as Electron.ProcessMetric;
}

describe('AppResourceManager', () => {
  it('builds a unified resource snapshot with guarded runtime, session, and service actions', async () => {
    const { AppResourceManager } = await import('../AppResourceManager');

    const buildRuntimeSnapshot = vi.fn(() => ({
      capturedAt: 100,
      processCount: 4,
      rendererProcessId: 303,
      rendererMemory: null,
      rendererMetric: null,
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 46080,
      totalAppPrivateBytesKb: 22016,
    }));
    const listSessions = vi.fn(
      async (): Promise<SessionDescriptor[]> => [
        {
          sessionId: 'session-local',
          backend: 'local',
          kind: 'terminal',
          cwd: '/repo',
          persistOnDisconnect: false,
          createdAt: 10,
        },
        {
          sessionId: 'session-remote',
          backend: 'remote',
          kind: 'agent',
          cwd: '/__remote__/repo',
          persistOnDisconnect: true,
          createdAt: 20,
        },
      ]
    );
    const getSessionRuntimeInfo = vi.fn(async (sessionId: string) =>
      sessionId === 'session-local' ? { pid: 4444, isActive: true, isAlive: true } : null
    );

    const manager = new AppResourceManager({
      getAppMetrics: () => [
        createProcessMetric({ pid: 101, type: 'Browser', workingSetSizeKb: 12000 }),
        createProcessMetric({ pid: 202, type: 'GPU', workingSetSizeKb: 8000 }),
        createProcessMetric({ pid: 303, type: 'Tab', workingSetSizeKb: 16000 }),
        createProcessMetric({
          pid: 404,
          type: 'Utility',
          workingSetSizeKb: 10080,
          serviceName: 'network.service',
        }),
      ],
      buildRuntimeSnapshot,
      listSessions,
      getSessionRuntimeInfo,
      killSession: vi.fn(async () => undefined),
      getHapiStatus: () => ({ running: true, ready: true, pid: 5001, port: 3006 }),
      stopHapi: vi.fn(async () => ({ running: false })),
      getHapiRunnerStatus: () => ({ running: true, pid: 5002 }),
      stopHapiRunner: vi.fn(async () => ({ running: false })),
      getCloudflaredStatus: () => ({
        installed: true,
        running: true,
        url: 'https://demo.trycloudflare.com',
      }),
      stopCloudflared: vi.fn(async () => ({ installed: true, running: false })),
      terminateProcess: vi.fn(),
    });
    const sessionTarget = 17;

    const snapshot = await manager.getSnapshot(
      {
        getOSProcessId: () => 303,
        reload: vi.fn(),
      },
      sessionTarget
    );

    expect(buildRuntimeSnapshot).toHaveBeenCalledWith({
      appMetrics: expect.arrayContaining([
        expect.objectContaining({ pid: 101 }),
        expect.objectContaining({ pid: 404 }),
      ]),
      rendererMemory: null,
      rendererProcessId: 303,
    });
    expect(listSessions).toHaveBeenCalledWith(sessionTarget);
    expect(getSessionRuntimeInfo).toHaveBeenCalledWith('session-local');

    const browserProcess = snapshot.resources.find((resource) => resource.id === 'process:101');
    const currentRenderer = snapshot.resources.find((resource) => resource.id === 'process:303');
    const utilityProcess = snapshot.resources.find((resource) => resource.id === 'process:404');
    const localSession = snapshot.resources.find(
      (resource) => resource.id === 'session:session-local'
    );
    const hapiService = snapshot.resources.find(
      (resource) => resource.id === 'service:hapi-server'
    );

    expect(snapshot.runtime.capturedAt).toBe(100);
    expect(browserProcess).toMatchObject({
      kind: 'electron-process',
      status: 'running',
      availableActions: [],
    });
    expect(currentRenderer).toMatchObject({
      kind: 'electron-process',
      isCurrentRenderer: true,
      availableActions: [{ kind: 'reload-renderer', dangerLevel: 'safe' }],
    });
    expect(utilityProcess).toMatchObject({
      kind: 'electron-process',
      serviceName: 'network.service',
      availableActions: [{ kind: 'terminate-process', dangerLevel: 'danger' }],
    });
    expect(localSession).toMatchObject({
      kind: 'session',
      pid: 4444,
      isActive: true,
      isAlive: true,
      reclaimable: false,
      availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
    });
    expect(hapiService).toMatchObject({
      kind: 'service',
      serviceKind: 'hapi-server',
      status: 'ready',
      availableActions: [{ kind: 'stop-service', dangerLevel: 'safe' }],
    });
  });

  it('preserves session runtime state and maps non-live sessions to degraded resource statuses', async () => {
    const { AppResourceManager } = await import('../AppResourceManager');

    const manager = new AppResourceManager({
      getAppMetrics: () => [],
      buildRuntimeSnapshot: vi.fn(() => ({
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      })),
      listSessions: vi.fn(
        async () =>
          [
            {
              sessionId: 'session-live',
              backend: 'local',
              kind: 'terminal',
              cwd: '/repo/live',
              persistOnDisconnect: false,
              createdAt: 10,
              runtimeState: 'live',
            },
            {
              sessionId: 'session-reconnecting',
              backend: 'remote',
              kind: 'agent',
              cwd: '/__remote__/repo',
              persistOnDisconnect: true,
              createdAt: 20,
              runtimeState: 'reconnecting',
            },
            {
              sessionId: 'session-dead',
              backend: 'local',
              kind: 'terminal',
              cwd: '/repo/dead',
              persistOnDisconnect: false,
              createdAt: 30,
              runtimeState: 'dead',
            },
          ] as unknown as SessionDescriptor[]
      ),
      getSessionRuntimeInfo: vi.fn(async (sessionId: string) => {
        switch (sessionId) {
          case 'session-live':
            return { pid: 4101, isActive: true, isAlive: true };
          case 'session-reconnecting':
            return { pid: null, isActive: null, isAlive: null };
          case 'session-dead':
            return { pid: null, isActive: null, isAlive: false };
          default:
            return null;
        }
      }),
      killSession: vi.fn(async () => undefined),
      getHapiStatus: () => ({ running: false }),
      stopHapi: vi.fn(async () => ({ running: false })),
      getHapiRunnerStatus: () => ({ running: false }),
      stopHapiRunner: vi.fn(async () => ({ running: false })),
      getCloudflaredStatus: () => ({ installed: true, running: false }),
      stopCloudflared: vi.fn(async () => ({ installed: true, running: false })),
      terminateProcess: vi.fn(),
    });

    const snapshot = await manager.getSnapshot({
      getOSProcessId: () => 303,
      reload: vi.fn(),
    });

    expect(snapshot.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session:session-live',
          kind: 'session',
          status: 'running',
          runtimeState: 'live',
          isAlive: true,
          reclaimable: false,
        }),
        expect.objectContaining({
          id: 'session:session-reconnecting',
          kind: 'session',
          status: 'reconnecting',
          runtimeState: 'reconnecting',
          isAlive: null,
          reclaimable: false,
        }),
        expect.objectContaining({
          id: 'session:session-dead',
          kind: 'session',
          status: 'stopped',
          runtimeState: 'dead',
          isAlive: false,
          reclaimable: true,
        }),
      ])
    );
  });

  it('marks stale local sessions as stopped when the backing process is no longer alive', async () => {
    const { AppResourceManager } = await import('../AppResourceManager');

    const manager = new AppResourceManager({
      getAppMetrics: () => [],
      buildRuntimeSnapshot: vi.fn(() => ({
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      })),
      listSessions: vi.fn(
        async () =>
          [
            {
              sessionId: 'session-local-stale',
              backend: 'local',
              kind: 'terminal',
              cwd: '/repo/stale',
              persistOnDisconnect: false,
              createdAt: 10,
            },
          ] as SessionDescriptor[]
      ),
      getSessionRuntimeInfo: vi.fn(async () => ({
        pid: 4001,
        isActive: false,
        isAlive: false,
      })),
      killSession: vi.fn(async () => undefined),
      getHapiStatus: () => ({ running: false }),
      stopHapi: vi.fn(async () => ({ running: false })),
      getHapiRunnerStatus: () => ({ running: false }),
      stopHapiRunner: vi.fn(async () => ({ running: false })),
      getCloudflaredStatus: () => ({ installed: true, running: false }),
      stopCloudflared: vi.fn(async () => ({ installed: true, running: false })),
      terminateProcess: vi.fn(),
    });

    const snapshot = await manager.getSnapshot({
      getOSProcessId: () => 303,
      reload: vi.fn(),
    });

    expect(snapshot.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session:session-local-stale',
          kind: 'session',
          status: 'stopped',
          runtimeState: 'dead',
          isAlive: false,
          reclaimable: true,
        }),
      ])
    );
  });

  it('executes safe recovery actions and blocks protected process termination', async () => {
    const { AppResourceManager } = await import('../AppResourceManager');

    const killSession = vi.fn(async () => undefined);
    const stopHapi = vi.fn(async () => ({ running: false }));
    const stopHapiRunner = vi.fn(async () => ({ running: false }));
    const stopCloudflared = vi.fn(async () => ({ installed: true, running: false }));
    const terminateProcess = vi.fn();
    const reload = vi.fn();

    const manager = new AppResourceManager({
      getAppMetrics: () => [
        createProcessMetric({ pid: 101, type: 'Browser', workingSetSizeKb: 12000 }),
        createProcessMetric({ pid: 202, type: 'GPU', workingSetSizeKb: 8000 }),
        createProcessMetric({ pid: 303, type: 'Tab', workingSetSizeKb: 16000 }),
        createProcessMetric({ pid: 404, type: 'Utility', workingSetSizeKb: 10080 }),
      ],
      buildRuntimeSnapshot: vi.fn(() => ({
        capturedAt: 100,
        processCount: 4,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 46080,
        totalAppPrivateBytesKb: 22016,
      })),
      listSessions: vi.fn(async () => []),
      getSessionRuntimeInfo: vi.fn(async () => null),
      killSession,
      getHapiStatus: () => ({ running: true, ready: true, pid: 5001, port: 3006 }),
      stopHapi,
      getHapiRunnerStatus: () => ({ running: true, pid: 5002 }),
      stopHapiRunner,
      getCloudflaredStatus: () => ({
        installed: true,
        running: true,
        url: 'https://demo.trycloudflare.com',
      }),
      stopCloudflared,
      terminateProcess,
    });

    await expect(
      manager.executeAction(
        {
          kind: 'reload-renderer',
          resourceId: 'process:303',
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(reload).toHaveBeenCalledTimes(1);

    await expect(
      manager.executeAction(
        {
          kind: 'kill-session',
          resourceId: 'session:session-local',
          sessionId: 'session-local',
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(killSession).toHaveBeenCalledWith('session-local');

    await expect(
      manager.executeAction(
        {
          kind: 'stop-service',
          resourceId: 'service:hapi-server',
          serviceKind: 'hapi-server',
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(stopHapi).toHaveBeenCalledTimes(1);

    await expect(
      manager.executeAction(
        {
          kind: 'stop-service',
          resourceId: 'service:hapi-runner',
          serviceKind: 'hapi-runner',
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(stopHapiRunner).toHaveBeenCalledTimes(1);

    await expect(
      manager.executeAction(
        {
          kind: 'stop-service',
          resourceId: 'service:cloudflared',
          serviceKind: 'cloudflared',
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(stopCloudflared).toHaveBeenCalledTimes(1);

    await expect(
      manager.executeAction(
        {
          kind: 'terminate-process',
          resourceId: 'process:202',
          pid: 202,
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(terminateProcess).toHaveBeenCalledWith(202);

    await expect(
      manager.executeAction(
        {
          kind: 'terminate-process',
          resourceId: 'process:101',
          pid: 101,
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: false });

    await expect(
      manager.executeAction(
        {
          kind: 'terminate-process',
          resourceId: 'process:303',
          pid: 303,
        },
        { getOSProcessId: () => 303, reload }
      )
    ).resolves.toMatchObject({ ok: false });
    expect(terminateProcess).toHaveBeenCalledTimes(1);
  });

  it('reclaims only stale sessions for the current sender', async () => {
    const { AppResourceManager } = await import('../AppResourceManager');

    const listSessions = vi.fn(
      async (): Promise<SessionDescriptor[]> => [
        {
          sessionId: 'session-local-stale',
          backend: 'local',
          kind: 'terminal',
          cwd: '/repo/stale',
          persistOnDisconnect: false,
          createdAt: 10,
        },
        {
          sessionId: 'session-local-idle-but-alive',
          backend: 'local',
          kind: 'terminal',
          cwd: '/repo/idle-but-alive',
          persistOnDisconnect: false,
          createdAt: 20,
        },
        {
          sessionId: 'session-local-unknown',
          backend: 'local',
          kind: 'agent',
          cwd: '/repo/unknown',
          persistOnDisconnect: true,
          createdAt: 30,
        },
        {
          sessionId: 'session-remote-idle',
          backend: 'remote',
          kind: 'agent',
          cwd: '/__remote__/repo',
          persistOnDisconnect: true,
          createdAt: 40,
        },
      ]
    );
    const getSessionRuntimeInfo = vi.fn(async (sessionId: string) => {
      switch (sessionId) {
        case 'session-local-stale':
          return { pid: 4001, isActive: false, isAlive: false };
        case 'session-local-idle-but-alive':
          return { pid: 4002, isActive: false, isAlive: true };
        case 'session-local-unknown':
          return { pid: 4003, isActive: null, isAlive: null };
        case 'session-remote-idle':
          return { pid: 4004, isActive: false, isAlive: false };
        default:
          return null;
      }
    });
    const killSession = vi.fn(async () => undefined);
    const sender = {
      getOSProcessId: () => 303,
      reload: vi.fn(),
    };
    const sessionTarget = 73;

    const manager = new AppResourceManager({
      getAppMetrics: () => [],
      buildRuntimeSnapshot: vi.fn(() => ({
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      })),
      listSessions,
      getSessionRuntimeInfo,
      killSession,
      getHapiStatus: () => ({ running: false }),
      stopHapi: vi.fn(async () => ({ running: false })),
      getHapiRunnerStatus: () => ({ running: false }),
      stopHapiRunner: vi.fn(async () => ({ running: false })),
      getCloudflaredStatus: () => ({ installed: true, running: false }),
      stopCloudflared: vi.fn(async () => ({ installed: true, running: false })),
      terminateProcess: vi.fn(),
    });

    await expect(
      manager.executeAction(
        {
          kind: 'reclaim-stale-sessions',
          resourceId: 'batch:stale-sessions',
        },
        sender,
        sessionTarget
      )
    ).resolves.toMatchObject({
      ok: true,
      kind: 'reclaim-stale-sessions',
      resourceId: 'batch:stale-sessions',
      reclaimedCount: 1,
      message: 'Reclaimed 1 stale session.',
    });

    expect(listSessions).toHaveBeenCalledWith(sessionTarget);
    expect(getSessionRuntimeInfo).toHaveBeenCalledTimes(4);
    expect(killSession).toHaveBeenCalledTimes(1);
    expect(killSession).toHaveBeenCalledWith('session-local-stale');
  });
});
