import { describe, expect, it } from 'vitest';
import {
  buildAppResourceActionConfirmation,
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
});
