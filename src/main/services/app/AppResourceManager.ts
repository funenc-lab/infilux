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
import { app, type BrowserWindow, type WebContents } from 'electron';
import { killProcessTree } from '../../utils/processUtils';
import { buildRuntimeMemorySnapshot } from '../../utils/runtimeMemory';
import { cloudflaredManager } from '../hapi/CloudflaredManager';
import { hapiRunnerManager } from '../hapi/HapiRunnerManager';
import { hapiServerManager } from '../hapi/HapiServerManager';
import { sessionManager } from '../session/SessionManager';

type ResourceSender = Pick<WebContents, 'getOSProcessId' | 'reload'>;
type SessionTarget = BrowserWindow | WebContents | number;

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
  if (session.backend === 'local' && processInfo?.isAlive === false) {
    return 'dead';
  }

  return resolveSessionRuntimeState(session);
}

function toSessionStatus(
  runtimeState: ReturnType<typeof resolveSessionRuntimeState>
): AppResourceStatus {
  switch (runtimeState) {
    case 'reconnecting':
      return 'reconnecting';
    case 'dead':
      return 'stopped';
    default:
      return 'running';
  }
}

function isReclaimableStaleSession(
  session: SessionDescriptor,
  processInfo: SessionProcessInfo | null
): boolean {
  return session.backend === 'local' && processInfo?.isAlive === false;
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
  constructor(private readonly dependencies: AppResourceManagerDependencies) {}

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
        return {
          id: `session:${session.sessionId}`,
          kind: 'session',
          group: 'sessions',
          status: toSessionStatus(runtimeState),
          sessionId: session.sessionId,
          sessionKind: session.kind,
          backend: session.backend,
          cwd: session.cwd,
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
  killSession: (sessionId) => sessionManager.kill(sessionId),
  getHapiStatus: () => hapiServerManager.getStatus(),
  stopHapi: () => hapiServerManager.stop(),
  getHapiRunnerStatus: () => hapiRunnerManager.getStatus(),
  stopHapiRunner: () => hapiRunnerManager.stop(),
  getCloudflaredStatus: () => cloudflaredManager.getStatus(),
  stopCloudflared: () => cloudflaredManager.stop(),
  terminateProcess: (pid) => killProcessTree(pid),
});
