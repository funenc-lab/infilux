import type { AppResourceSnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildProjectTokenUsageRequest } from '../projectTokenUsageRequestModel';

const baseSnapshot: AppResourceSnapshot = {
  capturedAt: 1,
  runtime: {
    capturedAt: 1,
    processCount: 0,
    rendererProcessId: null,
    rendererMemory: null,
    rendererMetric: null,
    browserMetric: null,
    gpuMetric: null,
    totalAppWorkingSetSizeKb: 0,
    totalAppPrivateBytesKb: 0,
  },
  resources: [],
};

describe('projectTokenUsageRequestModel', () => {
  it('builds a stable token usage project path request from repositories and session resources', () => {
    const storage = {
      getItem: (key: string) =>
        key === 'enso-repositories'
          ? JSON.stringify([
              { path: '/repo/app' },
              { path: '/repo/app/' },
              { path: 'C:\\Repo\\Tool' },
              { path: '' },
              { name: 'missing-path' },
            ])
          : null,
    };
    const snapshot: AppResourceSnapshot = {
      ...baseSnapshot,
      resources: [
        {
          id: 'session:agent-1',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          availableActions: [],
          sessionId: 'agent-1',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/app/worktree-a',
          repoPath: null,
          projectName: null,
          worktreeName: null,
          branchName: null,
          createdAt: 1,
          persistOnDisconnect: false,
          pid: 1,
          isActive: true,
          isAlive: true,
          reclaimable: false,
        },
        {
          id: 'runtime:renderer',
          kind: 'electron-process',
          group: 'runtime',
          status: 'running',
          availableActions: [],
          pid: 2,
          processType: 'renderer',
          name: null,
          serviceName: null,
          workingSetSizeKb: 0,
          peakWorkingSetSizeKb: 0,
          privateBytesKb: null,
          isCurrentRenderer: true,
        },
      ],
    };

    expect(buildProjectTokenUsageRequest(snapshot, storage).projectPaths).toEqual([
      '/repo/app',
      'C:/Repo/Tool',
    ]);
  });

  it('uses session cwd paths when no stored repository covers the session', () => {
    const storage = {
      getItem: () => null,
    };
    const snapshot: AppResourceSnapshot = {
      ...baseSnapshot,
      resources: [
        {
          id: 'session:agent-1',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          availableActions: [],
          sessionId: 'agent-1',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/repo/app/worktree-a',
          repoPath: null,
          projectName: null,
          worktreeName: null,
          branchName: null,
          createdAt: 1,
          persistOnDisconnect: false,
          pid: 1,
          isActive: true,
          isAlive: true,
          reclaimable: false,
        },
      ],
    };

    expect(buildProjectTokenUsageRequest(snapshot, storage).projectPaths).toEqual([
      '/repo/app/worktree-a',
    ]);
  });

  it('uses session repo paths as project scope and keeps cwd aliases for matching', () => {
    const storage = {
      getItem: () => null,
    };
    const snapshot: AppResourceSnapshot = {
      ...baseSnapshot,
      resources: [
        {
          id: 'session:agent-1',
          kind: 'session',
          group: 'sessions',
          status: 'running',
          availableActions: [],
          sessionId: 'agent-1',
          sessionKind: 'agent',
          backend: 'local',
          cwd: '/workspaces/app-feature-a',
          repoPath: '/repo/app',
          projectName: 'app',
          worktreeName: 'app-feature-a',
          branchName: 'feature/a',
          createdAt: 1,
          persistOnDisconnect: false,
          pid: 1,
          isActive: true,
          isAlive: true,
          reclaimable: false,
        },
      ],
    };

    expect(buildProjectTokenUsageRequest(snapshot, storage)).toEqual({
      projectPaths: ['/repo/app'],
      projectPathAliases: {
        '/repo/app': ['/workspaces/app-feature-a'],
      },
    });
  });

  it('returns an empty request when stored repositories are malformed and no sessions are loaded', () => {
    const storage = {
      getItem: () => '{not valid json',
    };

    expect(buildProjectTokenUsageRequest(null, storage)).toEqual({});
  });
});
