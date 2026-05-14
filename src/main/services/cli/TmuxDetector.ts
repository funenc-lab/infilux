import { execFile, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  TmuxCheckResult,
  TmuxScrollClientRequest,
  TmuxScrollClientResult,
} from '@shared/types';
import { buildManagedTmuxSocketDirPath, buildManagedTmuxSocketPath } from '@shared/utils/tmux';
import { getAppRuntimeIdentity } from '../../utils/runtimeIdentity';
import { execInPty, getEnvForCommand } from '../../utils/shell';

const isWindows = process.platform === 'win32';
const TMUX_COMMAND_TIMEOUT_MS = 5000;
const LIST_PANES_FORMAT = '#{pane_id}\t#{pane_active}\t#{pane_in_mode}';
const TMUX_HEALTHCHECK_SESSION_PREFIX = 'infilux-healthcheck';
const TMUX_RESOURCE_EXHAUSTION_ERROR_CODES = new Set(['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM']);
const TMUX_SCROLL_PANE_CACHE_TTL_MS = 250;

export type TmuxSessionProbeStatus = 'exists' | 'missing' | 'failed';

function isResourceExhaustionError(error: unknown): error is NodeJS.ErrnoException {
  const nodeError = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? error.message : '';
  return (
    (typeof nodeError?.code === 'string' &&
      TMUX_RESOURCE_EXHAUSTION_ERROR_CODES.has(nodeError.code)) ||
    message.includes('posix_openpt failed')
  );
}

function isMissingSessionProbeError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: NodeJS.Signals | null;
    stderr?: string | Buffer;
  };
  if (nodeError?.killed || nodeError?.signal) {
    return false;
  }
  const stderr =
    typeof nodeError?.stderr === 'string'
      ? nodeError.stderr
      : Buffer.isBuffer(nodeError?.stderr)
        ? nodeError.stderr.toString('utf8')
        : '';
  if (stderr.includes("can't find session:")) {
    return true;
  }
  if (stderr.includes('error connecting to')) {
    return false;
  }
  if (typeof nodeError?.code === 'number') {
    return false;
  }
  return false;
}

function toTmuxResourceExhaustionError(
  error: unknown,
  serverName: string,
  operation: string
): NodeJS.ErrnoException {
  const nodeError = error as NodeJS.ErrnoException;
  const wrappedError = new Error(
    `System resources exhausted while ${operation} tmux server ${serverName}`
  ) as NodeJS.ErrnoException & {
    cause?: unknown;
  };
  wrappedError.name = 'TmuxResourceExhaustionError';
  wrappedError.code = nodeError.code ?? 'EAGAIN';
  wrappedError.cause = error;
  return wrappedError;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function resolveTmuxServerName(serverName?: string): string {
  return serverName || getAppRuntimeIdentity().tmuxServerName;
}

function buildTmuxHealthcheckSessionName(): string {
  return `${TMUX_HEALTHCHECK_SESSION_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTmuxSocketPath(serverName: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();
  return buildManagedTmuxSocketPath(homeDir, serverName);
}

function ensureTmuxSocketDirectory(_serverName: string): void {
  mkdirSync(
    buildManagedTmuxSocketDirPath(process.env.HOME || process.env.USERPROFILE || homedir()),
    {
      recursive: true,
    }
  );
}

function buildTmuxShellCommand(serverName: string, command: string): string {
  ensureTmuxSocketDirectory(serverName);
  return `tmux -S ${shellQuote(resolveTmuxSocketPath(serverName))} ${command}`;
}

function execTmux(serverName: string, args: string[]): Promise<string> {
  ensureTmuxSocketDirectory(serverName);

  return execTmuxCommand(['-S', resolveTmuxSocketPath(serverName), ...args]);
}

function execTmuxCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'tmux',
      args,
      {
        encoding: 'utf8',
        env: getEnvForCommand(),
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error) {
          (error as NodeJS.ErrnoException & { stderr?: string }).stderr = stderr;
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function normalizeScrollAmount(amount?: number): number {
  if (typeof amount !== 'number') {
    return 0;
  }
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(0, Math.trunc(amount));
}

function findActivePaneForSession(stdout: string): { paneId: string; inMode: boolean } | null {
  const lines = stdout.split(/\r?\n/);
  let fallbackPaneId: string | null = null;
  let fallbackInMode = false;

  for (const line of lines) {
    const [paneId = '', paneActive = '0', paneInMode = '0'] = line.split('\t');
    if (!paneId) {
      continue;
    }

    if (!fallbackPaneId) {
      fallbackPaneId = paneId;
      fallbackInMode = paneInMode === '1';
    }

    if (paneActive === '1') {
      return {
        paneId,
        inMode: paneInMode === '1',
      };
    }
  }

  if (!fallbackPaneId) {
    return null;
  }

  return {
    paneId: fallbackPaneId,
    inMode: fallbackInMode,
  };
}

function buildScrollPaneCacheKey(serverName: string, sessionName: string): string {
  return `${serverName}\u0000${sessionName}`;
}

interface TmuxScrollPaneCacheEntry {
  expiresAt: number;
  inMode: boolean;
  paneId: string;
}

class TmuxDetector {
  private cache: TmuxCheckResult | null = null;
  private readonly serverHealthCheckPromises = new Map<string, Promise<boolean>>();
  private readonly scrollPaneCache = new Map<string, TmuxScrollPaneCacheEntry>();

  private getCachedScrollPane(
    serverName: string,
    sessionName: string
  ): { paneId: string; inMode: boolean } | null {
    const cacheKey = buildScrollPaneCacheKey(serverName, sessionName);
    const cached = this.scrollPaneCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.scrollPaneCache.delete(cacheKey);
      return null;
    }

    return {
      paneId: cached.paneId,
      inMode: cached.inMode,
    };
  }

  private setCachedScrollPane(
    serverName: string,
    sessionName: string,
    pane: { paneId: string; inMode: boolean }
  ): void {
    this.scrollPaneCache.set(buildScrollPaneCacheKey(serverName, sessionName), {
      expiresAt: Date.now() + TMUX_SCROLL_PANE_CACHE_TTL_MS,
      inMode: pane.inMode,
      paneId: pane.paneId,
    });
  }

  private clearCachedScrollPane(serverName: string, sessionName: string): void {
    this.scrollPaneCache.delete(buildScrollPaneCacheKey(serverName, sessionName));
  }

  private async resolveScrollPane(
    sessionName: string,
    serverName: string,
    options?: { forceRefresh?: boolean }
  ): Promise<{ paneId: string; inMode: boolean } | null> {
    if (!options?.forceRefresh) {
      const cached = this.getCachedScrollPane(serverName, sessionName);
      if (cached) {
        return cached;
      }
    }

    const stdout = await execTmux(serverName, [
      'list-panes',
      '-t',
      sessionName,
      '-F',
      LIST_PANES_FORMAT,
    ]);
    const pane = findActivePaneForSession(stdout);
    if (!pane) {
      this.clearCachedScrollPane(serverName, sessionName);
      return null;
    }

    this.setCachedScrollPane(serverName, sessionName, pane);
    return pane;
  }

  async check(forceRefresh?: boolean): Promise<TmuxCheckResult> {
    if (isWindows) {
      return { installed: false };
    }

    if (this.cache && !forceRefresh) {
      return this.cache;
    }

    try {
      const stdout = await execTmuxCommand(['-V']);
      const match = stdout.match(/tmux\s+(\d+\.\d+[a-z]?)/i);
      const result: TmuxCheckResult = {
        installed: true,
        version: match ? match[1] : undefined,
      };
      this.cache = result;
      return result;
    } catch {
      const result: TmuxCheckResult = { installed: false };
      this.cache = result;
      return result;
    }
  }

  async killSession(name: string, serverName?: string): Promise<void> {
    if (isWindows) return;
    try {
      const resolvedServerName = resolveTmuxServerName(serverName);
      await execTmux(resolvedServerName, ['kill-session', '-t', name]);
    } catch {
      // Session may already be gone — ignore errors
    }
  }

  async hasSession(name: string, serverName?: string): Promise<boolean> {
    if (isWindows) {
      return false;
    }

    try {
      const resolvedServerName = resolveTmuxServerName(serverName);
      await execTmux(resolvedServerName, ['has-session', '-t', name]);
      return true;
    } catch {
      return false;
    }
  }

  async probeSession(name: string, serverName?: string): Promise<TmuxSessionProbeStatus> {
    if (isWindows || !name) {
      return 'missing';
    }

    try {
      const resolvedServerName = resolveTmuxServerName(serverName);
      await execTmux(resolvedServerName, ['has-session', '-t', name]);
      return 'exists';
    } catch (error) {
      return isMissingSessionProbeError(error) ? 'missing' : 'failed';
    }
  }

  async captureSessionHistory(sessionName: string, serverName?: string): Promise<string> {
    if (isWindows || !sessionName) {
      return '';
    }

    const resolvedServerName = resolveTmuxServerName(serverName);

    try {
      const stdout = await execInPty(
        buildTmuxShellCommand(
          resolvedServerName,
          `list-panes -t ${shellQuote(sessionName)} -F ${shellQuote(LIST_PANES_FORMAT)}`
        ),
        {
          timeout: TMUX_COMMAND_TIMEOUT_MS,
        }
      );
      const pane = findActivePaneForSession(stdout);
      if (!pane) {
        return '';
      }

      return await execInPty(
        buildTmuxShellCommand(
          resolvedServerName,
          `capture-pane -p -e -J -S - -t ${shellQuote(pane.paneId)}`
        ),
        {
          timeout: TMUX_COMMAND_TIMEOUT_MS,
        }
      );
    } catch {
      return '';
    }
  }

  async ensureServerHealthy(serverName?: string): Promise<boolean> {
    if (isWindows) {
      return true;
    }

    const resolvedServerName = resolveTmuxServerName(serverName);
    const inFlightHealthCheck = this.serverHealthCheckPromises.get(resolvedServerName);
    if (inFlightHealthCheck) {
      return inFlightHealthCheck;
    }

    const healthCheckPromise = this.ensureServerHealthyInternal(resolvedServerName).finally(() => {
      if (this.serverHealthCheckPromises.get(resolvedServerName) === healthCheckPromise) {
        this.serverHealthCheckPromises.delete(resolvedServerName);
      }
    });

    this.serverHealthCheckPromises.set(resolvedServerName, healthCheckPromise);
    return healthCheckPromise;
  }

  async scrollClient(request: TmuxScrollClientRequest): Promise<TmuxScrollClientResult> {
    if (isWindows) {
      return { applied: false, sessionName: request.sessionName };
    }

    const amount = normalizeScrollAmount(request.amount);
    if (
      !request.sessionName ||
      ((request.direction === 'up' || request.direction === 'down') && amount === 0)
    ) {
      return { applied: false, sessionName: request.sessionName };
    }

    const serverName = resolveTmuxServerName(request.serverName);

    try {
      const pane = await this.resolveScrollPane(request.sessionName, serverName);
      if (!pane) {
        return { applied: false, sessionName: request.sessionName };
      }

      if (request.direction === 'bottom') {
        if (!pane.inMode) {
          this.setCachedScrollPane(serverName, request.sessionName, {
            paneId: pane.paneId,
            inMode: false,
          });
          return {
            applied: false,
            sessionName: request.sessionName,
            paneId: pane.paneId,
            inMode: false,
          };
        }

        await execTmux(serverName, ['send-keys', '-X', '-t', pane.paneId, 'cancel']);
        this.setCachedScrollPane(serverName, request.sessionName, {
          paneId: pane.paneId,
          inMode: false,
        });
        return {
          applied: true,
          sessionName: request.sessionName,
          paneId: pane.paneId,
          inMode: false,
        };
      }

      if (request.direction === 'up') {
        if (!pane.inMode) {
          await execTmux(serverName, ['copy-mode', '-eH', '-t', pane.paneId]);
          pane.inMode = true;
        }
        await execTmux(serverName, [
          'send-keys',
          '-X',
          '-N',
          String(amount),
          '-t',
          pane.paneId,
          'scroll-up',
        ]);
        this.setCachedScrollPane(serverName, request.sessionName, {
          paneId: pane.paneId,
          inMode: true,
        });
        return {
          applied: true,
          sessionName: request.sessionName,
          paneId: pane.paneId,
          inMode: true,
        };
      } else {
        if (!pane.inMode) {
          this.setCachedScrollPane(serverName, request.sessionName, {
            paneId: pane.paneId,
            inMode: false,
          });
          return {
            applied: false,
            sessionName: request.sessionName,
            paneId: pane.paneId,
            inMode: false,
          };
        }

        await execTmux(serverName, [
          'send-keys',
          '-X',
          '-N',
          String(amount),
          '-t',
          pane.paneId,
          'scroll-down-and-cancel',
        ]);
        const refreshedPane = await this.resolveScrollPane(request.sessionName, serverName, {
          forceRefresh: true,
        });
        return {
          applied: true,
          sessionName: request.sessionName,
          paneId: pane.paneId,
          inMode: refreshedPane?.inMode ?? false,
        };
      }
    } catch {
      this.clearCachedScrollPane(serverName, request.sessionName);
      return { applied: false, sessionName: request.sessionName };
    }
  }

  async killServer(): Promise<void> {
    if (isWindows) return;
    try {
      const serverName = resolveTmuxServerName();
      await execInPty(buildTmuxShellCommand(serverName, 'kill-server'), {
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }

  killServerSync(): void {
    if (isWindows) return;
    try {
      const serverName = getAppRuntimeIdentity().tmuxServerName;
      ensureTmuxSocketDirectory(serverName);
      spawnSync('tmux', ['-S', resolveTmuxSocketPath(serverName), 'kill-server'], {
        timeout: 3000,
        stdio: 'ignore',
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }

  private async probeServer(serverName: string): Promise<boolean> {
    const healthcheckSessionName = buildTmuxHealthcheckSessionName();
    try {
      await execTmux(serverName, [
        '-f',
        '/dev/null',
        'new-session',
        '-d',
        '-s',
        healthcheckSessionName,
        'sh',
        '-lc',
        'printf infilux-healthcheck; sleep 1',
      ]);
      return true;
    } catch (error) {
      if (isResourceExhaustionError(error)) {
        throw toTmuxResourceExhaustionError(error, serverName, 'probing');
      }
      return false;
    } finally {
      await execTmux(serverName, ['kill-session', '-t', healthcheckSessionName]).catch(() => {
        // Ignore missing or already-exited healthcheck sessions.
      });
    }
  }

  private async ensureServerHealthyInternal(serverName: string): Promise<boolean> {
    const installStatus = await this.check();
    if (!installStatus.installed) {
      return false;
    }

    if (await this.probeServer(serverName)) {
      return true;
    }

    return false;
  }
}

export const tmuxDetector = new TmuxDetector();
