import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  TmuxCheckResult,
  TmuxScrollClientRequest,
  TmuxScrollClientResult,
} from '@shared/types';
import { buildManagedTmuxSocketDirPath, buildManagedTmuxSocketPath } from '@shared/utils/tmux';
import { getAppRuntimeIdentity } from '../../utils/runtimeIdentity';
import { execInPty } from '../../utils/shell';

const isWindows = process.platform === 'win32';
const TMUX_COMMAND_TIMEOUT_MS = 5000;
const LIST_PANES_FORMAT = '#{pane_id}\t#{pane_active}\t#{pane_in_mode}';
const TMUX_HEALTHCHECK_SESSION_PREFIX = 'infilux-healthcheck';
const TMUX_RESOURCE_EXHAUSTION_ERROR_CODES = new Set(['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM']);

function isResourceExhaustionError(error: unknown): error is NodeJS.ErrnoException {
  const nodeError = error as NodeJS.ErrnoException;
  return (
    typeof nodeError?.code === 'string' && TMUX_RESOURCE_EXHAUSTION_ERROR_CODES.has(nodeError.code)
  );
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

function buildTmuxHealthcheckCommand(serverName: string, sessionName: string): string {
  return (
    `${buildTmuxShellCommand(serverName, `-f /dev/null new-session -d -s ${shellQuote(sessionName)}`)} ` +
    // Keep the probe session alive long enough for kill-session to observe it reliably.
    `${shellQuote('printf infilux-healthcheck; sleep 1')} >/dev/null 2>&1 && ` +
    `${buildTmuxShellCommand(serverName, `kill-session -t ${shellQuote(sessionName)}`)} >/dev/null 2>&1`
  );
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

function normalizeScrollAmount(amount: number): number {
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

class TmuxDetector {
  private cache: TmuxCheckResult | null = null;
  private readonly serverHealthCheckPromises = new Map<string, Promise<boolean>>();

  async check(forceRefresh?: boolean): Promise<TmuxCheckResult> {
    if (isWindows) {
      return { installed: false };
    }

    if (this.cache && !forceRefresh) {
      return this.cache;
    }

    try {
      const stdout = await execInPty('tmux -V', { timeout: TMUX_COMMAND_TIMEOUT_MS });
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
      await execInPty(
        buildTmuxShellCommand(resolvedServerName, `kill-session -t ${shellQuote(name)}`),
        {
          timeout: TMUX_COMMAND_TIMEOUT_MS,
        }
      );
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
      await execInPty(
        buildTmuxShellCommand(resolvedServerName, `has-session -t ${shellQuote(name)}`),
        {
          timeout: TMUX_COMMAND_TIMEOUT_MS,
        }
      );
      return true;
    } catch {
      return false;
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
    if (!request.sessionName || amount === 0) {
      return { applied: false, sessionName: request.sessionName };
    }

    const serverName = resolveTmuxServerName(request.serverName);

    try {
      const stdout = await execInPty(
        buildTmuxShellCommand(
          serverName,
          `list-panes -t ${shellQuote(request.sessionName)} -F ${shellQuote(LIST_PANES_FORMAT)}`
        ),
        {
          timeout: TMUX_COMMAND_TIMEOUT_MS,
        }
      );
      const pane = findActivePaneForSession(stdout);
      if (!pane) {
        return { applied: false, sessionName: request.sessionName };
      }

      if (request.direction === 'up') {
        await execInPty(
          buildTmuxShellCommand(serverName, `copy-mode -eH -t ${shellQuote(pane.paneId)}`),
          {
            timeout: TMUX_COMMAND_TIMEOUT_MS,
          }
        );
        await execInPty(
          buildTmuxShellCommand(
            serverName,
            `send-keys -X -N ${amount} -t ${shellQuote(pane.paneId)} scroll-up`
          ),
          {
            timeout: TMUX_COMMAND_TIMEOUT_MS,
          }
        );
      } else {
        if (!pane.inMode) {
          return {
            applied: false,
            sessionName: request.sessionName,
            paneId: pane.paneId,
          };
        }

        await execInPty(
          buildTmuxShellCommand(
            serverName,
            `send-keys -X -N ${amount} -t ${shellQuote(pane.paneId)} scroll-down-and-cancel`
          ),
          {
            timeout: TMUX_COMMAND_TIMEOUT_MS,
          }
        );
      }

      return {
        applied: true,
        sessionName: request.sessionName,
        paneId: pane.paneId,
      };
    } catch {
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
    try {
      await execInPty(buildTmuxHealthcheckCommand(serverName, buildTmuxHealthcheckSessionName()), {
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      });
      return true;
    } catch (error) {
      if (isResourceExhaustionError(error)) {
        throw toTmuxResourceExhaustionError(error, serverName, 'probing');
      }
      return false;
    }
  }

  private resetServer(serverName: string): void {
    this.killServerSyncByName(serverName);
    this.killResidualProcesses(serverName);
    this.removeSocketFile(serverName);
  }

  private async ensureServerHealthyInternal(serverName: string): Promise<boolean> {
    const installStatus = await this.check();
    if (!installStatus.installed) {
      return false;
    }

    if (await this.probeServer(serverName)) {
      return true;
    }

    this.resetServer(serverName);
    return this.probeServer(serverName);
  }

  private killServerSyncByName(serverName: string): void {
    try {
      ensureTmuxSocketDirectory(serverName);
      spawnSync('tmux', ['-S', resolveTmuxSocketPath(serverName), 'kill-server'], {
        timeout: 3000,
        stdio: 'ignore',
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }

  private killResidualProcesses(serverName: string): void {
    let stdout = '';

    try {
      const result = spawnSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {
        encoding: 'utf8',
        timeout: 3000,
      });
      stdout = typeof result.stdout === 'string' ? result.stdout : '';
    } catch {
      return;
    }

    const marker = `tmux -S ${resolveTmuxSocketPath(serverName)}`;
    const pids = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes(marker))
      .map((line) => {
        const match = line.match(/^(\d+)/);
        return match ? Number.parseInt(match[1], 10) : null;
      })
      .filter(
        (value): value is number =>
          value !== null && Number.isInteger(value) && value > 0 && value !== process.pid
      );

    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Ignore already-exited processes.
      }
    }
  }

  private removeSocketFile(serverName: string): void {
    try {
      rmSync(resolveTmuxSocketPath(serverName), { force: true });
    } catch {
      // Ignore missing or busy socket files.
    }
  }
}

export const tmuxDetector = new TmuxDetector();
