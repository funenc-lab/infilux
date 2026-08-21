import type { ChildProcess } from 'node:child_process';
import { exec, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { killProcessTree } from '../../utils/processUtils';
import { execInPty, getEnvForCommand, getShellForCommand } from '../../utils/shell';

const execAsync = promisify(exec);
const FAILED_GLOBAL_INSTALL_CACHE_TTL_MS = 30_000;

export interface HapiConfig {
  webappPort: number;
  cliApiToken: string;
  telegramBotToken: string;
  webappUrl: string;
  allowedChatIds: string;
}

export interface HapiGlobalStatus {
  installed: boolean;
  version?: string;
}

export interface HappyGlobalStatus {
  installed: boolean;
  version?: string;
}

export interface HapiStatus {
  running: boolean;
  ready?: boolean;
  pid?: number;
  port?: number;
  error?: string;
}

class HapiServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private status: HapiStatus = { running: false };
  private ready: boolean = false;

  // Global installation cache
  private globalStatus: HapiGlobalStatus | null = null;
  private globalCacheTimestamp: number = 0;
  private globalStatusProbe: Promise<HapiGlobalStatus> | null = null;
  private readonly CACHE_TTL = 300000; // 5 minutes cache

  // Happy global installation cache
  private happyGlobalStatus: HappyGlobalStatus | null = null;
  private happyGlobalCacheTimestamp: number = 0;

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Execute command in login shell to load user's environment.
   * Uses user's configured shell from settings.
   */
  private async execInLoginShell(command: string, timeout = 5000): Promise<string> {
    const escapedCommand = command.replace(/"/g, '\\"');
    const { shell, args } = getShellForCommand();
    const fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    const { stdout } = await execAsync(fullCommand, {
      timeout,
      env: getEnvForCommand(),
    });
    return stdout;
  }

  /**
   * Check if hapi is globally installed (cached)
   */
  async checkGlobalInstall(forceRefresh = false): Promise<HapiGlobalStatus> {
    const cachedStatus = this.globalStatus;
    if (!forceRefresh && cachedStatus && this.hasFreshGlobalStatus(cachedStatus)) {
      return cachedStatus;
    }

    if (this.globalStatusProbe) {
      return this.globalStatusProbe;
    }

    const probe = this.probeGlobalInstall().finally(() => {
      if (this.globalStatusProbe === probe) {
        this.globalStatusProbe = null;
      }
    });
    this.globalStatusProbe = probe;
    return probe;
  }

  private hasFreshGlobalStatus(status: HapiGlobalStatus, now = Date.now()): boolean {
    const cacheTtl = status.installed ? this.CACHE_TTL : FAILED_GLOBAL_INSTALL_CACHE_TTL_MS;
    return now - this.globalCacheTimestamp < cacheTtl;
  }

  private async probeGlobalInstall(): Promise<HapiGlobalStatus> {
    try {
      // Increase timeout to 30000ms - PowerShell profile loading can be slow on first run
      const stdout = await this.execInLoginShell('hapi --version', 30000);
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      this.globalStatus = {
        installed: true,
        version: match ? match[1] : undefined,
      };
    } catch (error: unknown) {
      // PowerShell profile may have non-fatal errors (e.g., Set-PSReadLineOption in non-TTY)
      // Check if stdout contains version info despite the error
      const execError = error as { stdout?: string };
      if (execError.stdout) {
        const match = execError.stdout.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          this.globalStatus = {
            installed: true,
            version: match[1],
          };
          this.globalCacheTimestamp = Date.now();
          return this.globalStatus;
        }
      }
      this.globalStatus = { installed: false };
      this.globalCacheTimestamp = Date.now();
      return this.globalStatus;
    }

    this.globalCacheTimestamp = Date.now();
    return this.globalStatus;
  }

  /**
   * Check if happy is globally installed (cached)
   * Uses PTY to run 'happy --version' and force kills after timeout.
   * This works regardless of package manager (npm, pnpm, yarn, etc.)
   */
  async checkHappyGlobalInstall(forceRefresh = false): Promise<HappyGlobalStatus> {
    // Return cached result if still valid
    if (
      !forceRefresh &&
      this.happyGlobalStatus &&
      Date.now() - this.happyGlobalCacheTimestamp < this.CACHE_TTL
    ) {
      return this.happyGlobalStatus;
    }

    try {
      // Run happy --version in PTY and force kill after 10 seconds
      // Use longer timeout for slow environments (PowerShell startup, WSL cold start)
      // happy --version may hang due to child processes, but we can still get version from output
      const stdout = await execInPty('happy --version', { timeout: 10000, killOnTimeout: true });
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      if (match || stdout.toLowerCase().includes('happy')) {
        // Found version or happy output - installed
        this.happyGlobalStatus = {
          installed: true,
          version: match ? match[1] : undefined,
        };
      } else {
        // No valid output - not installed
        this.happyGlobalStatus = { installed: false };
        return this.happyGlobalStatus;
      }
    } catch {
      this.happyGlobalStatus = { installed: false };
      // Don't cache failed result - allow immediate retry
      return this.happyGlobalStatus;
    }

    this.happyGlobalCacheTimestamp = Date.now();
    return this.happyGlobalStatus;
  }

  /**
   * Get the hapi command to use (global 'hapi' or 'npx -y @twsxtd/hapi')
   */
  async getHapiCommand(): Promise<string> {
    const status = await this.checkGlobalInstall();
    return status.installed ? 'hapi' : 'npx -y @twsxtd/hapi';
  }

  async start(config: HapiConfig): Promise<HapiStatus> {
    if (this.process) {
      return this.status;
    }

    const env: Record<string, string> = {
      WEBAPP_PORT: String(config.webappPort),
    };

    if (config.cliApiToken) {
      env.CLI_API_TOKEN = config.cliApiToken;
    }
    if (config.telegramBotToken) {
      env.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
    }
    if (config.webappUrl) {
      env.WEBAPP_URL = config.webappUrl;
    }
    if (config.allowedChatIds) {
      env.ALLOWED_CHAT_IDS = config.allowedChatIds;
    }

    try {
      // Check if hapi is globally installed
      const hapiCommand = await this.getHapiCommand();
      const isGlobal = hapiCommand === 'hapi';

      // Use user's configured shell to ensure proper environment (nvm, etc.)
      const { shell, args: shellArgs } = getShellForCommand();
      const command = isGlobal ? 'hapi server' : 'npx -y @twsxtd/hapi server';

      this.process = spawn(shell, [...shellArgs, command], {
        env: getEnvForCommand(env),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });

      this.ready = false;
      this.status = {
        running: true,
        pid: this.process.pid,
        port: config.webappPort,
      };

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[hapi]', output);
        // Detect when server is ready (listening message)
        if (!this.ready && /listening|started|ready/i.test(output)) {
          console.log('[hapi] Server ready detected!');
          this.ready = true;
          this.status = { ...this.status, ready: true };
          this.emit('statusChanged', this.status);
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.error('[hapi]', output);
        // Also detect ready message from stderr
        if (!this.ready && /listening|started|ready/i.test(output)) {
          console.log('[hapi] Server ready detected (stderr)!');
          this.ready = true;
          this.status = { ...this.status, ready: true };
          this.emit('statusChanged', this.status);
        }
      });

      this.process.on('error', (error) => {
        console.error('[hapi] Process error:', error);
        this.ready = false;
        this.status = { running: false, error: error.message };
        this.process = null;
        this.emit('statusChanged', this.status);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[hapi] Process exited with code ${code}, signal ${signal}`);
        this.ready = false;
        this.status = { running: false };
        this.process = null;
        this.emit('statusChanged', this.status);
      });

      this.emit('statusChanged', this.status);
      return this.status;
    } catch (error) {
      this.status = {
        running: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit('statusChanged', this.status);
      return this.status;
    }
  }

  async stop(): Promise<HapiStatus> {
    if (!this.process) {
      return this.status;
    }

    return new Promise((resolve) => {
      const proc = this.process!;

      const timeout = setTimeout(() => {
        killProcessTree(proc);
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        this.process = null;
        this.status = { running: false };
        this.emit('statusChanged', this.status);
        resolve(this.status);
      });

      killProcessTree(proc, 'SIGTERM');
    });
  }

  async restart(config: HapiConfig): Promise<HapiStatus> {
    await this.stop();
    return this.start(config);
  }

  getStatus(): HapiStatus {
    return this.status;
  }

  cleanup(): void {
    if (this.process) {
      killProcessTree(this.process);
      this.process = null;
    }
  }
}

export const hapiServerManager = new HapiServerManager();
