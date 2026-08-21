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
  type SessionOutputResyncEvent,
  type SessionRuntimeInfo,
  type SessionRuntimeState,
  type SessionStateEvent,
  type SessionTranscriptHealth,
  type SessionTranscriptPage,
  type SessionTranscriptPageRequest,
} from '@shared/types';
import {
  type AgentStartupTimelineLogger,
  createAgentStartupTimelineLogger,
} from '@shared/utils/agentStartupTimeline';
import { getSessionReplayCharLimit } from '@shared/utils/agentTerminalHistoryPolicy';
import { takeUtf16Tail } from '@shared/utils/utf16Tail';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';
import { BrowserWindow, type WebContents } from 'electron';
import log from '../../utils/logger';
import {
  registerMainProcessDiagnosticsCollector,
  requestMainProcessDiagnosticsCapture,
} from '../../utils/mainProcessDiagnostics';
import { codexRuntimeHomeService } from '../agent/CodexRuntimeHomeService';
import { tmuxDetector } from '../cli/TmuxDetector';
import { remoteConnectionManager } from '../remote/RemoteConnectionManager';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '../remote/RemotePath';
import { PtyManager } from '../terminal/PtyManager';
import { localSupervisorRuntime } from './LocalSupervisorRuntime';
import { persistentAgentSessionService } from './PersistentAgentSessionService';
import { SessionOutputBatcher } from './SessionOutputBatcher';
import { SessionReplayBuffer } from './SessionReplayBuffer';
import {
  MAX_SESSION_TRANSCRIPT_PAGE_BYTES,
  type SessionTranscriptArchivePage,
  sessionTranscriptArchive,
} from './SessionTranscriptArchive';

interface ManagedSessionRecord extends SessionDescriptor {
  attachedWindowIds: Set<number>;
  localRuntime?: 'pty' | 'supervisor';
  connectionId?: string;
  hostSession?: SessionCreateOptions['hostSession'];
  runtimeState?: SessionRuntimeState;
  replayBuffer?: SessionReplayBuffer;
  pendingHostReplayDedup?: boolean;
  pendingHostReplayCursor?: number;
  pendingHostReplayScreenBuffer?: string;
  pendingHostReplayScreenMatched?: boolean;
  pendingHostReplayScreenFlushTimer?: ReturnType<typeof setTimeout>;
  streamState?: 'buffering' | 'attaching' | 'live';
  pendingExit?: SessionExitEvent;
  transcriptArchiveState?: 'ready' | 'degraded';
  transcriptArchiveId?: string;
}

interface SessionPerformanceDiagnostics {
  sessionCount: number;
  backendCounts: Record<string, number>;
  runtimeStateCounts: Record<string, number>;
  kindCounts: Record<string, number>;
  suspendedWindowCount: number;
  attachedWindowCount: number;
  outputSuspendedSessionCount: number;
  sessionOutputBatcher: ReturnType<SessionOutputBatcher['getDiagnostics']>;
  transcript: {
    pendingAppendBytes: number;
  };
  localPty: ReturnType<PtyManager['getDiagnosticsSummary']>;
}

const SESSION_RESOURCE_EXHAUSTION_ERROR_CODES = new Set(['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM']);
const DEFAULT_SESSION_TRANSCRIPT_PAGE_BYTES = 64 * 1024;
const TERMINAL_ESCAPE = String.fromCharCode(0x1b);
const TERMINAL_BELL = String.fromCharCode(0x07);
const PENDING_HOST_REPLAY_SCREEN_BUFFER_CHAR_LIMIT = 64 * 1024;
const PENDING_HOST_REPLAY_SCREEN_FLUSH_DELAY_MS = 100;
type TmuxHostSessionCreateOptions = SessionCreateOptions & {
  hostSession: {
    kind: 'tmux';
    serverName: string;
    sessionName: string;
  };
};

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

function resolveBrowserWindow(target: BrowserWindow | WebContents | number): BrowserWindow | null {
  if (typeof target === 'number') {
    return BrowserWindow.fromId(target);
  }

  if (target instanceof BrowserWindow) {
    return target;
  }

  return BrowserWindow.fromWebContents(target);
}

function now(): number {
  return Date.now();
}

function isSessionResourceExhaustionError(error: unknown): error is NodeJS.ErrnoException {
  const nodeError = error as NodeJS.ErrnoException;
  return (
    typeof nodeError?.code === 'string' &&
    SESSION_RESOURCE_EXHAUSTION_ERROR_CODES.has(nodeError.code)
  );
}

function getPersistentUiSessionId(
  metadata: Record<string, unknown> | undefined
): string | undefined {
  const uiSessionId = metadata?.uiSessionId;
  return typeof uiSessionId === 'string' && uiSessionId.length > 0 ? uiSessionId : undefined;
}

function getCodexRuntimeHomePath(
  metadata: Record<string, unknown> | undefined
): string | undefined {
  const runtimeHome = metadata?.codexRuntimeHome;
  if (!runtimeHome || typeof runtimeHome !== 'object' || Array.isArray(runtimeHome)) {
    return undefined;
  }

  const homePath = (runtimeHome as { homePath?: unknown }).homePath;
  return typeof homePath === 'string' && homePath.length > 0 ? homePath : undefined;
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

function isDisposedWindowSendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Render frame was disposed') ||
    error.message.includes('Object has been destroyed')
  );
}

function isWebContentsUnavailable(webContents: WebContents): boolean {
  if (webContents.isDestroyed()) {
    return true;
  }

  try {
    const mainFrame = webContents.mainFrame;
    return mainFrame.isDestroyed() || mainFrame.detached;
  } catch (error) {
    if (isDisposedWindowSendError(error)) {
      return true;
    }

    console.warn('[session] Failed to inspect window frame before event delivery:', error);
    return true;
  }
}

export class SessionManager {
  readonly localPtyManager = new PtyManager();

  private readonly sessions = new Map<string, ManagedSessionRecord>();
  private readonly transcriptArchiveIdsByBackendSessionId = new Map<string, string>();
  private readonly suspendedWindowIds = new Set<number>();
  private localSupervisorSubscriptionsInitialized = false;
  private readonly remoteSubscriptions = new Map<
    string,
    {
      offData: () => void;
      offExit: () => void;
      offOutputResync: () => void;
    }
  >();
  private readonly remoteSubscriptionPromises = new Map<string, Promise<void>>();
  private readonly remoteSubscriptionVersions = new Map<string, number>();
  private readonly remoteDisconnectSubscriptions = new Map<string, () => void>();
  private readonly remoteStatusSubscriptions = new Map<string, () => void>();
  private readonly remoteRecoveryPromises = new Map<string, Promise<void>>();
  private readonly windowCloseSubscriptions = new Map<
    number,
    {
      window: BrowserWindow;
      listener: () => void;
    }
  >();
  private readonly outputSuspendedSessionIdsByWindowId = new Map<number, Set<string>>();
  private readonly sessionOutputBatcher = new SessionOutputBatcher({
    deliver: (windowId, sessionId, data) => {
      this.emitToWindows(new Set([windowId]), 'session:data', { sessionId, data });
    },
    requestResync: (windowId, sessionId) => {
      this.emitSessionOutputResync(windowId, sessionId);
    },
  });

  constructor() {
    registerMainProcessDiagnosticsCollector('sessions', () => this.buildDiagnosticsSnapshot());
  }

  async create(
    target: BrowserWindow | WebContents | number,
    options: SessionCreateOptions = {}
  ): Promise<SessionOpenResult> {
    const windowId = getWindowId(target);
    this.ensureWindowCloseSubscription(target, windowId);
    this.suspendedWindowIds.delete(windowId);
    if (options.cwd && isRemoteVirtualPath(options.cwd)) {
      return this.createRemote(windowId, options).catch((error) => {
        this.cleanupWindowCloseSubscriptionIfUnused(windowId);
        throw error;
      });
    }
    return this.createLocal(windowId, options).catch((error) => {
      this.cleanupWindowCloseSubscriptionIfUnused(windowId);
      throw error;
    });
  }

  async attach(
    target: BrowserWindow | WebContents | number,
    options: SessionAttachOptions
  ): Promise<SessionAttachResult> {
    const windowId = getWindowId(target);
    this.ensureWindowCloseSubscription(target, windowId);
    this.suspendedWindowIds.delete(windowId);
    const existing = this.sessions.get(options.sessionId);
    if (existing?.backend === 'local') {
      if (existing.localRuntime === 'supervisor') {
        return this.attachSupervisorSession(windowId, existing);
      }
      existing.attachedWindowIds.add(windowId);
      const replay = this.getReplayBufferText(existing) || undefined;
      if (existing.streamState === 'buffering') {
        existing.streamState = 'attaching';
        this.activateLocalStreamAfterAttach(
          existing.sessionId,
          this.getReplayBufferLength(existing)
        );
      }
      return {
        session: this.toDescriptor(existing),
        replay,
      };
    }

    if (existing?.backend === 'remote' && existing.connectionId) {
      const wasAttached = existing.attachedWindowIds.has(windowId);
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
          replay: this.getReplayBufferText(existing) || undefined,
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
        this.replaceReplayBuffer(record, result.replay ?? '');
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
            replay: this.getReplayBufferText(existing) || undefined,
          };
        }
        if (!wasAttached) {
          existing.attachedWindowIds.delete(windowId);
          this.sessionOutputBatcher.discard(windowId, existing.sessionId);
          this.clearOutputSuspension(windowId, existing.sessionId);
          this.cleanupWindowCloseSubscriptionIfUnused(windowId);
        }
        throw error;
      }
    }

    if (this.shouldUseLocalSupervisorAttach(options)) {
      return this.restoreSupervisorSession(windowId, options.sessionId).catch((error) => {
        this.cleanupWindowCloseSubscriptionIfUnused(windowId);
        throw error;
      });
    }

    if (!options.cwd || !isRemoteVirtualPath(options.cwd)) {
      this.cleanupWindowCloseSubscriptionIfUnused(windowId);
      throw new Error(`Session not found: ${options.sessionId}`);
    }

    const { connectionId } = parseRemoteVirtualPath(options.cwd);
    try {
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
      this.replaceReplayBuffer(record, result.replay ?? '');
      return {
        session: this.toDescriptor(record),
        replay: result.replay,
      };
    } catch (error) {
      this.cleanupWindowCloseSubscriptionIfUnused(windowId);
      throw error;
    }
  }

  list(target: BrowserWindow | WebContents | number): SessionDescriptor[] {
    const windowId = getWindowId(target);
    return [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => this.toDescriptor(session));
  }

  listActiveCodexRuntimeHomePaths(): string[] {
    const homePaths = new Set<string>();
    for (const session of this.sessions.values()) {
      const homePath = getCodexRuntimeHomePath(session.metadata);
      if (homePath) {
        homePaths.add(homePath);
      }
    }
    return [...homePaths];
  }

  async detach(target: BrowserWindow | WebContents | number, sessionId: string): Promise<void> {
    const windowId = getWindowId(target);
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.cleanupWindowCloseSubscriptionIfUnused(windowId);
      return;
    }

    session.attachedWindowIds.delete(windowId);
    this.sessionOutputBatcher.discard(windowId, sessionId);
    this.clearOutputSuspension(windowId, sessionId);
    this.cleanupWindowCloseSubscriptionIfUnused(windowId);
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

    if (session.backend === 'remote' && session.connectionId) {
      const connectionId = session.connectionId;
      const attachedWindowIds = new Set(session.attachedWindowIds);
      await this.cleanupPersistentSessionForExplicitTermination(session);
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
      const supervisorTerminated = await localSupervisorRuntime
        .killSession(sessionId)
        .then(() => true)
        .catch(() => false);
      await this.cleanupPersistentSessionForExplicitTermination(session);
      if (supervisorTerminated) {
        await this.releaseCodexRuntimeHomeForExplicitTermination(session);
      }
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
    this.sessions.delete(sessionId);
    const ptyTerminationResult = await this.localPtyManager.destroyAndWait(sessionId);
    await this.flushLocalAgentTranscript(session);
    await this.cleanupPersistentSessionForExplicitTermination(session);
    if (ptyTerminationResult === 'exited') {
      await this.releaseCodexRuntimeHomeForExplicitTermination(session);
    }
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

    try {
      this.localPtyManager.resize(sessionId, cols, rows);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      console.error('[session] Local session resize failed', {
        sessionId,
        kind: session.kind,
        cwd: session.cwd,
        backend: session.backend,
        localRuntime: session.localRuntime ?? null,
        runtimeState: session.runtimeState ?? 'live',
        attachedWindowIds: Array.from(session.attachedWindowIds),
        cols,
        rows,
        errorCode: typeof nodeError.code === 'string' ? nodeError.code : null,
      });
      throw error;
    }
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

  getSessionDescriptor(sessionId: string): SessionDescriptor | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return this.toDescriptor(session);
  }

  async getTranscriptPage(request: SessionTranscriptPageRequest): Promise<SessionTranscriptPage> {
    const maxBytes = this.resolveSessionTranscriptPageSize(request.maxBytes);
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      try {
        const transcriptArchiveId =
          this.transcriptArchiveIdsByBackendSessionId.get(request.sessionId) ?? request.sessionId;
        const page = await sessionTranscriptArchive.readPage({
          sessionId: transcriptArchiveId,
          beforeByteOffset: request.beforeByteOffset,
          maxBytes,
        });
        return this.toSessionTranscriptPage(null, page);
      } catch {
        return {
          text: '',
          totalBytes: 0,
          health: 'unavailable',
        };
      }
    }

    if (session.kind !== 'agent') {
      return {
        text: '',
        totalBytes: 0,
        health: 'unavailable',
      };
    }

    try {
      const page = await this.readTranscriptArchivePage(session, {
        sessionId: request.sessionId,
        beforeByteOffset: request.beforeByteOffset,
        maxBytes,
      });
      return this.toSessionTranscriptPage(session, page);
    } catch (error) {
      console.warn('[session] Failed to read agent transcript archive:', {
        sessionId: session.sessionId,
        backend: session.backend,
        localRuntime: session.localRuntime ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildTranscriptFallback(session, 'degraded');
    }
  }

  acknowledgeOutputResync(target: BrowserWindow | WebContents | number, sessionId: string): void {
    this.sessionOutputBatcher.acknowledgeResync(getWindowId(target), sessionId);
  }

  setOutputDelivery(
    target: BrowserWindow | WebContents | number,
    sessionId: string,
    isVisible: boolean
  ): void {
    const windowId = getWindowId(target);
    const session = this.sessions.get(sessionId);
    if (!session || !session.attachedWindowIds.has(windowId)) {
      return;
    }
    const suspendedSessionIds =
      this.outputSuspendedSessionIdsByWindowId.get(windowId) ?? new Set<string>();

    if (!isVisible) {
      suspendedSessionIds.add(sessionId);
      this.outputSuspendedSessionIdsByWindowId.set(windowId, suspendedSessionIds);
      this.sessionOutputBatcher.discard(windowId, sessionId);
      return;
    }

    const wasSuspended = suspendedSessionIds.delete(sessionId);
    if (suspendedSessionIds.size === 0) {
      this.outputSuspendedSessionIdsByWindowId.delete(windowId);
    }
    if (wasSuspended) {
      this.sessionOutputBatcher.requestResync(windowId, sessionId);
    }
  }

  private resolveSessionTranscriptPageSize(maxBytes: number | undefined): number {
    const resolved = maxBytes ?? DEFAULT_SESSION_TRANSCRIPT_PAGE_BYTES;
    if (
      !Number.isSafeInteger(resolved) ||
      resolved <= 0 ||
      resolved > MAX_SESSION_TRANSCRIPT_PAGE_BYTES
    ) {
      throw new RangeError(`Invalid session transcript page size: ${resolved}`);
    }
    return resolved;
  }

  private async readTranscriptArchivePage(
    session: ManagedSessionRecord,
    request: {
      sessionId: string;
      beforeByteOffset?: number;
      maxBytes: number;
    }
  ): Promise<SessionTranscriptArchivePage> {
    if (session.backend === 'remote') {
      if (!session.connectionId) {
        throw new Error(`Remote session has no connection: ${session.sessionId}`);
      }
      await this.ensureRemoteSubscriptions(session.connectionId);
      return remoteConnectionManager.call<SessionTranscriptArchivePage>(
        session.connectionId,
        'session:transcript:read',
        request
      );
    }

    if (session.localRuntime === 'supervisor') {
      return localSupervisorRuntime.getTranscriptPage(request);
    }

    return sessionTranscriptArchive.readPage({
      ...request,
      sessionId: session.transcriptArchiveId ?? request.sessionId,
    });
  }

  private toSessionTranscriptPage(
    session: ManagedSessionRecord | null,
    page: SessionTranscriptArchivePage
  ): SessionTranscriptPage {
    const health: SessionTranscriptHealth =
      session?.transcriptArchiveState === 'degraded' ? 'degraded' : page.health;
    if (session && health === 'unavailable' && this.getReplayBufferLength(session) > 0) {
      return this.buildTranscriptFallback(session, 'degraded');
    }

    return {
      text: page.text,
      ...(page.hasMore ? { nextBeforeByteOffset: page.startByteOffset } : {}),
      totalBytes: page.totalBytes,
      health,
    };
  }

  private buildTranscriptFallback(
    session: ManagedSessionRecord,
    health: SessionTranscriptHealth
  ): SessionTranscriptPage {
    const text = this.getReplayBufferText(session);
    return {
      text,
      totalBytes: Buffer.byteLength(text, 'utf8'),
      health,
    };
  }

  async detachWindowSessions(windowId: number): Promise<void> {
    this.suspendedWindowIds.delete(windowId);
    const ids = [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => session.sessionId);

    await Promise.allSettled(ids.map((sessionId) => this.detach(windowId, sessionId)));
    this.cleanupWindowCloseSubscriptionIfUnused(windowId);
  }

  async killByWorkdir(workdir: string): Promise<void> {
    const platform =
      process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';

    const normalized = normalizeWorkspaceKey(workdir, platform);
    const matches = [...this.sessions.values()].filter((session) => {
      const sessionCwd = normalizeWorkspaceKey(session.cwd, platform);
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

    let startupLabel = options.hostSession?.sessionName ?? options.cwd ?? 'pending';
    const startupLogger =
      options.kind === 'agent'
        ? createAgentStartupTimelineLogger({
            source: 'main',
            getLabel: () => startupLabel,
            log: (message) => log.info(message),
          })
        : null;
    startupLogger?.markStage('session-create-start');

    if (this.shouldEnsureTmuxHostHealth(options)) {
      let healthy = false;
      try {
        startupLogger?.markStage('tmux-healthcheck-start');
        healthy = await tmuxDetector.ensureServerHealthy(options.hostSession.serverName);
        startupLogger?.markStage('tmux-healthcheck-done');
      } catch (error) {
        if (isSessionResourceExhaustionError(error)) {
          const diagnosticsId = requestMainProcessDiagnosticsCapture({
            event: 'session-tmux-healthcheck-resource-exhausted',
            context: {
              windowId,
              cwd: options.cwd ?? null,
              kind: options.kind ?? 'terminal',
              serverName: options.hostSession.serverName,
              sessionName: options.hostSession.sessionName,
              errorCode: error.code,
            },
            error,
            throttleKey: `session-tmux-healthcheck-resource-exhausted:${options.hostSession.serverName}`,
          });
          console.error('[session] Tmux host health check failed due to resource exhaustion', {
            diagnosticsId,
            windowId,
            cwd: options.cwd ?? null,
            kind: options.kind ?? 'terminal',
            serverName: options.hostSession.serverName,
            sessionName: options.hostSession.sessionName,
            errorCode: error.code,
          });
          throw new Error(
            `System resources exhausted while checking tmux server: ${options.hostSession.serverName}`
          );
        }
        throw error;
      }
      if (!healthy) {
        const diagnosticsId = requestMainProcessDiagnosticsCapture({
          event: 'session-tmux-recovery-failed',
          context: {
            windowId,
            cwd: options.cwd ?? null,
            kind: options.kind ?? 'terminal',
            serverName: options.hostSession.serverName,
            sessionName: options.hostSession.sessionName,
          },
          throttleKey: `session-tmux-recovery-failed:${options.hostSession.serverName}`,
          level: 'warn',
        });
        console.error('[session] Tmux host recovery failed', {
          diagnosticsId,
          windowId,
          cwd: options.cwd ?? null,
          kind: options.kind ?? 'terminal',
          serverName: options.hostSession.serverName,
          sessionName: options.hostSession.sessionName,
        });
        throw new Error(`Failed to recover tmux server: ${options.hostSession.serverName}`);
      }

      if (options.hostSession.mode === 'attach-existing') {
        const probeStatus = await tmuxDetector.probeSession(
          options.hostSession.sessionName,
          options.hostSession.serverName
        );
        if (probeStatus !== 'exists') {
          const diagnosticsId = requestMainProcessDiagnosticsCapture({
            event: 'session-tmux-session-recovery-failed',
            context: {
              windowId,
              cwd: options.cwd ?? null,
              kind: options.kind ?? 'terminal',
              serverName: options.hostSession.serverName,
              sessionName: options.hostSession.sessionName,
              probeStatus,
            },
            throttleKey: `session-tmux-session-recovery-failed:${options.hostSession.serverName}:${options.hostSession.sessionName}`,
            level: 'warn',
          });
          console.error('[session] Tmux host session recovery failed', {
            diagnosticsId,
            windowId,
            cwd: options.cwd ?? null,
            kind: options.kind ?? 'terminal',
            serverName: options.hostSession.serverName,
            sessionName: options.hostSession.sessionName,
            probeStatus,
          });
          throw new Error(`Failed to recover tmux session: ${options.hostSession.sessionName}`);
        }
      }
    }

    const initialReplay = await this.loadLocalReplaySeed(options, startupLogger);
    const initialReplayTail = takeUtf16Tail(initialReplay, getSessionReplayCharLimit(options.kind));
    const pendingHostReplayDedup =
      initialReplayTail.length > 0 && this.shouldSeedTmuxHostReplay(options);
    const kind = options.kind ?? 'terminal';
    const cwd = options.cwd || process.env.HOME || process.env.USERPROFILE || '/';
    const sessionId = this.localPtyManager.allocateId();
    const transcriptArchiveId =
      kind === 'agent' ? (getPersistentUiSessionId(options.metadata) ?? sessionId) : undefined;
    startupLabel = sessionId;
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
      ...(transcriptArchiveId ? { transcriptArchiveId } : {}),
      ...(options.hostSession ? { hostSession: options.hostSession } : {}),
      replayBuffer: new SessionReplayBuffer(getSessionReplayCharLimit(kind), initialReplayTail),
      pendingHostReplayDedup,
      ...(pendingHostReplayDedup ? { pendingHostReplayCursor: 0 } : {}),
      streamState: 'buffering',
    };
    this.sessions.set(sessionId, record);
    if (transcriptArchiveId) {
      this.transcriptArchiveIdsByBackendSessionId.set(sessionId, transcriptArchiveId);
    }
    await this.initializeLocalAgentTranscript(record, initialReplay);

    try {
      startupLogger?.markStage('pty-create-start');
      this.localPtyManager.create(
        options,
        (data) => this.handleLocalData(sessionId, data),
        (exitCode, signal) => {
          this.handleLocalExit(sessionId, exitCode, signal);
        },
        sessionId
      );
      startupLogger?.markStage('pty-create-returned');
    } catch (error) {
      startupLogger?.markStage('pty-create-failed');
      const nodeError = error as NodeJS.ErrnoException;
      console.error('[session] Local session creation failed', {
        sessionId,
        windowId,
        kind,
        cwd,
        persistOnDisconnect: record.persistOnDisconnect,
        hostSessionKind: options.hostSession?.kind ?? null,
        errorCode: typeof nodeError.code === 'string' ? nodeError.code : null,
      });
      this.sessions.delete(sessionId);
      this.transcriptArchiveIdsByBackendSessionId.delete(sessionId);
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

  private shouldEnsureTmuxHostHealth(
    options: SessionCreateOptions
  ): options is TmuxHostSessionCreateOptions {
    return (
      process.platform !== 'win32' &&
      options.kind === 'agent' &&
      options.hostSession?.kind === 'tmux'
    );
  }

  private shouldUseLocalSupervisorAttach(options: SessionAttachOptions): boolean {
    return (
      process.platform === 'win32' && Boolean(options.cwd && !isRemoteVirtualPath(options.cwd))
    );
  }

  private shouldSeedTmuxHostReplay(
    options: SessionCreateOptions
  ): options is TmuxHostSessionCreateOptions {
    return this.shouldEnsureTmuxHostHealth(options);
  }

  private async loadLocalReplaySeed(
    options: SessionCreateOptions,
    startupLogger?: AgentStartupTimelineLogger | null
  ): Promise<string> {
    if (!this.shouldSeedTmuxHostReplay(options)) {
      return '';
    }

    startupLogger?.markStage('tmux-history-capture-start');
    const replay = await tmuxDetector.captureSessionHistory(
      options.hostSession.sessionName,
      options.hostSession.serverName
    );
    startupLogger?.markStage('tmux-history-capture-done');
    return replay;
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
      replayBuffer: new SessionReplayBuffer(getSessionReplayCharLimit(result.session.kind)),
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
    this.replaceReplayBuffer(session, result.replay ?? '');
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
      replayBuffer: this.createReplayBuffer(result.session, result.replay ?? ''),
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
    this.replaceReplayBuffer(record, result.replay ?? '');
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
      const replay = this.getReplayBufferText(existing);
      existing.attachedWindowIds.add(windowId);
      existing.connectionId = connectionId;
      existing.cwd = descriptor.cwd;
      existing.kind = descriptor.kind;
      existing.persistOnDisconnect = descriptor.persistOnDisconnect;
      existing.metadata = descriptor.metadata;
      existing.runtimeState = existing.runtimeState ?? 'live';
      this.replaceReplayBuffer(existing, replay);
      return existing;
    }

    const record: ManagedSessionRecord = {
      ...descriptor,
      backend: 'remote',
      connectionId,
      runtimeState: 'live',
      attachedWindowIds: new Set([windowId]),
      replayBuffer: this.createReplayBuffer(descriptor),
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  private isLocalPtyAgentSession(session: ManagedSessionRecord): boolean {
    return (
      session.backend === 'local' && session.localRuntime === 'pty' && session.kind === 'agent'
    );
  }

  private async initializeLocalAgentTranscript(
    session: ManagedSessionRecord,
    initialReplay: string
  ): Promise<void> {
    if (!this.isLocalPtyAgentSession(session)) {
      return;
    }

    try {
      await sessionTranscriptArchive.open(session.transcriptArchiveId ?? session.sessionId);
      session.transcriptArchiveState = 'ready';
      this.archiveLocalAgentOutput(session, initialReplay);
    } catch (error) {
      this.markLocalAgentTranscriptDegraded(session, error);
    }
  }

  private archiveLocalAgentOutput(session: ManagedSessionRecord, data: string): void {
    if (!data || !this.isLocalPtyAgentSession(session)) {
      return;
    }

    try {
      sessionTranscriptArchive.append(session.transcriptArchiveId ?? session.sessionId, data);
      session.transcriptArchiveState = 'ready';
    } catch (error) {
      this.markLocalAgentTranscriptDegraded(session, error);
    }
  }

  private async flushLocalAgentTranscript(session: ManagedSessionRecord): Promise<void> {
    if (!this.isLocalPtyAgentSession(session)) {
      return;
    }

    try {
      await sessionTranscriptArchive.flush(session.transcriptArchiveId ?? session.sessionId);
      session.transcriptArchiveState = 'ready';
    } catch (error) {
      this.markLocalAgentTranscriptDegraded(session, error);
    }
  }

  private markLocalAgentTranscriptDegraded(session: ManagedSessionRecord, error: unknown): void {
    session.transcriptArchiveState = 'degraded';
    console.warn('[session] Agent transcript archive is degraded:', {
      sessionId: session.sessionId,
      cwd: session.cwd,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private finalizeLocalExit(session: ManagedSessionRecord, event: SessionExitEvent): void {
    const attachedWindowIds = new Set(session.attachedWindowIds);
    this.sessions.delete(session.sessionId);

    if (!this.isLocalPtyAgentSession(session)) {
      this.emitExit(event, attachedWindowIds);
      return;
    }

    void this.flushLocalAgentTranscript(session).then(() => {
      this.emitExit(event, attachedWindowIds);
    });
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

    this.finalizeLocalExit(session, event);
  }

  private handleLocalData(sessionId: string, data: string): void {
    if (!data) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'local') {
      return;
    }

    let nextData = data;
    if (session.pendingHostReplayDedup) {
      nextData = this.consumePendingHostReplay(session, data);
      if (!nextData) {
        return;
      }
    }

    this.publishLocalData(session, nextData);
  }

  private consumePendingHostReplay(session: ManagedSessionRecord, data: string): string {
    const bufferedScreenData = session.pendingHostReplayScreenBuffer;
    if (!bufferedScreenData && this.isInvisibleTerminalPrelude(data)) {
      return this.appendPendingHostReplayScreenBuffer(session, data);
    }

    if (this.hasIncompleteTerminalControlSequence(data)) {
      return this.appendPendingHostReplayScreenBuffer(session, data);
    }

    if (session.pendingHostReplayScreenMatched && !this.containsTerminalControlSequence(data)) {
      const liveData = `${bufferedScreenData ?? ''}${data}`;
      this.completeHostReplayDedup(session);
      return liveData;
    }

    if (bufferedScreenData || this.containsTerminalControlSequence(data)) {
      const screenData = `${bufferedScreenData ?? ''}${data}`;
      const replayText = this.normalizeTerminalScreenText(this.getReplayBufferText(session));
      const screenText = this.normalizeTerminalScreenText(screenData);

      if (!screenText) {
        return this.replacePendingHostReplayScreenBuffer(session, screenData);
      }

      if (
        this.isTerminalScreenRedraw(screenData) &&
        this.matchesCapturedHostReplayScreen(replayText, screenText)
      ) {
        this.clearPendingHostReplayScreenBuffer(session);
        session.pendingHostReplayScreenMatched = true;
        return '';
      }

      if (
        screenData.length < getSessionReplayCharLimit(session.kind) &&
        this.isPotentialCapturedHostReplayScreen(replayText, screenText, screenData)
      ) {
        return this.replacePendingHostReplayScreenBuffer(session, screenData);
      }

      this.completeHostReplayDedup(session);
      return screenData;
    }

    const replay = this.getReplayBufferText(session);
    const cursor = Math.min(session.pendingHostReplayCursor ?? 0, replay.length);
    const expectedChunk = replay.slice(cursor, cursor + data.length);

    if (expectedChunk === data) {
      session.pendingHostReplayCursor = cursor + data.length;
      return '';
    }

    const matchingChunkIndex = replay.indexOf(data, cursor);
    if (matchingChunkIndex >= 0) {
      session.pendingHostReplayCursor = matchingChunkIndex + data.length;
      return '';
    }

    const contiguousReplayLength = this.getCommonPrefixLength(replay.slice(cursor), data);
    if (contiguousReplayLength > 0) {
      session.pendingHostReplayCursor = cursor + contiguousReplayLength;
      this.completeHostReplayDedup(session);
      return data.slice(contiguousReplayLength);
    }

    const replayOverlapLength = this.getReplayOverlap(replay.slice(cursor), data);
    if (replayOverlapLength > 0) {
      session.pendingHostReplayCursor = replay.length;
      this.completeHostReplayDedup(session);
      return data.slice(replayOverlapLength);
    }

    this.completeHostReplayDedup(session);
    return data;
  }

  private publishLocalData(session: ManagedSessionRecord, data: string): void {
    this.archiveLocalAgentOutput(session, data);
    this.appendReplayBuffer(session, data);

    if (session.streamState === 'live') {
      this.emitBatchedSessionData(session.sessionId, data, new Set(session.attachedWindowIds));
    }
  }

  private appendPendingHostReplayScreenBuffer(session: ManagedSessionRecord, data: string): string {
    return this.replacePendingHostReplayScreenBuffer(
      session,
      `${session.pendingHostReplayScreenBuffer ?? ''}${data}`
    );
  }

  private replacePendingHostReplayScreenBuffer(
    session: ManagedSessionRecord,
    data: string
  ): string {
    if (data.length > PENDING_HOST_REPLAY_SCREEN_BUFFER_CHAR_LIMIT) {
      this.completeHostReplayDedup(session);
      return data;
    }

    session.pendingHostReplayScreenBuffer = data;
    if (!session.pendingHostReplayScreenFlushTimer) {
      session.pendingHostReplayScreenFlushTimer = setTimeout(() => {
        this.flushPendingHostReplayScreenBuffer(session.sessionId);
      }, PENDING_HOST_REPLAY_SCREEN_FLUSH_DELAY_MS);
    }
    return '';
  }

  private flushPendingHostReplayScreenBuffer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'local' || !session.pendingHostReplayDedup) {
      return;
    }

    const bufferedScreenData = session.pendingHostReplayScreenBuffer;
    if (!bufferedScreenData) {
      return;
    }

    session.pendingHostReplayScreenFlushTimer = undefined;
    this.completeHostReplayDedup(session);
    this.publishLocalData(session, bufferedScreenData);
  }

  private clearPendingHostReplayScreenBuffer(session: ManagedSessionRecord): void {
    if (session.pendingHostReplayScreenFlushTimer) {
      clearTimeout(session.pendingHostReplayScreenFlushTimer);
    }
    session.pendingHostReplayScreenBuffer = undefined;
    session.pendingHostReplayScreenFlushTimer = undefined;
  }

  private containsTerminalControlSequence(data: string): boolean {
    return data.includes(TERMINAL_ESCAPE);
  }

  private isTerminalScreenRedraw(data: string): boolean {
    return (
      data.includes(`${TERMINAL_ESCAPE}[H`) ||
      data.includes(`${TERMINAL_ESCAPE}[1;1H`) ||
      data.includes(`${TERMINAL_ESCAPE}[2J`)
    );
  }

  private isInvisibleTerminalPrelude(data: string): boolean {
    if (!data) {
      return false;
    }

    for (const character of data) {
      const code = character.charCodeAt(0);
      if (code > 0x1f && code !== 0x7f) {
        return false;
      }
    }

    return true;
  }

  private hasIncompleteTerminalControlSequence(data: string): boolean {
    if (data.endsWith(TERMINAL_ESCAPE)) {
      return true;
    }

    const finalEscapeIndex = data.lastIndexOf(TERMINAL_ESCAPE);
    if (finalEscapeIndex < 0) {
      return false;
    }

    const sequence = data.slice(finalEscapeIndex + TERMINAL_ESCAPE.length);
    if (sequence.startsWith('[')) {
      return /^[0-?]*[ -/]*$/.test(sequence.slice(1));
    }

    return (
      sequence.startsWith(']') &&
      !sequence.includes(TERMINAL_BELL) &&
      !sequence.includes(`${TERMINAL_ESCAPE}\\`)
    );
  }

  private normalizeTerminalScreenText(data: string): string {
    return data
      .replace(
        new RegExp(
          `${TERMINAL_ESCAPE}\\][\\s\\S]*?(?:${TERMINAL_BELL}|${TERMINAL_ESCAPE}\\\\)`,
          'g'
        ),
        ''
      )
      .replace(new RegExp(`${TERMINAL_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
      .replace(new RegExp(`${TERMINAL_ESCAPE}[()][0-9A-Z]`, 'g'), '')
      .replace(new RegExp(`${TERMINAL_ESCAPE}[=>]`, 'g'), '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  private matchesCapturedHostReplayScreen(replayText: string, screenText: string): boolean {
    const replayPayload = this.getTerminalScreenPayload(replayText);
    const screenPayload = this.getTerminalScreenPayload(screenText);
    if (!replayPayload || !screenPayload) {
      return false;
    }

    const minimumMatchLength = Math.min(replayPayload.length, 16);
    return screenPayload.length >= minimumMatchLength && replayPayload.endsWith(screenPayload);
  }

  private getTerminalScreenPayload(text: string): string {
    const lines = text.split('\n').map((line) => line.trimEnd());
    while (lines.length > 0 && !lines[0]?.trim()) {
      lines.shift();
    }
    while (lines.length > 0 && !lines.at(-1)?.trim()) {
      lines.pop();
    }

    if (this.isTmuxStatusLine(lines.at(-1))) {
      lines.pop();
    }
    while (lines.length > 0 && !lines.at(-1)?.trim()) {
      lines.pop();
    }

    return lines.join('\n');
  }

  private isTmuxStatusLine(line: string | undefined): boolean {
    return Boolean(line && /^\[[^:\]]+:[^\n]*["*][^\n]*$/.test(line));
  }

  private isPotentialCapturedHostReplayScreen(
    replayText: string,
    screenText: string,
    screenData: string
  ): boolean {
    const replayPayload = this.getTerminalScreenPayload(replayText);
    const screenPayload = this.getTerminalScreenPayload(screenText);
    if (
      !this.isTerminalScreenRedraw(screenData) ||
      !replayPayload ||
      !screenPayload ||
      screenPayload.length >= replayPayload.length
    ) {
      return false;
    }

    const minimumFragmentLength = 1;
    return screenPayload.length >= minimumFragmentLength && replayPayload.includes(screenPayload);
  }

  private completeHostReplayDedup(session: ManagedSessionRecord): void {
    session.pendingHostReplayDedup = false;
    session.pendingHostReplayCursor = undefined;
    this.clearPendingHostReplayScreenBuffer(session);
    session.pendingHostReplayScreenMatched = undefined;
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
      const replayBuffer = this.getReplayBufferText(session);
      const delta = replayBuffer.slice(replayCursor);
      if (delta) {
        this.emitBatchedSessionData(sessionId, delta, new Set(session.attachedWindowIds));
      }

      if (session.pendingExit) {
        const pendingExit = session.pendingExit;
        this.finalizeLocalExit(session, pendingExit);
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
      this.emitBatchedSessionData(event.sessionId, event.data, new Set(session.attachedWindowIds));
    });

    localSupervisorRuntime.onOutputResync((event) => {
      const session = this.sessions.get(event.sessionId);
      if (!session || session.localRuntime !== 'supervisor') {
        return;
      }
      this.handleUpstreamOutputResync(session, event);
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
          this.emitBatchedSessionData(event.sessionId, event.data);
        }
      );

      let offOutputResync: (() => void) | null = null;
      try {
        offOutputResync = await remoteConnectionManager.addEventListener(
          connectionId,
          'remote:session:output-resync',
          (payload) => {
            const event = payload as SessionOutputResyncEvent;
            const session = this.sessions.get(event.sessionId);
            if (!session || session.backend !== 'remote') {
              return;
            }
            this.handleUpstreamOutputResync(session, event);
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
        try {
          offOutputResync();
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
          offOutputResync();
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
        offOutputResync,
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
              const replay = this.trimReplayBuffer(session, restored.replay ?? '');
              const delta = this.getReplayDelta(this.getReplayBufferText(session), replay);
              this.replaceReplayBuffer(session, replay);
              if (delta) {
                this.emitBatchedSessionData(
                  session.sessionId,
                  delta,
                  new Set(session.attachedWindowIds)
                );
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

    try {
      subscription.offOutputResync();
    } catch (error) {
      console.warn('[session] Failed to dispose remote output resync listener:', error);
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

    const replayBuffer =
      session.replayBuffer ?? new SessionReplayBuffer(getSessionReplayCharLimit(session.kind));
    replayBuffer.append(data);
    session.replayBuffer = replayBuffer;
  }

  private createReplayBuffer(
    session: Pick<SessionDescriptor, 'kind'>,
    replay = ''
  ): SessionReplayBuffer {
    return new SessionReplayBuffer(getSessionReplayCharLimit(session.kind), replay);
  }

  private replaceReplayBuffer(session: ManagedSessionRecord, replay: string): void {
    session.replayBuffer = this.createReplayBuffer(session, replay);
  }

  private getReplayBufferText(session: ManagedSessionRecord | undefined): string {
    return session?.replayBuffer?.toString() ?? '';
  }

  private getReplayBufferLength(session: ManagedSessionRecord): number {
    return session.replayBuffer?.length ?? 0;
  }

  private trimReplayBuffer(
    session: Pick<SessionDescriptor, 'kind'>,
    replay: string | undefined
  ): string {
    if (!replay) {
      return '';
    }

    return takeUtf16Tail(replay, getSessionReplayCharLimit(session.kind));
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
    const previousTail = takeUtf16Tail(previousReplay, nextReplay.length);
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

  private getCommonPrefixLength(left: string, right: string): number {
    const length = Math.min(left.length, right.length);
    let index = 0;
    while (index < length && left[index] === right[index]) {
      index += 1;
    }
    return index;
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

    void this.abandonPersistentSessionRecord(session);
  }

  private async cleanupPersistentSessionForExplicitTermination(
    session: ManagedSessionRecord
  ): Promise<void> {
    await Promise.all([
      this.terminateLocalHostSessionForExplicitTermination(session),
      this.abandonPersistentSessionRecord(session),
    ]);
  }

  private async terminateLocalHostSessionForExplicitTermination(
    session: ManagedSessionRecord
  ): Promise<void> {
    if (session.backend !== 'local' || session.localRuntime !== 'pty') {
      return;
    }
    if (session.kind !== 'agent' || session.hostSession?.kind !== 'tmux') {
      return;
    }

    const { sessionName, serverName } = session.hostSession;
    try {
      await tmuxDetector.killSession(sessionName, serverName);
    } catch (error) {
      console.warn('[session] Failed to terminate persistent tmux host session:', error);
    }
  }

  private async abandonPersistentSessionRecord(session: ManagedSessionRecord): Promise<void> {
    const uiSessionId = getPersistentUiSessionId(session.metadata);
    if (!uiSessionId) {
      return;
    }

    await persistentAgentSessionService.abandonSession(uiSessionId).catch((error) => {
      console.warn('[session] Failed to abandon persistent agent session record:', error);
    });
  }

  private async releaseCodexRuntimeHomeForExplicitTermination(
    session: ManagedSessionRecord
  ): Promise<void> {
    const runtimeHomePath = getCodexRuntimeHomePath(session.metadata);
    if (!runtimeHomePath) {
      return;
    }

    await codexRuntimeHomeService.releaseRuntimeHome(runtimeHomePath).catch((error) => {
      console.warn('[session] Failed to release Codex runtime home:', error);
    });
  }

  private emitBatchedSessionData(sessionId: string, data: string, windowIds?: Set<number>): void {
    const targetWindowIds = windowIds ?? this.sessions.get(sessionId)?.attachedWindowIds;
    if (!data || !targetWindowIds || targetWindowIds.size === 0) {
      return;
    }

    for (const windowId of targetWindowIds) {
      if (this.suspendedWindowIds.has(windowId) || this.isOutputSuspended(windowId, sessionId)) {
        continue;
      }

      this.sessionOutputBatcher.enqueue(windowId, sessionId, data);
    }
  }

  private emitExit(event: SessionExitEvent, windowIds?: Set<number>): void {
    const targetWindowIds = windowIds ?? this.sessions.get(event.sessionId)?.attachedWindowIds;
    if (targetWindowIds) {
      this.sessionOutputBatcher.flushSession(event.sessionId, targetWindowIds);
    }
    this.emitToWindows(targetWindowIds, 'session:exit', event);
    this.cleanupWindowCloseSubscriptionsIfUnused(targetWindowIds ?? []);
  }

  private emitSessionOutputResync(windowId: number, sessionId: string): void {
    const event: SessionOutputResyncEvent = {
      sessionId,
      replay: this.getReplayBufferText(this.sessions.get(sessionId)),
    };
    this.emitToWindows(new Set([windowId]), 'session:outputResync', event);
  }

  private handleUpstreamOutputResync(
    session: ManagedSessionRecord,
    event: SessionOutputResyncEvent
  ): void {
    this.replaceReplayBuffer(session, event.replay);
    for (const windowId of session.attachedWindowIds) {
      if (
        this.suspendedWindowIds.has(windowId) ||
        this.isOutputSuspended(windowId, session.sessionId)
      ) {
        continue;
      }
      this.sessionOutputBatcher.requestResync(windowId, session.sessionId);
    }
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
    channel: 'session:data' | 'session:outputResync' | 'session:exit' | 'session:state',
    payload: SessionDataEvent | SessionOutputResyncEvent | SessionExitEvent | SessionStateEvent
  ): void {
    if (!windowIds || windowIds.size === 0) {
      return;
    }

    for (const windowId of windowIds) {
      if (this.suspendedWindowIds.has(windowId)) {
        continue;
      }

      const window = BrowserWindow.fromId(windowId);
      if (!window || window.isDestroyed()) {
        this.suspendWindow(windowId);
        continue;
      }
      const resolvedChannel =
        channel === 'session:data'
          ? IPC_CHANNELS.SESSION_DATA
          : channel === 'session:outputResync'
            ? IPC_CHANNELS.SESSION_OUTPUT_RESYNC
            : channel === 'session:exit'
              ? IPC_CHANNELS.SESSION_EXIT
              : IPC_CHANNELS.SESSION_STATE;
      if (isWebContentsUnavailable(window.webContents)) {
        this.suspendWindow(windowId);
        continue;
      }
      try {
        window.webContents.send(resolvedChannel, payload);
      } catch (error) {
        if (isDisposedWindowSendError(error)) {
          this.suspendWindow(windowId);
          continue;
        }
        console.warn('[session] Failed to emit session event to window:', error);
      }
    }
  }

  private suspendWindow(windowId: number): void {
    this.removeWindowCloseSubscription(windowId);
    this.suspendedWindowIds.add(windowId);
    this.sessionOutputBatcher.discardWindow(windowId);
    this.outputSuspendedSessionIdsByWindowId.delete(windowId);
    for (const session of this.sessions.values()) {
      session.attachedWindowIds.delete(windowId);
    }
    this.cleanupDetachedLocalSessions();
  }

  private isOutputSuspended(windowId: number, sessionId: string): boolean {
    return this.outputSuspendedSessionIdsByWindowId.get(windowId)?.has(sessionId) ?? false;
  }

  private clearOutputSuspension(windowId: number, sessionId: string): void {
    const suspendedSessionIds = this.outputSuspendedSessionIdsByWindowId.get(windowId);
    suspendedSessionIds?.delete(sessionId);
    if (suspendedSessionIds?.size === 0) {
      this.outputSuspendedSessionIdsByWindowId.delete(windowId);
    }
  }

  private ensureWindowCloseSubscription(
    target: BrowserWindow | WebContents | number,
    windowId: number
  ): void {
    const window = resolveBrowserWindow(target);
    if (!window || window.isDestroyed()) {
      this.removeWindowCloseSubscription(windowId);
      return;
    }

    const existing = this.windowCloseSubscriptions.get(windowId);
    if (existing?.window === window) {
      return;
    }

    this.removeWindowCloseSubscription(windowId);
    const listener = () => {
      const current = this.windowCloseSubscriptions.get(windowId);
      if (current?.window === window && current.listener === listener) {
        this.windowCloseSubscriptions.delete(windowId);
      }
      this.suspendWindow(windowId);
    };
    window.on('closed', listener);
    this.windowCloseSubscriptions.set(windowId, { window, listener });
  }

  private removeWindowCloseSubscription(windowId: number): void {
    const subscription = this.windowCloseSubscriptions.get(windowId);
    if (!subscription) {
      return;
    }

    this.windowCloseSubscriptions.delete(windowId);
    subscription.window.removeListener('closed', subscription.listener);
  }

  private cleanupWindowCloseSubscriptionIfUnused(windowId: number): void {
    const isAttached = [...this.sessions.values()].some((session) =>
      session.attachedWindowIds.has(windowId)
    );
    if (!isAttached) {
      this.removeWindowCloseSubscription(windowId);
    }
  }

  private cleanupWindowCloseSubscriptionsIfUnused(windowIds: Iterable<number>): void {
    for (const windowId of windowIds) {
      this.cleanupWindowCloseSubscriptionIfUnused(windowId);
    }
  }

  private cleanupDetachedLocalSessions(): void {
    for (const session of Array.from(this.sessions.values())) {
      if (session.attachedWindowIds.size > 0 || session.backend !== 'local') {
        continue;
      }

      if (session.localRuntime === 'supervisor') {
        void localSupervisorRuntime.detachSession(session.sessionId).catch(() => {});
        this.sessions.delete(session.sessionId);
        continue;
      }

      if (session.localRuntime === 'pty') {
        this.localPtyManager.destroy(session.sessionId);
        this.sessions.delete(session.sessionId);
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

  private buildDiagnosticsSnapshot(): SessionPerformanceDiagnostics {
    const backendCounts: Record<string, number> = {};
    const runtimeStateCounts: Record<string, number> = {};
    const kindCounts: Record<string, number> = {};
    let attachedWindowCount = 0;
    let outputSuspendedSessionCount = 0;
    let pendingAppendBytes = 0;

    for (const session of this.sessions.values()) {
      backendCounts[session.backend] = (backendCounts[session.backend] ?? 0) + 1;
      const runtimeState = session.runtimeState ?? 'live';
      runtimeStateCounts[runtimeState] = (runtimeStateCounts[runtimeState] ?? 0) + 1;
      kindCounts[session.kind] = (kindCounts[session.kind] ?? 0) + 1;
      attachedWindowCount += session.attachedWindowIds.size;
      if (this.isLocalPtyAgentSession(session)) {
        pendingAppendBytes += sessionTranscriptArchive.getDiagnostics(
          session.transcriptArchiveId ?? session.sessionId
        ).pendingAppendBytes;
      }
    }
    for (const sessionIds of this.outputSuspendedSessionIdsByWindowId.values()) {
      outputSuspendedSessionCount += sessionIds.size;
    }

    return {
      sessionCount: this.sessions.size,
      backendCounts,
      runtimeStateCounts,
      kindCounts,
      suspendedWindowCount: this.suspendedWindowIds.size,
      attachedWindowCount,
      outputSuspendedSessionCount,
      sessionOutputBatcher: this.sessionOutputBatcher.getDiagnostics(),
      transcript: {
        pendingAppendBytes,
      },
      localPty: this.localPtyManager.getDiagnosticsSummary(),
    };
  }
}

export const sessionManager = new SessionManager();
