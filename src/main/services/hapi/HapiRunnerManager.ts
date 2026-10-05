import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { killProcessTree } from '../../utils/processUtils';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';
import { hapiServerManager } from './HapiServerManager';

export interface HapiRunnerStatus {
  running: boolean;
  pid?: number;
  error?: string;
}

type RunnerAction = 'start' | 'stop';

interface RunnerCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

class HapiRunnerManager extends EventEmitter {
  private status: HapiRunnerStatus = { running: false };
  private isCleaningUp = false;
  private lastHapiCommand: string | null = null;
  private readonly cancelPendingStarts = new Set<() => void>();
  private readonly pendingStarts = new Set<Promise<HapiRunnerStatus>>();

  private async getRunnerCommand(action: RunnerAction): Promise<string> {
    const hapiCommand =
      action === 'stop' && this.isCleaningUp && this.lastHapiCommand
        ? this.lastHapiCommand
        : await hapiServerManager.getHapiCommand();
    if (action === 'start') {
      this.lastHapiCommand = hapiCommand;
    }
    return hapiCommand === 'hapi'
      ? `hapi runner ${action}`
      : `npx -y @twsxtd/hapi runner ${action}`;
  }

  private async runRunnerCommand(
    action: RunnerAction,
    timeoutMs = 30000
  ): Promise<RunnerCommandResult> {
    const command = await this.getRunnerCommand(action);
    if (action === 'start' && this.isCleaningUp) {
      return { code: null, stdout: '', stderr: '', timedOut: false };
    }
    const { shell, args: shellArgs } = getShellForCommand();

    return new Promise((resolve) => {
      const proc = spawn(shell, [...shellArgs, command], {
        env: getEnvForCommand(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const settle = (result: RunnerCommandResult) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        this.cancelPendingStarts.delete(cancelStart);
        resolve(result);
      };
      const cancelStart = () => {
        if (settled) {
          return;
        }
        killProcessTree(proc);
        settle({ code: null, stdout, stderr, timedOut: false });
      };
      if (action === 'start') {
        this.cancelPendingStarts.add(cancelStart);
      }

      timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        killProcessTree(proc);
        settle({ code: null, stdout, stderr, timedOut: true });
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        if (settled) {
          return;
        }
        settle({
          code: null,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
          timedOut: false,
        });
      });

      proc.on('exit', (code) => {
        settle({ code, stdout, stderr, timedOut: false });
      });
    });
  }

  private setStatus(nextStatus: HapiRunnerStatus): HapiRunnerStatus {
    const changed =
      this.status.running !== nextStatus.running ||
      this.status.pid !== nextStatus.pid ||
      this.status.error !== nextStatus.error;

    this.status = nextStatus;

    if (changed) {
      this.emit('statusChanged', this.status);
    }

    return this.status;
  }

  private buildCommandError(action: RunnerAction, result: RunnerCommandResult): string {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (output) {
      return output;
    }

    if (result.timedOut) {
      return `hapi runner ${action} timed out`;
    }

    return `hapi runner ${action} exited with code ${result.code ?? 'unknown'}`;
  }

  private extractPid(output: string): number | undefined {
    const match = output.match(/\bpid\s*[:=]?\s*(\d+)\b/i);
    if (!match) {
      return undefined;
    }

    const pid = Number(match[1]);
    return Number.isFinite(pid) ? pid : undefined;
  }

  private isRunningOutput(output: string): boolean {
    return /(already\s+running|\brunning\b|\bactive\b|\bonline\b)/i.test(output);
  }

  private isStoppedOutput(output: string): boolean {
    return /(already\s+stopped|not\s+running|\bstopped\b|\binactive\b|no\s+runner)/i.test(output);
  }

  start(): Promise<HapiRunnerStatus> {
    if (this.isCleaningUp) {
      return Promise.resolve(this.status);
    }

    const startPromise = this.runRunnerCommand('start', 120000).then((result) => {
      if (this.isCleaningUp) {
        return this.status;
      }
      const output = `${result.stdout}\n${result.stderr}`.trim();

      if (result.code === 0 || this.isRunningOutput(output)) {
        return this.setStatus({
          running: true,
          pid: this.extractPid(output),
        });
      }

      return this.setStatus({
        running: false,
        error: this.buildCommandError('start', result),
      });
    });

    this.pendingStarts.add(startPromise);
    void startPromise.then(
      () => this.pendingStarts.delete(startPromise),
      () => this.pendingStarts.delete(startPromise)
    );
    return startPromise;
  }

  async stop(timeoutMs = 30000): Promise<HapiRunnerStatus> {
    const result = await this.runRunnerCommand('stop', timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`.trim();

    if (result.code === 0 || this.isStoppedOutput(output)) {
      return this.setStatus({ running: false });
    }

    if (this.isRunningOutput(output)) {
      return this.setStatus({
        ...this.status,
        running: true,
        error: this.buildCommandError('stop', result),
      });
    }

    return this.setStatus({
      ...this.status,
      error: this.buildCommandError('stop', result),
    });
  }

  getStatus(): HapiRunnerStatus {
    return this.status;
  }

  private beginCleanup(): boolean {
    const shouldStop =
      this.status.running ||
      this.cancelPendingStarts.size > 0 ||
      (this.pendingStarts.size > 0 && this.lastHapiCommand !== null);
    this.isCleaningUp = true;
    for (const cancelStart of Array.from(this.cancelPendingStarts)) {
      cancelStart();
    }
    return shouldStop;
  }

  async cleanup(timeoutMs = 5000): Promise<void> {
    if (!this.beginCleanup()) {
      return;
    }
    const status = await this.stop(timeoutMs);
    if (status.error) {
      console.warn('[hapi:runner] Cleanup warning:', status.error);
    }
  }

  cleanupSync(): void {
    if (!this.beginCleanup()) {
      return;
    }

    if (!this.lastHapiCommand) {
      console.warn('[hapi:runner] Sync cleanup skipped: runner command is unavailable');
      return;
    }

    try {
      const { shell, args: shellArgs } = getShellForCommand();
      const command =
        this.lastHapiCommand === 'hapi' ? 'hapi runner stop' : 'npx -y @twsxtd/hapi runner stop';
      const result = spawnSync(shell, [...shellArgs, command], {
        env: getEnvForCommand(),
        stdio: 'ignore',
        timeout: 1500,
      });
      if (result.error || result.status !== 0) {
        console.warn(
          '[hapi:runner] Sync cleanup failed:',
          result.error ??
            new Error(`hapi runner stop exited with code ${result.status ?? 'unknown'}`)
        );
        return;
      }
      this.setStatus({ running: false });
    } catch (error) {
      console.warn('[hapi:runner] Sync cleanup failed:', error);
    }
  }
}

export const hapiRunnerManager = new HapiRunnerManager();
