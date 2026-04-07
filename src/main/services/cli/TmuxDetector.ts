import { spawnSync } from 'node:child_process';
import type {
  TmuxCheckResult,
  TmuxScrollClientRequest,
  TmuxScrollClientResult,
} from '@shared/types';
import { getAppRuntimeIdentity } from '../../utils/runtimeIdentity';
import { execInPty } from '../../utils/shell';

const isWindows = process.platform === 'win32';
const TMUX_COMMAND_TIMEOUT_MS = 5000;
const LIST_PANES_FORMAT = '#{pane_id}\t#{pane_active}\t#{pane_in_mode}';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function resolveTmuxServerName(serverName?: string): string {
  return serverName || getAppRuntimeIdentity().tmuxServerName;
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

  async killSession(name: string): Promise<void> {
    if (isWindows) return;
    try {
      const serverName = resolveTmuxServerName();
      await execInPty(`tmux -L ${shellQuote(serverName)} kill-session -t ${shellQuote(name)}`, {
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      });
    } catch {
      // Session may already be gone — ignore errors
    }
  }

  async hasSession(name: string): Promise<boolean> {
    if (isWindows) {
      return false;
    }

    try {
      const serverName = resolveTmuxServerName();
      await execInPty(`tmux -L ${shellQuote(serverName)} has-session -t ${shellQuote(name)}`, {
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
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
        `tmux -L ${shellQuote(serverName)} list-panes -t ${shellQuote(request.sessionName)} -F ${shellQuote(LIST_PANES_FORMAT)}`,
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
          `tmux -L ${shellQuote(serverName)} copy-mode -eH -t ${shellQuote(pane.paneId)}`,
          {
            timeout: TMUX_COMMAND_TIMEOUT_MS,
          }
        );
        await execInPty(
          `tmux -L ${shellQuote(serverName)} send-keys -X -N ${amount} -t ${shellQuote(pane.paneId)} scroll-up`,
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
          `tmux -L ${shellQuote(serverName)} send-keys -X -N ${amount} -t ${shellQuote(pane.paneId)} scroll-down-and-cancel`,
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
      await execInPty(`tmux -L ${shellQuote(serverName)} kill-server`, {
        timeout: TMUX_COMMAND_TIMEOUT_MS,
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }

  killServerSync(): void {
    if (isWindows) return;
    try {
      spawnSync('tmux', ['-L', getAppRuntimeIdentity().tmuxServerName, 'kill-server'], {
        timeout: 3000,
        stdio: 'ignore',
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }
}

export const tmuxDetector = new TmuxDetector();
