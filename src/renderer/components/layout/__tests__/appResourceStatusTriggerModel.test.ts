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
  it('surfaces active agent sessions as the success badge count', () => {
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
          repoPath: null,
          projectName: null,
          worktreeName: null,
          branchName: null,
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
          id: 'session:live-agent',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          sessionId: 'live-agent',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo',
          repoPath: null,
          projectName: null,
          worktreeName: null,
          branchName: null,
          createdAt: 12,
          persistOnDisconnect: false,
          pid: 4002,
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
      badgeLabel: '1',
      badgeClassName: 'control-badge-success',
    });
  });

  it('prioritizes explicit dead sessions over healthy activity', () => {
    const viewModel = buildAppResourceStatusTriggerViewModel(
      createSnapshot([
        {
          id: 'session:stale-terminal',
          kind: 'session',
          group: 'sessions',
          status: 'dead',
          sessionId: 'stale-terminal',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/stale',
          repoPath: null,
          projectName: null,
          worktreeName: null,
          branchName: null,
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
