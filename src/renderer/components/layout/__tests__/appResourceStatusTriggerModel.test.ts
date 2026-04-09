import type { AppResourceSnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildAppResourceStatusTriggerViewModel } from '../appResourceStatusTriggerModel';

function createSnapshot(resources: AppResourceSnapshot['resources']): AppResourceSnapshot {
  return {
    capturedAt: 100,
    runtime: {
      capturedAt: 100,
      processCount: 2,
      rendererProcessId: 303,
      rendererMemory: null,
      rendererMetric: null,
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 12288,
      totalAppPrivateBytesKb: 6144,
    },
    resources,
  };
}

describe('appResourceStatusTriggerModel', () => {
  it('surfaces healthy managed activity as a success badge', () => {
    const viewModel = buildAppResourceStatusTriggerViewModel(
      createSnapshot([
        {
          id: 'session:live-terminal',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'live-terminal',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo',
          createdAt: 10,
          persistOnDisconnect: false,
          pid: 4001,
          isActive: true,
          isAlive: true,
          reclaimable: false,
          runtimeState: 'live',
          availableActions: [],
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
          availableActions: [],
        },
      ])
    );

    expect(viewModel).toEqual({
      tone: 'success',
      badgeLabel: '2',
      badgeClassName: 'control-badge-success',
    });
  });

  it('prioritizes degraded resources over healthy activity', () => {
    const viewModel = buildAppResourceStatusTriggerViewModel(
      createSnapshot([
        {
          id: 'session:stale-terminal',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'stale-terminal',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/stale',
          createdAt: 10,
          persistOnDisconnect: false,
          pid: 4001,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'dead',
          availableActions: [],
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
          availableActions: [],
        },
      ])
    );

    expect(viewModel).toEqual({
      tone: 'destructive',
      badgeLabel: '1',
      badgeClassName: 'control-badge-destructive',
    });
  });
});
