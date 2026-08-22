import path from 'node:path';
import {
  IPC_CHANNELS,
  type SessionAttachOptions,
  type SessionCreateOptions,
  type SessionResizeOptions,
  type SessionTranscriptPageRequest,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import {
  prepareAgentCapabilityLaunch,
  resolveAgentCapabilityLaunchRequest,
} from '../services/agent/AgentCapabilityLaunchService';
import type { PreparedAgentCapabilityLaunch } from '../services/agent/AgentCapabilityProviderAdapter';
import { resolveUserCodexHome } from '../services/agent/CodexHomePaths';
import { codexRuntimeHomeService } from '../services/agent/CodexRuntimeHomeService';
import { resolveCodexWorkspaceSessionHistoryPath } from '../services/agent/CodexWorkspaceSessionHistory';
import { sessionManager } from '../services/session/SessionManager';

const MANAGED_CODEX_RUNTIME_HOME_ENV_KEY = 'INFILUX_MANAGED_CODEX_RUNTIME_HOME';

function toSessionCreateOptions(options: TerminalCreateOptions = {}): SessionCreateOptions {
  return {
    ...options,
    kind: 'terminal',
  };
}

function mergeSessionEnvironment(
  currentEnv: SessionCreateOptions['env'],
  overrideEnv: SessionCreateOptions['env']
): SessionCreateOptions['env'] {
  if (!currentEnv && !overrideEnv) {
    return undefined;
  }

  return {
    ...(currentEnv ?? {}),
    ...(overrideEnv ?? {}),
  };
}

function applyPreparedAgentCapabilityLaunch(
  options: SessionCreateOptions,
  preparedLaunch: PreparedAgentCapabilityLaunch
): SessionCreateOptions {
  const { launchResult, sessionOverrides } = preparedLaunch;
  const capabilityMetadata = {
    provider: launchResult.provider,
    hash: launchResult.hash,
    warnings: launchResult.warnings,
    projected: launchResult.projected,
  };

  return {
    ...options,
    ...(sessionOverrides?.spawnCwd !== undefined ? { spawnCwd: sessionOverrides.spawnCwd } : {}),
    ...(sessionOverrides?.shell !== undefined ? { shell: sessionOverrides.shell } : {}),
    ...(sessionOverrides?.args !== undefined ? { args: sessionOverrides.args } : {}),
    ...(sessionOverrides?.fallbackShell !== undefined
      ? { fallbackShell: sessionOverrides.fallbackShell }
      : {}),
    ...(sessionOverrides?.fallbackArgs !== undefined
      ? { fallbackArgs: sessionOverrides.fallbackArgs }
      : {}),
    ...(sessionOverrides?.initialCommand !== undefined
      ? { initialCommand: sessionOverrides.initialCommand }
      : {}),
    env: mergeSessionEnvironment(options.env, sessionOverrides?.env),
    metadata: {
      ...(options.metadata ?? {}),
      ...(sessionOverrides?.metadata ?? {}),
      agentCapability: capabilityMetadata,
      ...(launchResult.provider === 'claude'
        ? {
            claudePolicy: {
              hash: launchResult.hash,
              warnings: launchResult.warnings,
              projected: launchResult.projected,
            },
          }
        : {}),
    },
  };
}

function isCodexLaunchCommand(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  return /(^|[\s;&|])(?:"[^"]*\/codex"|'[^']*\/codex'|[^\s'";&|]*\/codex|codex)(?=[\s'";&|]|$)/i.test(
    value
  );
}

function isCodexCapabilityLaunch(metadata: SessionCreateOptions['metadata']): boolean {
  const launch = metadata?.agentCapabilityLaunch;
  return (
    Boolean(launch) &&
    typeof launch === 'object' &&
    !Array.isArray(launch) &&
    (launch as { provider?: unknown }).provider === 'codex'
  );
}

function isCodexAgentSession(options: SessionCreateOptions): boolean {
  const metadata = options.metadata;
  const agentId = typeof metadata?.agentId === 'string' ? metadata.agentId : undefined;
  const agentCommand =
    typeof metadata?.agentCommand === 'string' ? metadata.agentCommand : undefined;

  return (
    options.kind === 'agent' &&
    (agentId === 'codex' ||
      agentCommand === 'codex' ||
      isCodexCapabilityLaunch(metadata) ||
      isCodexLaunchCommand(options.initialCommand) ||
      isCodexLaunchCommand(options.shell))
  );
}

async function ensureCodexRuntimeHome(
  options: SessionCreateOptions
): Promise<SessionCreateOptions> {
  if (!isCodexAgentSession(options) || options.env?.CODEX_HOME) {
    return options;
  }

  const metadata = options.metadata ?? {};
  const uiSessionId =
    typeof metadata.uiSessionId === 'string' && metadata.uiSessionId.length > 0
      ? metadata.uiSessionId
      : undefined;
  const worktreePath =
    options.cwd ?? (typeof metadata.worktreePath === 'string' ? metadata.worktreePath : undefined);
  const sessionHistoryPath = resolveCodexWorkspaceSessionHistoryPath({
    repoPath: typeof metadata.repoPath === 'string' ? metadata.repoPath : undefined,
    worktreePath,
  });
  const runtimeHome = await codexRuntimeHomeService.prepareRuntimeHome(
    uiSessionId ?? `${options.cwd ?? 'codex'}:${Date.now()}`,
    {
      sessionHistoryPath,
      sessionHistoryScope: {
        repoPath: typeof metadata.repoPath === 'string' ? metadata.repoPath : undefined,
        worktreePath,
      },
      legacySessionPaths: [path.join(resolveUserCodexHome(), 'sessions')],
    }
  );

  return {
    ...options,
    env: {
      ...(options.env ?? {}),
      CODEX_HOME: runtimeHome.homePath,
      [MANAGED_CODEX_RUNTIME_HOME_ENV_KEY]: runtimeHome.homePath,
    },
    metadata: {
      ...metadata,
      codexRuntimeHome: {
        homePath: runtimeHome.homePath,
        sourceHomePath: runtimeHome.sourceHomePath,
      },
    },
  };
}

function resolveCodexRuntimeHomeLockKey(options: SessionCreateOptions): string | null {
  if (!isCodexAgentSession(options)) {
    return null;
  }

  const uiSessionId = options.metadata?.uiSessionId;
  return typeof uiSessionId === 'string' && uiSessionId.length > 0 ? uiSessionId : null;
}

async function prepareAgentSessionOptions(
  options: SessionCreateOptions
): Promise<SessionCreateOptions> {
  if (options.kind !== 'agent') {
    return options;
  }

  const launchRequest = resolveAgentCapabilityLaunchRequest(options.metadata);
  if (!launchRequest) {
    return ensureCodexRuntimeHome(options);
  }

  const launchResult = await prepareAgentCapabilityLaunch(launchRequest, options);
  if (!launchResult) {
    return ensureCodexRuntimeHome(options);
  }

  return ensureCodexRuntimeHome(applyPreparedAgentCapabilityLaunch(options, launchResult));
}

function resolveSessionTarget(sender: WebContents): WebContents | number {
  try {
    const window = BrowserWindow.fromWebContents(sender);
    return window?.id ?? sender;
  } catch {
    return sender;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTranscriptPageRequest(value: unknown): SessionTranscriptPageRequest {
  if (!isPlainObject(value) || typeof value.sessionId !== 'string' || !value.sessionId.trim()) {
    throw new Error('Invalid session transcript request');
  }

  const request: SessionTranscriptPageRequest = {
    sessionId: value.sessionId,
  };
  const beforeByteOffset = value.beforeByteOffset;
  if (beforeByteOffset !== undefined) {
    if (
      typeof beforeByteOffset !== 'number' ||
      !Number.isSafeInteger(beforeByteOffset) ||
      beforeByteOffset < 0
    ) {
      throw new Error('Invalid session transcript cursor');
    }
    request.beforeByteOffset = beforeByteOffset;
  }
  const maxBytes = value.maxBytes;
  if (maxBytes !== undefined) {
    if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error('Invalid session transcript page size');
    }
    request.maxBytes = maxBytes;
  }

  return request;
}

export function destroyAllTerminals(): void {
  sessionManager.destroyAllLocal();
}

export async function destroyAllTerminalsAndWait(): Promise<void> {
  await sessionManager.destroyAllLocalAndWait();
}

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (event, options: SessionCreateOptions = {}) => {
    const senderTarget = resolveSessionTarget(event.sender);
    const createSession = async () => {
      const preparedOptions = await prepareAgentSessionOptions(options);
      return sessionManager.create(senderTarget, preparedOptions);
    };
    const codexRuntimeHomeLockKey = resolveCodexRuntimeHomeLockKey(options);
    if (codexRuntimeHomeLockKey) {
      return codexRuntimeHomeService.runExclusive(codexRuntimeHomeLockKey, createSession);
    }

    return createSession();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_ATTACH, async (event, options: SessionAttachOptions) => {
    return sessionManager.attach(event.sender, options);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DETACH, async (event, sessionId: string) => {
    await sessionManager.detach(event.sender, sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_KILL, async (_, sessionId: string) => {
    await sessionManager.kill(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_WRITE, async (_, sessionId: string, data: string) => {
    sessionManager.write(sessionId, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESIZE,
    async (_, sessionId: string, size: SessionResizeOptions) => {
      sessionManager.resize(sessionId, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (event) => {
    return sessionManager.list(event.sender);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ACTIVITY, async (_, sessionId: string) => {
    return sessionManager.getActivity(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_RUNTIME_INFO, async (_, sessionId: string) => {
    return sessionManager.getSessionRuntimeInfo(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_TRANSCRIPT_PAGE, async (_, request: unknown) => {
    return sessionManager.getTranscriptPage(normalizeTranscriptPageRequest(request));
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_ACTIVATE_OUTPUT, async (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session output activation request');
    }
    await sessionManager.activateOutput(resolveSessionTarget(event.sender), sessionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_ACKNOWLEDGE_OUTPUT_RESYNC,
    async (event, sessionId: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('Invalid session output resync acknowledgement');
      }
      sessionManager.acknowledgeOutputResync(resolveSessionTarget(event.sender), sessionId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SET_OUTPUT_DELIVERY,
    async (event, sessionId: unknown, isVisible: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId.trim() || typeof isVisible !== 'boolean') {
        throw new Error('Invalid session output delivery request');
      }
      sessionManager.setOutputDelivery(resolveSessionTarget(event.sender), sessionId, isVisible);
    }
  );

  // Compatibility wrappers for legacy terminal callers while renderer migrates.
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (event, options: TerminalCreateOptions = {}) => {
      const senderTarget = resolveSessionTarget(event.sender);
      const created = await sessionManager.create(senderTarget, toSessionCreateOptions(options));
      const sessionId = created.session.sessionId;
      const attached = await sessionManager.attach(senderTarget, {
        sessionId,
        cwd: options.cwd,
      });
      if (attached.replay) {
        event.sender.send(IPC_CHANNELS.SESSION_DATA, {
          sessionId,
          data: attached.replay,
        });
      }
      return sessionId;
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_, id: string, data: string) => {
    sessionManager.write(id, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    async (_, id: string, size: TerminalResizeOptions) => {
      sessionManager.resize(id, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_, id: string) => {
    await sessionManager.kill(id);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_ACTIVITY, async (_, id: string) => {
    return sessionManager.getActivity(id);
  });
}
