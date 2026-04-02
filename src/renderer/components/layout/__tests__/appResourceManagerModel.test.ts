import { describe, expect, it } from 'vitest';
import {
  buildAppResourceActionConfirmation,
  buildAppResourceManagerBulkActions,
  buildAppResourceManagerSections,
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
          createdAt: 10,
          pid: 4444,
          isActive: true,
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
    expect(sections[1]?.items[0]?.title).toBe('Terminal session');
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

  it('builds an enabled bulk reclaim action for idle local sessions', () => {
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
          id: 'session:session-local-idle',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'session-local-idle',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/idle',
          createdAt: 10,
          pid: 4444,
          isActive: false,
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
          createdAt: 20,
          pid: 5555,
          isActive: false,
          runtimeState: 'live',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    expect(buildAppResourceManagerBulkActions(snapshot as never, t)).toEqual([
      {
        key: 'batch:idle-sessions:reclaim',
        label: 'Reclaim Idle Sessions',
        description: '1 idle local session can be reclaimed.',
        disabled: false,
        request: {
          kind: 'reclaim-idle-sessions',
          resourceId: 'batch:idle-sessions',
        },
      },
    ]);
  });

  it('disables the bulk reclaim action when no idle local sessions are available', () => {
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
          createdAt: 10,
          pid: 4444,
          isActive: true,
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
          createdAt: 20,
          pid: 5555,
          isActive: null,
          runtimeState: 'reconnecting',
          availableActions: [{ kind: 'kill-session', dangerLevel: 'safe' }],
        },
      ],
    };

    expect(buildAppResourceManagerBulkActions(snapshot as never, t)).toEqual([
      {
        key: 'batch:idle-sessions:reclaim',
        label: 'Reclaim Idle Sessions',
        description: 'No idle local sessions are ready to reclaim.',
        disabled: true,
        request: {
          kind: 'reclaim-idle-sessions',
          resourceId: 'batch:idle-sessions',
        },
      },
    ]);
  });
});
