import type {
  AppResourceActionDescriptor,
  AppResourceActionRequest,
  AppResourceActionResult,
  AppResourceItem,
  AppResourceSnapshot,
  AppResourceStatus,
  AppRuntimeProcessResource,
  AppServiceResource,
  AppServiceResourceKind,
  AppSessionResource,
  RuntimeMemorySnapshot,
  SessionDescriptor,
} from '@shared/types';
import {
  getDisplayPathBasename,
  normalizePath,
  trimTrailingPathSeparators,
} from '@shared/utils/path';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { app, type BrowserWindow, type WebContents } from 'electron';
import { killProcessTree } from '../../utils/processUtils';
import { buildRuntimeMemorySnapshot } from '../../utils/runtimeMemory';
import { GitService } from '../git/GitService';
import { cloudflaredManager } from '../hapi/CloudflaredManager';
import { hapiRunnerManager } from '../hapi/HapiRunnerManager';
import { hapiServerManager } from '../hapi/HapiServerManager';
import { sessionManager } from '../session/SessionManager';

type ResourceSender = Pick<WebContents, 'getOSProcessId' | 'reload'>;
type SessionTarget = BrowserWindow | WebContents | number;

const DEFAULT_BRANCH_CACHE_TTL_MS = 30_000;

interface SessionProcessInfo {
  pid: number | null;
  isActive: boolean | null;
  isAlive: boolean | null;
}

interface AppResourceManagerDependencies {
  getAppMetrics: () => Electron.ProcessMetric[];
  buildRuntimeSnapshot: (options: {
    appMetrics: Electron.ProcessMetric[];
    rendererMemory: Electron.ProcessMemoryInfo | null;
    rendererProcessId: number | null;
    capturedAt?: number;
  }) => RuntimeMemorySnapshot;
  listSessions: (target?: SessionTarget) => SessionDescriptor[] | Promise<SessionDescriptor[]>;
  getSessionRuntimeInfo: (sessionId: string) => Promise<SessionProcessInfo | null>;
  resolveWorktreeBranchName: (worktreePath: string) => Promise<string | null>;
  killSession: (sessionId: string) => Promise<void>;
  getHapiStatus: () => {
    running: boolean;
    ready?: boolean;
    pid?: number;
    port?: number;
    error?: string;
  };
  stopHapi: () => Promise<{
    running: boolean;
    ready?: boolean;
    pid?: number;
    port?: number;
    error?: string;
  }>;
  getHapiRunnerStatus: () => { running: boolean; pid?: number; error?: string };
  stopHapiRunner: () => Promise<{ running: boolean; pid?: number; error?: string }>;
  getCloudflaredStatus: () => {
    installed: boolean;
    version?: string;
    running: boolean;
    url?: string;
    error?: string;
  };
  stopCloudflared: () => Promise<{
    installed: boolean;
    version?: string;
    running: boolean;
    url?: string;
    error?: string;
  }>;
  terminateProcess: (pid: number) => void;
  now?: () => number;
  branchCacheTtlMs?: number;
}

interface BranchNameCacheEntry {
  expiresAt: number;
  branchName: string | null;
}

function safeAction(kind: AppResourceActionDescriptor['kind']): AppResourceActionDescriptor {
  return { kind, dangerLevel: 'safe' };
}

function dangerAction(kind: AppResourceActionDescriptor['kind']): AppResourceActionDescriptor {
  return { kind, dangerLevel: 'danger' };
}

function normalizeRendererProcessId(sender: Pick<ResourceSender, 'getOSProcessId'>): number | null {
  const pid = sender.getOSProcessId();
  return typeof pid === 'number' && pid > 0 ? pid : null;
}

function isTerminableRuntimeProcess(
  metric: Electron.ProcessMetric,
  rendererProcessId: number | null
): boolean {
  if (metric.type === 'Browser') {
    return false;
  }

  if (rendererProcessId !== null && metric.pid === rendererProcessId) {
    return false;
  }

  return metric.type === 'GPU' || metric.type === 'Utility' || metric.type === 'Tab';
}

function toRuntimeStatus(metric: Electron.ProcessMetric): AppResourceStatus {
  return metric.memory.workingSetSize > 0 ? 'running' : 'stopped';
}

function toRuntimeProcessResource(
  metric: Electron.ProcessMetric,
  rendererProcessId: number | null
): AppRuntimeProcessResource {
  const availableActions = isTerminableRuntimeProcess(metric, rendererProcessId)
    ? [dangerAction('terminate-process')]
    : rendererProcessId !== null && metric.pid === rendererProcessId
      ? [safeAction('reload-renderer')]
      : [];

  return {
    id: `process:${metric.pid}`,
    kind: 'electron-process',
    group: 'runtime',
    status: toRuntimeStatus(metric),
    pid: metric.pid,
    processType: metric.type,
    name: metric.name ?? null,
    serviceName: metric.serviceName ?? null,
    workingSetSizeKb: metric.memory.workingSetSize,
    peakWorkingSetSizeKb: metric.memory.peakWorkingSetSize,
    privateBytesKb: metric.memory.privateBytes ?? null,
    isCurrentRenderer: rendererProcessId !== null && metric.pid === rendererProcessId,
    availableActions,
  };
}

function toServiceStatus(options: {
  running: boolean;
  ready?: boolean;
  error?: string;
  installed?: boolean | null;
}): AppResourceStatus {
  if (options.installed === false) {
    return 'unavailable';
  }

  if (options.error) {
    return 'error';
  }

  if (options.ready) {
    return 'ready';
  }

  return options.running ? 'running' : 'stopped';
}

function toServiceResource(
  serviceKind: AppServiceResourceKind,
  options: {
    running: boolean;
    ready?: boolean;
    pid?: number;
    port?: number;
    url?: string;
    error?: string;
    installed?: boolean | null;
  }
): AppServiceResource {
  return {
    id: `service:${serviceKind}`,
    kind: 'service',
    group: 'services',
    serviceKind,
    status: toServiceStatus(options),
    pid: options.pid ?? null,
    port: options.port ?? null,
    url: options.url ?? null,
    error: options.error ?? null,
    installed: options.installed ?? null,
    availableActions: options.running ? [safeAction('stop-service')] : [],
  };
}

function resolveSessionRuntimeState(session: SessionDescriptor) {
  return session.runtimeState ?? 'live';
}

function resolveEffectiveSessionRuntimeState(
  session: SessionDescriptor,
  processInfo: SessionProcessInfo | null
) {
  if (
    session.backend === 'local' &&
    processInfo?.isAlive === false &&
    session.runtimeState === 'dead'
  ) {
    return 'dead';
  }

  return resolveSessionRuntimeState(session);
}

function toSessionStatus(
  runtimeState: ReturnType<typeof resolveEffectiveSessionRuntimeState>,
  processInfo: SessionProcessInfo | null
): AppResourceStatus {
  switch (runtimeState) {
    case 'reconnecting':
      return 'reconnecting';
    case 'dead':
      return 'dead';
    default:
      return processInfo?.isAlive === false ? 'stopped' : 'running';
  }
}

function isReclaimableStaleSession(
  session: SessionDescriptor,
  processInfo: SessionProcessInfo | null
): boolean {
  return session.backend === 'local' && processInfo?.isAlive === false;
}

function readSessionMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function deriveSessionDisplayContext(
  session: SessionDescriptor,
  resolveWorktreeBranchName: (worktreePath: string) => Promise<string | null>
): Promise<{
  repoPath: string | null;
  projectName: string | null;
  worktreeName: string | null;
  branchName: string | null;
}> {
  const launchMetadata =
    session.metadata?.agentCapabilityLaunch &&
    typeof session.metadata.agentCapabilityLaunch === 'object' &&
    !Array.isArray(session.metadata.agentCapabilityLaunch)
      ? (session.metadata.agentCapabilityLaunch as Record<string, unknown>)
      : undefined;

  const repoPath =
    readSessionMetadataString(launchMetadata, 'repoPath') ??
    readSessionMetadataString(session.metadata, 'repoPath');
  const worktreePath =
    readSessionMetadataString(launchMetadata, 'worktreePath') ??
    readSessionMetadataString(session.metadata, 'worktreePath') ??
    session.cwd;
  const explicitBranchName =
    readSessionMetadataString(launchMetadata, 'branchName') ??
    readSessionMetadataString(session.metadata, 'branchName');
  const branchName =
    explicitBranchName ??
    (session.backend === 'local' && !isRemoteVirtualPath(worktreePath)
      ? await resolveWorktreeBranchName(worktreePath)
      : null);

  const projectName = repoPath
    ? getDisplayPathBasename(repoPath)
    : getDisplayPathBasename(worktreePath);
  const worktreeName = getDisplayPathBasename(worktreePath);

  return {
    repoPath,
    projectName: projectName || null,
    worktreeName: worktreeName || null,
    branchName,
  };
}

function formatStaleSessionReclaimMessage(reclaimedCount: number): string {
  if (reclaimedCount === 0) {
    return 'No stale sessions to reclaim.';
  }

  return reclaimedCount === 1
    ? 'Reclaimed 1 stale session.'
    : `Reclaimed ${reclaimedCount} stale sessions.`;
}

export class AppResourceManager {
  private readonly branchCache = new Map<string, BranchNameCacheEntry>();
  private readonly branchCacheTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly dependencies: AppResourceManagerDependencies) {
    this.branchCacheTtlMs = dependencies.branchCacheTtlMs ?? DEFAULT_BRANCH_CACHE_TTL_MS;
    this.now = dependencies.now ?? Date.now;
  }

  private getBranchCacheKey(worktreePath: string): string {
    return trimTrailingPathSeparators(normalizePath(worktreePath));
  }

  private async resolveCachedWorktreeBranchName(worktreePath: string): Promise<string | null> {
    const cacheKey = this.getBranchCacheKey(worktreePath);
    const cachedEntry = this.branchCache.get(cacheKey);
    const currentTime = this.now();

    if (cachedEntry && cachedEntry.expiresAt > currentTime) {
      return cachedEntry.branchName;
    }

    const branchName = await this.dependencies.resolveWorktreeBranchName(worktreePath);
    this.branchCache.set(cacheKey, {
      branchName,
      expiresAt: currentTime + this.branchCacheTtlMs,
    });

    return branchName;
  }

  async getSnapshot(
    sender: ResourceSender,
    sessionTarget?: SessionTarget
  ): Promise<AppResourceSnapshot> {
    const rendererProcessId = normalizeRendererProcessId(sender);
    const appMetrics = this.dependencies.getAppMetrics();
    const runtime = this.dependencies.buildRuntimeSnapshot({
      appMetrics,
      rendererMemory: null,
      rendererProcessId,
    });

    const sessions = await this.dependencies.listSessions(sessionTarget);
    const sessionResources = await Promise.all(
      sessions.map(async (session): Promise<AppSessionResource> => {
        const processInfo = await this.dependencies.getSessionRuntimeInfo(session.sessionId);
        const runtimeState = resolveEffectiveSessionRuntimeState(session, processInfo);
        const displayContext = await deriveSessionDisplayContext(session, (worktreePath) =>
          this.resolveCachedWorktreeBranchName(worktreePath)
        );
        return {
          id: `session:${session.sessionId}`,
          kind: 'session',
          group: 'sessions',
          status: toSessionStatus(runtimeState, processInfo),
          sessionId: session.sessionId,
          sessionKind: session.kind,
          backend: session.backend,
          cwd: session.cwd,
          repoPath: displayContext.repoPath,
          projectName: displayContext.projectName,
          worktreeName: displayContext.worktreeName,
          branchName: displayContext.branchName,
          createdAt: session.createdAt,
          persistOnDisconnect: session.persistOnDisconnect,
          pid: processInfo?.pid ?? null,
          isActive: processInfo?.isActive ?? null,
          isAlive: processInfo?.isAlive ?? null,
          reclaimable: isReclaimableStaleSession(session, processInfo),
          runtimeState,
          metadata: session.metadata,
          availableActions: [safeAction('kill-session')],
        };
      })
    );

    const resources: AppResourceItem[] = [
      ...appMetrics.map((metric) => toRuntimeProcessResource(metric, rendererProcessId)),
      ...sessionResources,
      toServiceResource('hapi-server', this.dependencies.getHapiStatus()),
      toServiceResource('hapi-runner', this.dependencies.getHapiRunnerStatus()),
      toServiceResource('cloudflared', this.dependencies.getCloudflaredStatus()),
    ];

    return {
      capturedAt: runtime.capturedAt,
      runtime,
      resources,
    };
  }

  async executeAction(
    action: AppResourceActionRequest,
    sender: ResourceSender,
    sessionTarget?: SessionTarget
  ): Promise<AppResourceActionResult> {
    switch (action.kind) {
      case 'reload-renderer':
        sender.reload();
        return {
          ok: true,
          resourceId: action.resourceId,
          kind: action.kind,
          message: 'Renderer reloaded.',
        };
      case 'kill-session':
        await this.dependencies.killSession(action.sessionId);
        return {
          ok: true,
          resourceId: action.resourceId,
          kind: action.kind,
          message: 'Session terminated.',
        };
      case 'stop-service':
        await this.stopService(action.serviceKind);
        return {
          ok: true,
          resourceId: action.resourceId,
          kind: action.kind,
          message: 'Service stopped.',
        };
      case 'terminate-process': {
        const rendererProcessId = normalizeRendererProcessId(sender);
        const metric = this.dependencies.getAppMetrics().find((entry) => entry.pid === action.pid);
        if (!metric || !isTerminableRuntimeProcess(metric, rendererProcessId)) {
          return {
            ok: false,
            resourceId: action.resourceId,
            kind: action.kind,
            message: 'Process is protected and cannot be terminated.',
          };
        }

        this.dependencies.terminateProcess(action.pid);
        return {
          ok: true,
          resourceId: action.resourceId,
          kind: action.kind,
          message: 'Process terminated.',
        };
      }
      case 'reclaim-stale-sessions': {
        const sessions = await this.dependencies.listSessions(sessionTarget);
        const reclaimableSessionIds: string[] = [];

        for (const session of sessions) {
          const processInfo = await this.dependencies.getSessionRuntimeInfo(session.sessionId);
          if (!isReclaimableStaleSession(session, processInfo)) {
            continue;
          }

          reclaimableSessionIds.push(session.sessionId);
        }

        for (const sessionId of reclaimableSessionIds) {
          await this.dependencies.killSession(sessionId);
        }

        return {
          ok: true,
          resourceId: action.resourceId,
          kind: action.kind,
          message: formatStaleSessionReclaimMessage(reclaimableSessionIds.length),
          reclaimedCount: reclaimableSessionIds.length,
        };
      }
    }
  }

  private async stopService(serviceKind: AppServiceResourceKind): Promise<void> {
    switch (serviceKind) {
      case 'hapi-server':
        await this.dependencies.stopHapi();
        return;
      case 'hapi-runner':
        await this.dependencies.stopHapiRunner();
        return;
      case 'cloudflared':
        await this.dependencies.stopCloudflared();
        return;
    }
  }
}

export const appResourceManager = new AppResourceManager({
  getAppMetrics: () => app.getAppMetrics(),
  buildRuntimeSnapshot: buildRuntimeMemorySnapshot,
  listSessions: (target) => (target === undefined ? [] : sessionManager.list(target)),
  getSessionRuntimeInfo: (sessionId) => sessionManager.getSessionRuntimeInfo(sessionId),
  resolveWorktreeBranchName: async (worktreePath) => {
    try {
      return await new GitService(worktreePath).getCurrentBranchName();
    } catch {
      return null;
    }
  },
  killSession: (sessionId) => sessionManager.kill(sessionId),
  getHapiStatus: () => hapiServerManager.getStatus(),
  stopHapi: () => hapiServerManager.stop(),
  getHapiRunnerStatus: () => hapiRunnerManager.getStatus(),
  stopHapiRunner: () => hapiRunnerManager.stop(),
  getCloudflaredStatus: () => cloudflaredManager.getStatus(),
  stopCloudflared: () => cloudflaredManager.stop(),
  terminateProcess: (pid) => killProcessTree(pid),
});
