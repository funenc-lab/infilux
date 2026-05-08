import { translate } from '@shared/i18n';
import { describe, expect, it } from 'vitest';
import {
  buildAppResourceActionConfirmation,
  buildAppResourceManagerBulkActions,
  buildAppResourceManagerSections,
  countVisibleResourcesByGroup,
} from '../appResourceManagerModel';

const t = (key: string, params?: Record<string, string | number>): string => {
  if (!params) {
    return key;
  }

  return key.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
};

const zhT = (key: string, params?: Record<string, string | number>): string => {
  return translate('zh', key, params);
};

describe('appResourceManagerModel', () => {
  it('groups runtime resources, sessions, and services with readable actions', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 4,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 46080,
        totalAppPrivateBytesKb: 22016,
      },
      resources: [
        {
          id: 'process:404',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 404,
          processType: 'Utility',
          name: null,
          serviceName: 'network.service',
          workingSetSizeKb: 10080,
          peakWorkingSetSizeKb: 12000,
          privateBytesKb: 4096,
          isCurrentRenderer: false,
          availableActions: [{ kind: 'terminate-process', dangerLevel: 'danger' }],
        },
        {
          id: 'process:303',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 303,
          processType: 'Tab',
          name: 'renderer',
          serviceName: null,
          workingSetSizeKb: 16000,
          peakWorkingSetSizeKb: 18000,
          privateBytesKb: 6000,
          isCurrentRenderer: true,
          availableActions: [{ kind: 'reload-renderer', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-local',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo',
          repoPath: '/projects/ensoai',
          projectName: 'ensoai',
          worktreeName: 'feature-panel',
          branchName: 'feature/panel',
          createdAt: 10,
          pid: 4444,
          isActive: true,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'service:hapi-server',
          kind: 'service',
          group: 'services',
          status: 'ready',
          serviceKind: 'hapi-server',
          pid: 5001,
          port: 3006,
          url: null,
          error: null,
          installed: null,
          availableActions: [{ kind: 'stop-service', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);

    expect(sections.map((section) => section.title)).toEqual([
      'Electron runtime',
      'Sessions',
      'Support services',
    ]);
    expect(sections[0]?.items[0]?.title).toBe('Renderer process');
    expect(sections[0]?.items[0]?.actions.map((action) => action.label)).toEqual([
      'Reload Renderer',
    ]);
    expect(sections[0]?.items[1]?.actions.map((action) => action.label)).toEqual([
      'Force Terminate',
    ]);
    expect(sections[1]?.items[0]?.title).toBe('ensoai / feature-panel');
    expect(sections[1]?.items[0]?.subtitle).toBe('feature/panel');
    expect(sections[1]?.items[0]?.actions.map((action) => action.label)).toEqual(['Kill Session']);
    expect(sections[2]?.items[0]?.title).toBe('Hapi Server');
  });

  it('builds confirmation copy for dangerous process termination', () => {
    const resource = {
      id: 'process:404',
      kind: 'electron-process',
      group: 'runtime',
      status: 'running',
      pid: 404,
      processType: 'Utility',
      name: null,
      serviceName: 'network.service',
      workingSetSizeKb: 10080,
      peakWorkingSetSizeKb: 12000,
      privateBytesKb: 4096,
      isCurrentRenderer: false,
      availableActions: [{ kind: 'terminate-process', dangerLevel: 'danger' }],
    };

    const confirmation = buildAppResourceActionConfirmation(
      {
        kind: 'terminate-process',
        resourceId: 'process:404',
        pid: 404,
      },
      resource as never,
      t
    );

    expect(confirmation).toEqual({
      title: 'Force terminate process?',
      description:
        'This will forcibly terminate Utility (PID 404). Unsaved work in that process may be lost.',
      confirmLabel: 'Force Terminate',
    });
  });

  it('builds confirmation copy for renderer reload, session kill, and service stop actions', () => {
    const sessionResource = {
      id: 'session:session-live',
      kind: 'session',
      group: 'sessions',
      status: 'running',
      sessionId: 'session-live',
      sessionKind: 'agent',
      backend: 'remote',
      cwd: '/repo/live',
      createdAt: 10,
      pid: null,
      isActive: null,
      isAlive: null,
      reclaimable: false,
      runtimeState: 'reconnecting',
      availableActions: [{ kind: 'kill-session', dangerLevel: 'danger' }],
    };
    const serviceResource = {
      id: 'service:runner',
      kind: 'service',
      group: 'services',
      status: 'ready',
      serviceKind: 'hapi-runner',
      pid: null,
      port: null,
      url: null,
      error: null,
      installed: true,
      availableActions: [{ kind: 'stop-service', dangerLevel: 'safe' }],
    };

    expect(
      buildAppResourceActionConfirmation(
        { kind: 'reload-renderer', resourceId: 'process:renderer' },
        {
          id: 'process:renderer',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 303,
          processType: 'Tab',
          name: 'renderer',
          serviceName: null,
          workingSetSizeKb: 0,
          peakWorkingSetSizeKb: 0,
          privateBytesKb: 0,
          isCurrentRenderer: true,
          availableActions: [{ kind: 'reload-renderer', dangerLevel: 'safe' }],
        } as never,
        t
      )
    ).toEqual({
      title: 'Reload renderer?',
      description: 'This will reload the current renderer. Unsaved in-memory UI state may be lost.',
      confirmLabel: 'Reload Renderer',
    });
    expect(
      buildAppResourceActionConfirmation(
        { kind: 'kill-session', resourceId: 'session:session-live', sessionId: 'session-live' },
        sessionResource as never,
        t
      )
    ).toEqual({
      title: 'Kill session?',
      description: 'This will terminate the selected session and its child processes.',
      confirmLabel: 'Kill Session',
    });
    expect(
      buildAppResourceActionConfirmation(
        { kind: 'stop-service', resourceId: 'service:runner', serviceKind: 'hapi-runner' },
        serviceResource as never,
        t
      )
    ).toEqual({
      title: 'Stop service?',
      description: 'This will stop the selected background service for the current app runtime.',
      confirmLabel: 'Stop Service',
    });
  });

  it('builds confirmation copy for stale session reclaim', () => {
    const resource = {
      id: 'session:session-stale',
      kind: 'session',
      group: 'sessions',
      status: 'stopped',
      sessionId: 'session-stale',
      sessionKind: 'terminal',
      backend: 'local',
      cwd: '/repo/stale',
      createdAt: 10,
      pid: 4444,
      isActive: false,
      isAlive: false,
      reclaimable: true,
      runtimeState: 'dead',
      availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
    };

    const confirmation = buildAppResourceActionConfirmation(
      {
        kind: 'reclaim-stale-sessions',
        resourceId: 'batch:stale-sessions',
      },
      resource as never,
      t
    );

    expect(confirmation).toEqual({
      title: 'Reclaim stale sessions?',
      description:
        'This will remove stale session records whose underlying runtime is no longer alive.',
      confirmLabel: 'Reclaim Stale Sessions',
    });
  });

  it('exposes runtime, activity, liveness, and reclaimability metrics for visible sessions', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-local-live',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-live',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/live',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'live',
          branchName: 'feature/live',
          createdAt: 15,
          pid: 4445,
          isActive: true,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);
    const sessionMetrics = sections[0]?.items[0]?.metrics;

    expect(sessionMetrics).toEqual([
      {
        key: 'cwd',
        label: 'Working directory',
        value: '/repo/live',
      },
      {
        key: 'backend',
        label: 'Backend',
        value: 'Local',
      },
      {
        key: 'runtime-state',
        label: 'Runtime state',
        value: 'Live',
      },
      {
        key: 'activity',
        label: 'Activity',
        value: 'Active',
      },
      {
        key: 'liveness',
        label: 'Liveness',
        value: 'Alive',
      },
      {
        key: 'reclaimable',
        label: 'Reclaimable',
        value: 'No',
      },
    ]);
  });

  it('localizes session labels and metrics with translated kind, backend, and runtime values', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-local-live',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-live',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/live',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'live',
          branchName: 'feature/live',
          createdAt: 15,
          pid: 4445,
          isActive: false,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, zhT);
    const sessionItem = sections[0]?.items[0];

    expect(sessionItem?.title).toBe('repo / live');
    expect(sessionItem?.subtitle).toBe('feature/live');
    expect(sessionItem?.metrics).toEqual([
      {
        key: 'cwd',
        label: '工作目录',
        value: '/repo/live',
      },
      {
        key: 'backend',
        label: '后端',
        value: '本地',
      },
      {
        key: 'runtime-state',
        label: '运行时状态',
        value: '在线',
      },
      {
        key: 'activity',
        label: '活动状态',
        value: '空闲',
      },
      {
        key: 'liveness',
        label: '存活状态',
        value: '存活',
      },
      {
        key: 'reclaimable',
        label: '可回收',
        value: '否',
      },
    ]);
  });

  it('keeps dead sessions visible with a dead status label instead of collapsing them to stopped', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-dead',
          kind: 'session',
          group: 'sessions',
          status: 'dead',
          sessionId: 'session-dead',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/dead',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'dead',
          branchName: null,
          createdAt: 20,
          pid: null,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'dead',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);

    expect(sections).toEqual([
      expect.objectContaining({
        key: 'sessions',
        items: [
          expect.objectContaining({
            status: 'dead',
          }),
        ],
      }),
    ]);
  });

  it('labels reclaimable stopped sessions as stale instead of showing a generic stopped status', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-stale',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'session-stale',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/stale',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'stale',
          branchName: null,
          createdAt: 20,
          pid: null,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);

    expect(sections).toEqual([
      expect.objectContaining({
        key: 'sessions',
        items: [
          expect.objectContaining({
            status: 'Stale',
          }),
        ],
      }),
    ]);
  });

  it('builds an enabled bulk reclaim action for stale sessions only', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-local-idle-alive',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-idle-alive',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/idle',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'idle',
          branchName: null,
          createdAt: 10,
          pid: 4444,
          isActive: false,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-local-stale',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'session-local-stale',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/stale',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'stale',
          branchName: null,
          createdAt: 15,
          pid: 4445,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-remote-idle',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-remote-idle',
          sessionKind: 'agent',
          backend: 'remote',
          cwd: '/__remote__/repo',
          repoPath: '/projects/ensoai',
          projectName: 'ensoai',
          worktreeName: 'remote',
          branchName: null,
          createdAt: 20,
          pid: 5555,
          isActive: false,
          isAlive: null,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    expect(buildAppResourceManagerBulkActions(snapshot as never, t)).toEqual([
      {
        key: 'batch:stale-sessions:reclaim',
        label: 'Reclaim Stale Sessions',
        description: '1 stale session can be reclaimed.',
        disabled: false,
        request: {
          kind: 'reclaim-stale-sessions',
          resourceId: 'batch:stale-sessions',
        },
      },
    ]);
  });

  it('uses fallback titles, unknown metrics, and service details for sparse resources', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'process:browser',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 1,
          processType: 'Browser',
          name: null,
          serviceName: null,
          workingSetSizeKb: 0,
          peakWorkingSetSizeKb: 0,
          privateBytesKb: 0,
          isCurrentRenderer: false,
          availableActions: [{ kind: 'terminate-process', dangerLevel: 'danger' }],
        },
        {
          id: 'process:gpu',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 2,
          processType: 'GPU',
          name: null,
          serviceName: null,
          workingSetSizeKb: 0,
          peakWorkingSetSizeKb: 0,
          privateBytesKb: 0,
          isCurrentRenderer: false,
          availableActions: [{ kind: 'terminate-process', dangerLevel: 'danger' }],
        },
        {
          id: 'session:agent',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-agent',
          sessionKind: 'agent',
          backend: 'remote',
          cwd: '/repo/agent',
          projectName: 'same',
          worktreeName: 'same',
          branchName: null,
          createdAt: 20,
          pid: null,
          isActive: null,
          isAlive: null,
          reclaimable: false,
          runtimeState: 'reconnecting',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'session:terminal',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-terminal',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/terminal',
          createdAt: 10,
          pid: null,
          isActive: null,
          isAlive: null,
          reclaimable: false,
          runtimeState: 'unknown',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'service:cloudflared',
          kind: 'service',
          group: 'services',
          status: 'ready',
          serviceKind: 'cloudflared',
          pid: null,
          port: 4040,
          url: 'https://example.trycloudflare.com',
          error: null,
          installed: true,
          availableActions: [{ kind: 'stop-service', dangerLevel: 'safe' }],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);

    expect(sections[0]?.items.map((item) => item.title)).toEqual([
      'Browser process',
      'GPU process',
    ]);
    expect(sections[1]?.items.map((item) => item.title)).toEqual(['same', 'Terminal session']);
    expect(sections[1]?.items[0]?.subtitle).toBe('Remote backend');
    expect(sections[1]?.items[0]?.metrics).toEqual(
      expect.arrayContaining([
        { key: 'runtime-state', label: 'Runtime state', value: 'Reconnecting' },
        { key: 'activity', label: 'Activity', value: 'Unknown' },
        { key: 'liveness', label: 'Liveness', value: 'Unknown' },
      ])
    );
    expect(sections[1]?.items[1]?.metrics).toEqual(
      expect.arrayContaining([{ key: 'runtime-state', label: 'Runtime state', value: 'Unknown' }])
    );
    expect(sections[2]?.items[0]).toMatchObject({
      title: 'Cloudflared',
      subtitle: 'Cloudflared status',
      metrics: [
        { key: 'port', label: 'Port', value: '4040' },
        { key: 'url', label: 'URL', value: 'https://example.trycloudflare.com' },
      ],
    });
  });

  it('throws when resource actions are attached to the wrong resource kind', () => {
    expect(() =>
      buildAppResourceManagerSections(
        {
          capturedAt: 100,
          runtime: {
            capturedAt: 100,
            processCount: 0,
            rendererProcessId: 303,
            rendererMemory: null,
            rendererMetric: null,
            browserMetric: null,
            gpuMetric: null,
            totalAppWorkingSetSizeKb: 0,
            totalAppPrivateBytesKb: 0,
          },
          resources: [
            {
              id: 'process:bad',
              kind: 'electron-process',
              group: 'runtime',
              status: 'running',
              pid: 1,
              processType: 'Utility',
              name: null,
              serviceName: null,
              workingSetSizeKb: 0,
              peakWorkingSetSizeKb: 0,
              privateBytesKb: 0,
              isCurrentRenderer: false,
              availableActions: [{ kind: 'kill-session', dangerLevel: 'danger' }],
            },
          ],
        } as never,
        t
      )
    ).toThrow(/does not support session actions/);
  });

  it('disables the bulk reclaim action when no stale sessions are available', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 0,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'session:session-local-active',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-active',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/active',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'active',
          branchName: null,
          createdAt: 10,
          pid: 4444,
          isActive: false,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-local-unknown',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-unknown',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/unknown',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'unknown',
          branchName: null,
          createdAt: 20,
          pid: 5555,
          isActive: null,
          isAlive: null,
          reclaimable: false,
          runtimeState: 'reconnecting',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    expect(buildAppResourceManagerBulkActions(snapshot as never, t)).toEqual([
      {
        key: 'batch:stale-sessions:reclaim',
        label: 'Reclaim Stale Sessions',
        description: 'No stale sessions are ready to reclaim.',
        disabled: true,
        request: {
          kind: 'reclaim-stale-sessions',
          resourceId: 'batch:stale-sessions',
        },
      },
    ]);
  });

  it('keeps reclaimable stale sessions visible while still hiding inactive support services', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 2,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'process:303',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 303,
          processType: 'Tab',
          name: 'renderer',
          serviceName: null,
          workingSetSizeKb: 16000,
          peakWorkingSetSizeKb: 18000,
          privateBytesKb: 6000,
          isCurrentRenderer: true,
          availableActions: [{ kind: 'reload-renderer', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-live',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-live',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/live',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'live',
          branchName: null,
          createdAt: 20,
          pid: 4444,
          isActive: true,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-stale',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'session-stale',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/stale',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'stale',
          branchName: null,
          createdAt: 10,
          pid: null,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'dead',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'service:hapi-server',
          kind: 'service',
          group: 'services',
          status: 'ready',
          serviceKind: 'hapi-server',
          pid: 5001,
          port: 3006,
          url: null,
          error: null,
          installed: null,
          availableActions: [{ kind: 'stop-service', dangerLevel: 'safe' }],
        },
        {
          id: 'service:cloudflared',
          kind: 'service',
          group: 'services',
          status: 'stopped',
          serviceKind: 'cloudflared',
          pid: null,
          port: null,
          url: null,
          error: null,
          installed: true,
          availableActions: [],
        },
      ],
    };

    const sections = buildAppResourceManagerSections(snapshot as never, t);

    expect(sections).toEqual([
      expect.objectContaining({
        key: 'runtime',
        items: [expect.objectContaining({ id: 'process:303' })],
      }),
      expect.objectContaining({
        key: 'sessions',
        items: [
          expect.objectContaining({ id: 'session:session-live' }),
          expect.objectContaining({ id: 'session:session-stale', status: 'Stale' }),
        ],
      }),
      expect.objectContaining({
        key: 'services',
        items: [expect.objectContaining({ id: 'service:hapi-server' })],
      }),
    ]);
  });

  it('uses the same visibility filter for header counts and section rendering', () => {
    const snapshot = {
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 2,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 0,
        totalAppPrivateBytesKb: 0,
      },
      resources: [
        {
          id: 'process:303',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          pid: 303,
          processType: 'Tab',
          name: 'renderer',
          serviceName: null,
          workingSetSizeKb: 16000,
          peakWorkingSetSizeKb: 18000,
          privateBytesKb: 6000,
          isCurrentRenderer: true,
          availableActions: [{ kind: 'reload-renderer', dangerLevel: 'safe' }],
        },
        {
          id: 'session:session-stale',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'session-stale',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/stale',
          repoPath: '/repo',
          projectName: 'repo',
          worktreeName: 'stale',
          branchName: null,
          createdAt: 10,
          pid: null,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'dead',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
        {
          id: 'service:cloudflared',
          kind: 'service',
          group: 'services',
          status: 'stopped',
          serviceKind: 'cloudflared',
          pid: null,
          port: null,
          url: null,
          error: null,
          installed: true,
          availableActions: [],
        },
      ],
    };

    expect(countVisibleResourcesByGroup(snapshot as never)).toEqual({
      runtime: 1,
      sessions: 1,
      services: 0,
    });
  });
});
