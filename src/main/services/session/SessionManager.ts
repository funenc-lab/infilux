import { randomUUID } from 'node:crypto';
import {
  IPC_CHANNELS,
  type SessionAttachOptions,
  type SessionAttachResult,
  type SessionCreateOptions,
  type SessionDataEvent,
  type SessionDescriptor,
  type SessionExitEvent,
  type SessionOpenResult,
  type SessionRuntimeState,
  type SessionStateEvent,
} from '@shared/types';
import { BrowserWindow, type WebContents } from 'electron';
import { remoteConnectionManager } from '../remote/RemoteConnectionManager';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '../remote/RemotePath';
import { PtyManager } from '../terminal/PtyManager';
import { localSupervisorRuntime } from './LocalSupervisorRuntime';
import { persistentAgentSessionService } from './PersistentAgentSessionService';

interface ManagedSessionRecord extends SessionDescriptor {
  attachedWindowIds: Set<number>;
  localRuntime?: 'pty' | 'supervisor';
  connectionId?: string;
  runtimeState?: SessionRuntimeState;
  replayBuffer?: string;
  streamState?: 'buffering' | 'attaching' | 'live';
  pendingExit?: SessionExitEvent;
}

interface SessionRuntimeInfo {
  pid: number | null;
  isActive: boolean | null;
  isAlive: boolean | null;
}

const MAX_SESSION_REPLAY_CHARS = 65_536;

function getWindowId(target: BrowserWindow | WebContents | number): number {
  if (typeof target === 'number') {
    return target;
  }

  if (target instanceof BrowserWindow) {
    return target.id;
  }

  const window = BrowserWindow.fromWebContents(target);
  if (!window) {
    throw new Error('Window not found for session');
  }
  return window.id;
}

function now(): number {
  return Date.now();
}

function getPersistentUiSessionId(
  metadata: Record<string, unknown> | undefined
): string | undefined {
  const uiSessionId = metadata?.uiSessionId;
  return typeof uiSessionId === 'string' && uiSessionId.length > 0 ? uiSessionId : undefined;
}

function shouldAbandonPersistentRecordOnLocalExit(session: ManagedSessionRecord): boolean {
  if (session.kind !== 'agent') {
    return false;
  }

  if (!session.persistOnDisconnect) {
    return true;
  }

  return process.platform === 'win32';
}

export class SessionManager {
  readonly localPtyManager = new PtyManager();

  private readonly sessions = new Map<string, ManagedSessionRecord>();
  private localSupervisorSubscriptionsInitialized = false;
  private readonly remoteSubscriptions = new Map<
    string,
    {
      offData: () => void;
      offExit: () => void;
    }
  >();
  private readonly remoteSubscriptionPromises = new Map<string, Promise<void>>();
  private readonly remoteSubscriptionVersions = new Map<string, number>();
  private readonly remoteDisconnectSubscriptions = new Map<string, () => void>();
  private readonly remoteStatusSubscriptions = new Map<string, () => void>();
  private readonly remoteRecoveryPromises = new Map<string, Promise<void>>();

  async create(
    target: BrowserWindow | WebContents | number,
    options: SessionCreateOptions = {}
  ): Promise<SessionOpenResult> {
    const windowId = getWindowId(target);
    if (options.cwd && isRemoteVirtualPath(options.cwd)) {
      return this.createRemote(windowId, options);
    }
    return this.createLocal(windowId, options);
  }

  async attach(
    target: BrowserWindow | WebContents | number,
    options: SessionAttachOptions
  ): Promise<SessionAttachResult> {
    const windowId = getWindowId(target);
    const existing = this.sessions.get(options.sessionId);
    if (existing?.backend === 'local') {
      if (existing.localRuntime === 'supervisor') {
        return this.attachSupervisorSession(windowId, existing);
      }
      existing.attachedWindowIds.add(windowId);
      const replay = existing.replayBuffer || undefined;
      if (existing.streamState === 'buffering') {
        existing.streamState = 'attaching';
        this.activateLocalStreamAfterAttach(existing.sessionId, existing.replayBuffer?.length ?? 0);
      }
      return {
        session: this.toDescriptor(existing),
        replay,
      };
    }

    if (existing?.backend === 'remote' && existing.connectionId) {
      existing.attachedWindowIds.add(windowId);
      const status = remoteConnectionManager.getStatus(existing.connectionId);
      if (!status.connected) {
        const runtimeState = status.recoverable ? 'reconnecting' : 'dead';
        this.setSessionRuntimeState(existing.sessionId, runtimeState);
        this.emitState(
          {
            sessionId: existing.sessionId,
            state: existing.runtimeState ?? runtimeState,
          },
          new Set([windowId])
        );
        return {
          session: this.toDescriptor(existing),
          replay: existing.replayBuffer || undefined,
        };
      }

      try {
        await this.ensureRemoteSubscriptions(existing.connectionId);
        const result = await remoteConnectionManager.call<SessionAttachResult>(
          existing.connectionId,
          'session:attach',
          {
            sessionId: options.sessionId,
          }
        );
        const record = this.registerRemoteSession(windowId, existing.connectionId, result.session);
        this.setSessionRuntimeState(record.sessionId, 'live');
        record.replayBuffer = result.replay ?? '';
        return {
          session: this.toDescriptor(record),
          replay: result.replay,
        };
      } catch (error) {
        const nextStatus = remoteConnectionManager.getStatus(existing.connectionId);
        if (!nextStatus.connected) {
          const runtimeState = nextStatus.recoverable ? 'reconnecting' : 'dead';
          this.setSessionRuntimeState(existing.sessionId, runtimeState);
          this.emitState(
            {
              sessionId: existing.sessionId,
              state: existing.runtimeState ?? runtimeState,
            },
            new Set([windowId])
          );
          return {
            session: this.toDescriptor(existing),
            replay: existing.replayBuffer || undefined,
          };
        }
        throw error;
      }
    }

    if (this.shouldUseLocalSupervisorAttach(options)) {
      return this.restoreSupervisorSession(windowId, options.sessionId);
    }

    if (!options.cwd || !isRemoteVirtualPath(options.cwd)) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }

    const { connectionId } = parseRemoteVirtualPath(options.cwd);
    await this.ensureRemoteSubscriptions(connectionId);
    const result = await remoteConnectionManager.call<SessionAttachResult>(
      connectionId,
      'session:attach',
      {
        sessionId: options.sessionId,
      }
    );
    const record = this.registerRemoteSession(windowId, connectionId, result.session);
    this.setSessionRuntimeState(record.sessionId, 'live');
    record.replayBuffer = result.replay ?? '';
    return {
      session: this.toDescriptor(record),
      replay: result.replay,
    };
  }

  list(target: BrowserWindow | WebContents | number): SessionDescriptor[] {
    const windowId = getWindowId(target);
    return [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => this.toDescriptor(session));
  }

  async detach(target: BrowserWindow | WebContents | number, sessionId: string): Promise<void> {
    const windowId = getWindowId(target);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.attachedWindowIds.delete(windowId);
    if (session.backend === 'local' && session.localRuntime === 'supervisor') {
      await localSupervisorRuntime.detachSession(sessionId).catch(() => {});
      if (session.attachedWindowIds.size === 0) {
        this.sessions.delete(sessionId);
      }
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      const connectionId = session.connectionId;
      await this.ensureRemoteSubscriptions(session.connectionId);
      await remoteConnectionManager
        .call(connectionId, 'session:detach', { sessionId })
        .catch(() => {});
      if (session.attachedWindowIds.size === 0) {
        this.sessions.delete(sessionId);
        this.cleanupRemoteResourcesIfUnused(connectionId);
      }
      return;
    }

    if (session.attachedWindowIds.size > 0) {
      return;
    }

    this.localPtyManager.destroy(sessionId);
    this.sessions.delete(sessionId);
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.cleanupPersistentSessionRecord(session);

    if (session.backend === 'remote' && session.connectionId) {
      const connectionId = session.connectionId;
      const attachedWindowIds = new Set(session.attachedWindowIds);
      await this.ensureRemoteSubscriptions(session.connectionId);
      await remoteConnectionManager
        .call(connectionId, 'session:kill', { sessionId })
        .catch(() => {});
      this.sessions.delete(sessionId);
      this.cleanupRemoteResourcesIfUnused(connectionId);
      this.emitState(
        {
          sessionId,
          state: 'dead',
        },
        attachedWindowIds
      );
      this.emitExit(
        {
          sessionId,
          exitCode: 0,
        },
        attachedWindowIds
      );
      return;
    }

    if (session.localRuntime === 'supervisor') {
      const attachedWindowIds = new Set(session.attachedWindowIds);
      await localSupervisorRuntime.killSession(sessionId).catch(() => {});
      this.sessions.delete(sessionId);
      this.emitExit(
        {
          sessionId,
          exitCode: 0,
        },
        attachedWindowIds
      );
      return;
    }

    const attachedWindowIds = new Set(session.attachedWindowIds);
    this.localPtyManager.destroy(sessionId);
    this.sessions.delete(sessionId);
    this.emitExit(
      {
        sessionId,
        exitCode: 0,
      },
      attachedWindowIds
    );
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      if (session.runtimeState && session.runtimeState !== 'live') {
        return;
      }
      const { connectionId } = session;
      void this.ensureRemoteSubscriptions(connectionId)
        .then(() =>
          remoteConnectionManager.call(connectionId, 'session:write', { sessionId, data })
        )
        .catch(() => {
          this.setSessionRuntimeState(sessionId, 'reconnecting');
        });
      return;
    }

    if (session.localRuntime === 'supervisor') {
      void Promise.resolve(localSupervisorRuntime.writeSession(sessionId, data)).catch(() => {
        this.emitState(
          {
            sessionId,
            state: 'dead',
          },
          new Set(session.attachedWindowIds)
        );
      });
      return;
    }

    this.localPtyManager.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      if (session.runtimeState && session.runtimeState !== 'live') {
        return;
      }
      const { connectionId } = session;
      void this.ensureRemoteSubscriptions(connectionId)
        .then(() =>
          remoteConnectionManager.call(connectionId, 'session:resize', {
            sessionId,
            cols,
            rows,
          })
        )
        .catch(() => {
          this.setSessionRuntimeState(sessionId, 'reconnecting');
        });
      return;
    }

    if (session.localRuntime === 'supervisor') {
      void Promise.resolve(localSupervisorRuntime.resizeSession(sessionId, cols, rows)).catch(
        () => {
          this.emitState(
            {
              sessionId,
              state: 'dead',
            },
            new Set(session.attachedWindowIds)
          );
        }
      );
      return;
    }

    this.localPtyManager.resize(sessionId, cols, rows);
  }

  async getActivity(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.backend === 'remote' && session.connectionId) {
      await this.ensureRemoteSubscriptions(session.connectionId);
      return remoteConnectionManager
        .call<boolean>(session.connectionId, 'session:getActivity', { sessionId })
        .catch(() => false);
    }

    if (session.localRuntime === 'supervisor') {
      return Promise.resolve(localSupervisorRuntime.getSessionActivity(sessionId)).catch(
        () => false
      );
    }

    return this.localPtyManager.getProcessActivity(sessionId);
  }

  async getSessionRuntimeInfo(sessionId: string): Promise<SessionRuntimeInfo | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.backend === 'remote') {
      return {
        pid: null,
        isActive: null,
        isAlive: null,
      };
    }

    if (session.localRuntime === 'supervisor') {
      const [isActive, isAlive] = await Promise.all([
        Promise.resolve(localSupervisorRuntime.getSessionActivity(sessionId)).catch(() => null),
        Promise.resolve(localSupervisorRuntime.hasSession(sessionId)).catch(() => null),
      ]);
      return {
        pid: null,
        isActive,
        isAlive,
      };
    }

    return this.localPtyManager.getProcessInfo(sessionId);
  }

  async detachWindowSessions(windowId: number): Promise<void> {
    const ids = [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => session.sessionId);

    await Promise.allSettled(ids.map((sessionId) => this.detach(windowId, sessionId)));
  }

  async killByWorkdir(workdir: string): Promise<void> {
    const caseInsensitivePaths = process.platform === 'win32' || process.platform === 'darwin';
    const normalizeForComparison = (value: string) => {
      const normalized = value.replace(/\\/g, '/');
      return caseInsensitivePaths ? normalized.toLowerCase() : normalized;
    };

    const normalized = normalizeForComparison(workdir);
    const matches = [...this.sessions.values()].filter((session) => {
      const sessionCwd = normalizeForComparison(session.cwd);
      return sessionCwd === normalized || sessionCwd.startsWith(`${normalized}/`);
    });

    await Promise.allSettled(matches.map((session) => this.kill(session.sessionId)));
  }

  destroyAllLocal(): void {
    this.localPtyManager.destroyAll();
  }

  async destroyAllLocalAndWait(): Promise<void> {
    await this.localPtyManager.destroyAllAndWait();
  }

  private async createLocal(
    windowId: number,
    options: SessionCreateOptions
  ): Promise<SessionOpenResult> {
    if (this.shouldUseLocalSupervisor(options)) {
      return this.createSupervisorSession(windowId, options);
    }

    const kind = options.kind ?? 'terminal';
    const cwd = options.cwd || process.env.HOME || process.env.USERPROFILE || '/';
    const sessionId = this.localPtyManager.allocateId();
    const record: ManagedSessionRecord = {
      sessionId,
      backend: 'local',
      localRuntime: 'pty',
      kind,
      cwd,
      persistOnDisconnect: Boolean(options.persistOnDisconnect),
      createdAt: now(),
      metadata: options.metadata,
      attachedWindowIds: new Set([windowId]),
      replayBuffer: '',
      streamState: 'buffering',
    };
    this.sessions.set(sessionId, record);

    try {
      this.localPtyManager.create(
        options,
        (data) => this.handleLocalData(sessionId, data),
        (exitCode, signal) => {
          this.handleLocalExit(sessionId, exitCode, signal);
        },
        sessionId
      );
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }

    return {
      session: this.toDescriptor(record),
    };
  }

  private shouldUseLocalSupervisor(options: SessionCreateOptions): boolean {
    return (
      process.platform === 'win32' &&
      options.kind === 'agent' &&
      Boolean(options.persistOnDisconnect)
    );
  }

  private shouldUseLocalSupervisorAttach(options: SessionAttachOptions): boolean {
    return (
      process.platform === 'win32' && Boolean(options.cwd && !isRemoteVirtualPath(options.cwd))
    );
  }

  private async createSupervisorSession(
    windowId: number,
    options: SessionCreateOptions
  ): Promise<SessionOpenResult> {
    this.ensureLocalSupervisorSubscriptions();
    const sessionId = `supervisor-${randomUUID()}`;
    const result = await localSupervisorRuntime.createSession({
      sessionId,
      options,
    });
    const record: ManagedSessionRecord = {
      ...result.session,
      backend: 'local',
      localRuntime: 'supervisor',
      attachedWindowIds: new Set([windowId]),
      replayBuffer: '',
      streamState: 'live',
    };
    this.sessions.set(record.sessionId, record);
    return {
      session: this.toDescriptor(record),
    };
  }

  private async attachSupervisorSession(
    windowId: number,
    session: ManagedSessionRecord
  ): Promise<SessionAttachResult> {
    this.ensureLocalSupervisorSubscriptions();
    const result = await localSupervisorRuntime.attachSession(session.sessionId);
    session.attachedWindowIds.add(windowId);
    session.cwd = result.session.cwd;
    session.kind = result.session.kind;
    session.persistOnDisconnect = result.session.persistOnDisconnect;
    session.createdAt = result.session.createdAt;
    session.metadata = result.session.metadata;
    session.localRuntime = 'supervisor';
    session.replayBuffer = result.replay ?? '';
    session.streamState = 'live';
    return {
      session: this.toDescriptor(session),
      replay: result.replay,
    };
  }

  private async restoreSupervisorSession(
    windowId: number,
    sessionId: string
  ): Promise<SessionAttachResult> {
    this.ensureLocalSupervisorSubscriptions();
    const result = await localSupervisorRuntime.attachSession(sessionId);
    const record: ManagedSessionRecord = {
      ...result.session,
      backend: 'local',
      localRuntime: 'supervisor',
      attachedWindowIds: new Set([windowId]),
      replayBuffer: result.replay ?? '',
      streamState: 'live',
    };
    this.sessions.set(sessionId, record);
    return {
      session: this.toDescriptor(record),
      replay: result.replay,
    };
  }

  private async createRemote(
    windowId: number,
    options: SessionCreateOptions
  ): Promise<SessionOpenResult> {
    const { connectionId, remotePath } = parseRemoteVirtualPath(options.cwd!);
    await this.ensureRemoteSubscriptions(connectionId);
    const result = await remoteConnectionManager.call<SessionOpenResult>(
      connectionId,
      'session:createAndAttach',
      {
        options: {
          ...options,
          cwd: remotePath,
          spawnCwd: undefined,
          shellConfig: options.shellConfig,
          shell: options.shell,
          persistOnDisconnect: options.persistOnDisconnect ?? true,
        },
      }
    );
    const record = this.registerRemoteSession(windowId, connectionId, result.session);
    record.replayBuffer = result.replay ?? '';
    return {
      session: this.toDescriptor(record),
      replay: result.replay,
    };
  }

  private registerRemoteSession(
    windowId: number,
    connectionId: string,
    descriptor: SessionDescriptor
  ): ManagedSessionRecord {
    const existing = this.sessions.get(descriptor.sessionId);
    if (existing) {
      existing.attachedWindowIds.add(windowId);
      existing.connectionId = connectionId;
      existing.cwd = descriptor.cwd;
      existing.kind = descriptor.kind;
      existing.persistOnDisconnect = descriptor.persistOnDisconnect;
      existing.metadata = descriptor.metadata;
      existing.runtimeState = existing.runtimeState ?? 'live';
      return existing;
    }

    const record: ManagedSessionRecord = {
      ...descriptor,
      backend: 'remote',
      connectionId,
      runtimeState: 'live',
      attachedWindowIds: new Set([windowId]),
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  private handleLocalExit(sessionId: string, exitCode: number, signal?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.cleanupPersistentSessionRecord(session);

    const event: SessionExitEvent = {
      sessionId,
      exitCode,
      signal,
    };

    if (session.backend === 'local' && session.streamState !== 'live') {
      session.pendingExit = event;
      return;
    }

    const attachedWindowIds = new Set(session.attachedWindowIds);
    this.sessions.delete(sessionId);
    this.emitExit(event, attachedWindowIds);
  }

  private handleLocalData(sessionId: string, data: string): void {
    if (!data) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'local') {
      return;
    }

    this.appendReplayBuffer(session, data);

    if (session.streamState === 'live') {
      this.emitData(sessionId, data, new Set(session.attachedWindowIds));
    }
  }

  private activateLocalStreamAfterAttach(sessionId: string, replayCursor: number): void {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (!session || session.backend !== 'local' || session.streamState !== 'attaching') {
        return;
      }

      if (session.attachedWindowIds.size === 0) {
        session.streamState = 'buffering';
        return;
      }

      session.streamState = 'live';
      const replayBuffer = session.replayBuffer || '';
      const delta = replayBuffer.slice(replayCursor);
      if (delta) {
        this.emitData(sessionId, delta, new Set(session.attachedWindowIds));
      }

      if (session.pendingExit) {
        const pendingExit = session.pendingExit;
        const attachedWindowIds = new Set(session.attachedWindowIds);
        this.sessions.delete(sessionId);
        this.emitExit(pendingExit, attachedWindowIds);
      }
    }, 0);
  }

  private ensureLocalSupervisorSubscriptions(): void {
    if (this.localSupervisorSubscriptionsInitialized) {
      return;
    }

    this.localSupervisorSubscriptionsInitialized = true;

    localSupervisorRuntime.onData((event) => {
      const session = this.sessions.get(event.sessionId);
      if (!session || session.localRuntime !== 'supervisor') {
        return;
      }

      this.appendReplayBuffer(session, event.data);
      this.emitData(event.sessionId, event.data, new Set(session.attachedWindowIds));
    });

    localSupervisorRuntime.onExit((event) => {
      this.handleLocalExit(event.sessionId, event.exitCode, event.signal);
    });

    localSupervisorRuntime.onDisconnect(() => {
      // Supervisor-backed sessions remain alive without renderer attachments.
    });
  }

  private async ensureRemoteSubscriptions(connectionId: string): Promise<void> {
    this.ensureRemoteLifecycleSubscriptions(connectionId);
    if (this.remoteSubscriptions.has(connectionId)) {
      return;
    }

    const pending = this.remoteSubscriptionPromises.get(connectionId);
    if (pending) {
      await pending;
      return;
    }

    const subscriptionPromise = (async () => {
      const version = this.remoteSubscriptionVersions.get(connectionId) ?? 0;
      const offData = await remoteConnectionManager.addEventListener(
        connectionId,
        'remote:session:data',
        (payload) => {
          const event = payload as SessionDataEvent;
          const session = this.sessions.get(event.sessionId);
          if (session?.backend === 'remote') {
            this.appendReplayBuffer(session, event.data);
          }
          this.emitData(event.sessionId, event.data);
        }
      );

      let offExit: (() => void) | null = null;
      try {
        offExit = await remoteConnectionManager.addEventListener(
          connectionId,
          'remote:session:exit',
          (payload) => {
            const event = payload as SessionExitEvent;
            const session = this.sessions.get(event.sessionId);
            const connectionId = session?.connectionId;
            const attachedWindowIds = session
              ? new Set(session.attachedWindowIds)
              : new Set<number>();
            if (session) {
              this.cleanupPersistentSessionRecord(session);
            }
            this.sessions.delete(event.sessionId);
            if (connectionId) {
              this.cleanupRemoteResourcesIfUnused(connectionId);
            }
            this.emitState(
              {
                sessionId: event.sessionId,
                state: 'dead',
              },
              attachedWindowIds
            );
            this.emitExit(event, attachedWindowIds);
          }
        );
      } catch (error) {
        try {
          offData();
        } catch {
          // Ignore
        }
        throw error;
      }

      if (
        (this.remoteSubscriptionVersions.get(connectionId) ?? 0) !== version ||
        this.remoteSubscriptions.has(connectionId) ||
        !remoteConnectionManager.getStatus(connectionId).connected
      ) {
        try {
          offData();
        } catch {
          // Ignore
        }
        try {
          offExit();
        } catch {
          // Ignore
        }
        return;
      }

      this.remoteSubscriptions.set(connectionId, {
        offData,
        offExit,
      });
    })().finally(() => {
      if (this.remoteSubscriptionPromises.get(connectionId) === subscriptionPromise) {
        this.remoteSubscriptionPromises.delete(connectionId);
      }
    });

    this.remoteSubscriptionPromises.set(connectionId, subscriptionPromise);
    await subscriptionPromise;
  }

  private async handleRemoteStatusChange(
    connectionId: string,
    status: { connected: boolean; phase?: string; recoverable?: boolean }
  ): Promise<void> {
    const previous = this.remoteRecoveryPromises.get(connectionId) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => this.processRemoteStatusChange(connectionId, status))
      .catch((error) => {
        console.warn('[session] Failed to recover remote sessions:', error);
      })
      .finally(() => {
        if (this.remoteRecoveryPromises.get(connectionId) === current) {
          this.remoteRecoveryPromises.delete(connectionId);
        }
      });
    this.remoteRecoveryPromises.set(connectionId, current);
    await current;
  }

  private async processRemoteStatusChange(
    connectionId: string,
    status: { connected: boolean; phase?: string; recoverable?: boolean }
  ): Promise<void> {
    const sessions = [...this.sessions.values()].filter(
      (session) => session.backend === 'remote' && session.connectionId === connectionId
    );
    if (sessions.length === 0) {
      return;
    }

    if (status.connected) {
      await this.ensureRemoteSubscriptions(connectionId);
      const remoteSessions = await remoteConnectionManager
        .call<SessionDescriptor[]>(connectionId, 'session:list', {})
        .then((items) => new Map(items.map((item) => [item.sessionId, item])))
        .catch(() => null);
      if (!remoteSessions) {
        for (const session of sessions) {
          this.setSessionRuntimeState(session.sessionId, 'reconnecting');
        }
        return;
      }
      await Promise.allSettled(
        sessions.map(async (session) => {
          if (this.sessions.get(session.sessionId) !== session) {
            return;
          }
          const remoteSession = remoteSessions.get(session.sessionId);
          if (remoteSession) {
            try {
              const restored = await remoteConnectionManager.call<SessionAttachResult>(
                connectionId,
                'session:resume',
                {
                  sessionId: session.sessionId,
                }
              );
              if (this.sessions.get(session.sessionId) !== session) {
                return;
              }
              const mergedDescriptor = restored.session ?? remoteSession;
              session.connectionId = connectionId;
              session.cwd = mergedDescriptor.cwd;
              session.kind = mergedDescriptor.kind;
              session.persistOnDisconnect = mergedDescriptor.persistOnDisconnect;
              session.metadata = mergedDescriptor.metadata;
              const replay = restored.replay ?? '';
              const delta = this.getReplayDelta(session.replayBuffer, replay);
              session.replayBuffer = replay;
              if (delta) {
                this.emitData(session.sessionId, delta, new Set(session.attachedWindowIds));
              }
              this.setSessionRuntimeState(session.sessionId, 'live');
              return;
            } catch {
              if (this.sessions.get(session.sessionId) !== session) {
                return;
              }
              if (!remoteConnectionManager.getStatus(connectionId).connected) {
                this.setSessionRuntimeState(session.sessionId, 'reconnecting');
                return;
              }
            }
          }
          this.markRemoteSessionDead(session);
        })
      );
      return;
    }

    const nextState: SessionRuntimeState = status.recoverable ? 'reconnecting' : 'dead';
    for (const session of sessions) {
      if (this.sessions.get(session.sessionId) !== session) {
        continue;
      }
      if (nextState === 'dead') {
        this.markRemoteSessionDead(session);
        continue;
      }
      this.setSessionRuntimeState(session.sessionId, nextState);
    }
  }

  private ensureRemoteLifecycleSubscriptions(connectionId: string): void {
    if (!this.remoteDisconnectSubscriptions.has(connectionId)) {
      const offDisconnect = remoteConnectionManager.onDidDisconnect(connectionId, () => {
        this.cleanupRemoteSubscription(connectionId);
      });
      this.remoteDisconnectSubscriptions.set(connectionId, offDisconnect);
    }

    if (!this.remoteStatusSubscriptions.has(connectionId)) {
      const offStatus = remoteConnectionManager.onDidStatusChange(connectionId, (status) => {
        void this.handleRemoteStatusChange(connectionId, status);
      });
      this.remoteStatusSubscriptions.set(connectionId, offStatus);
    }
  }

  private cleanupRemoteSubscription(connectionId: string): void {
    this.remoteSubscriptionVersions.set(
      connectionId,
      (this.remoteSubscriptionVersions.get(connectionId) ?? 0) + 1
    );
    const subscription = this.remoteSubscriptions.get(connectionId);
    this.remoteSubscriptions.delete(connectionId);
    if (!subscription) {
      return;
    }

    try {
      subscription.offData();
    } catch (error) {
      console.warn('[session] Failed to dispose remote data listener:', error);
    }

    try {
      subscription.offExit();
    } catch (error) {
      console.warn('[session] Failed to dispose remote exit listener:', error);
    }
  }

  private cleanupRemoteResourcesIfUnused(connectionId: string): void {
    const hasRemainingSessions = [...this.sessions.values()].some(
      (session) => session.backend === 'remote' && session.connectionId === connectionId
    );
    if (hasRemainingSessions) {
      return;
    }

    this.cleanupRemoteSubscription(connectionId);

    const offDisconnect = this.remoteDisconnectSubscriptions.get(connectionId);
    this.remoteDisconnectSubscriptions.delete(connectionId);
    try {
      offDisconnect?.();
    } catch (error) {
      console.warn('[session] Failed to dispose remote disconnect listener:', error);
    }

    const offStatus = this.remoteStatusSubscriptions.get(connectionId);
    this.remoteStatusSubscriptions.delete(connectionId);
    try {
      offStatus?.();
    } catch (error) {
      console.warn('[session] Failed to dispose remote status listener:', error);
    }

    this.remoteSubscriptionPromises.delete(connectionId);
    this.remoteSubscriptionVersions.delete(connectionId);
    this.remoteRecoveryPromises.delete(connectionId);
  }

  private appendReplayBuffer(session: ManagedSessionRecord, data: string): void {
    if (!data) {
      return;
    }

    const replay = `${session.replayBuffer || ''}${data}`;
    session.replayBuffer = replay.slice(-MAX_SESSION_REPLAY_CHARS);
  }

  private getReplayDelta(previousReplay: string | undefined, nextReplay: string): string {
    if (!nextReplay) {
      return '';
    }

    if (!previousReplay) {
      return nextReplay;
    }

    const overlap = this.getReplayOverlap(previousReplay, nextReplay);
    return nextReplay.slice(overlap);
  }

  private getReplayOverlap(previousReplay: string, nextReplay: string): number {
    const previousTail = previousReplay.slice(-nextReplay.length);
    if (previousTail.length === 0 || nextReplay.length === 0) {
      return 0;
    }

    const prefixTable = new Array<number>(nextReplay.length).fill(0);
    for (let index = 1, matched = 0; index < nextReplay.length; ) {
      if (nextReplay[index] === nextReplay[matched]) {
        matched += 1;
        prefixTable[index] = matched;
        index += 1;
        continue;
      }

      if (matched > 0) {
        matched = prefixTable[matched - 1] ?? 0;
        continue;
      }

      prefixTable[index] = 0;
      index += 1;
    }

    let matched = 0;
    for (let index = 0; index < previousTail.length; index += 1) {
      const char = previousTail[index];
      while (matched > 0 && nextReplay[matched] !== char) {
        matched = prefixTable[matched - 1] ?? 0;
      }
      if (nextReplay[matched] !== char) {
        continue;
      }

      matched += 1;
      if (matched === nextReplay.length && index < previousTail.length - 1) {
        matched = prefixTable[matched - 1] ?? 0;
      }
    }

    return matched;
  }

  private markRemoteSessionDead(session: ManagedSessionRecord): void {
    if (this.sessions.get(session.sessionId) !== session) {
      return;
    }

    const attachedWindowIds = new Set(session.attachedWindowIds);
    const connectionId = session.connectionId;
    this.cleanupPersistentSessionRecord(session);
    this.sessions.delete(session.sessionId);
    if (connectionId) {
      this.cleanupRemoteResourcesIfUnused(connectionId);
    }
    this.emitState(
      {
        sessionId: session.sessionId,
        state: 'dead',
      },
      attachedWindowIds
    );
    this.emitExit(
      {
        sessionId: session.sessionId,
        exitCode: 1,
      },
      attachedWindowIds
    );
  }

  private setSessionRuntimeState(sessionId: string, state: SessionRuntimeState): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'remote') {
      return;
    }
    if (session.runtimeState === state) {
      return;
    }
    session.runtimeState = state;
    this.emitState({ sessionId, state });
  }

  private cleanupPersistentSessionRecord(session: ManagedSessionRecord): void {
    if (!shouldAbandonPersistentRecordOnLocalExit(session)) {
      return;
    }

    const uiSessionId = getPersistentUiSessionId(session.metadata);
    if (!uiSessionId) {
      return;
    }

    void persistentAgentSessionService.abandonSession(uiSessionId).catch((error) => {
      console.warn('[session] Failed to abandon persistent agent session record:', error);
    });
  }

  private emitData(sessionId: string, data: string, windowIds?: Set<number>): void {
    if (!data) {
      return;
    }

    this.emitToWindows(
      windowIds ?? this.sessions.get(sessionId)?.attachedWindowIds,
      'session:data',
      {
        sessionId,
        data,
      }
    );
  }

  private emitExit(event: SessionExitEvent, windowIds?: Set<number>): void {
    this.emitToWindows(windowIds, 'session:exit', event);
  }

  private emitState(event: SessionStateEvent, windowIds?: Set<number>): void {
    this.emitToWindows(
      windowIds ?? this.sessions.get(event.sessionId)?.attachedWindowIds,
      'session:state',
      event
    );
  }

  private emitToWindows(
    windowIds: Set<number> | undefined,
    channel: 'session:data' | 'session:exit' | 'session:state',
    payload: SessionDataEvent | SessionExitEvent | SessionStateEvent
  ): void {
    if (!windowIds || windowIds.size === 0) {
      return;
    }

    for (const windowId of windowIds) {
      const window = BrowserWindow.fromId(windowId);
      if (!window || window.isDestroyed()) {
        continue;
      }
      const resolvedChannel =
        channel === 'session:data'
          ? IPC_CHANNELS.SESSION_DATA
          : channel === 'session:exit'
            ? IPC_CHANNELS.SESSION_EXIT
            : IPC_CHANNELS.SESSION_STATE;
      if (window.webContents.isDestroyed()) {
        continue;
      }
      try {
        window.webContents.send(resolvedChannel, payload);
      } catch (error) {
        console.warn('[session] Failed to emit session event to window:', error);
      }
    }
  }

  private toDescriptor(session: ManagedSessionRecord): SessionDescriptor {
    return {
      sessionId: session.sessionId,
      backend: session.backend,
      kind: session.kind,
      cwd: session.cwd,
      persistOnDisconnect: session.persistOnDisconnect,
      createdAt: session.createdAt,
      runtimeState: session.runtimeState ?? 'live',
      metadata: session.metadata,
    };
  }
}

export const sessionManager = new SessionManager();
