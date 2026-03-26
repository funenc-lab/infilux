import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecCallback = (error: Error | null, stdout: string, stderr?: string) => void;

class FakeChildProcess extends EventEmitter {
  public pid = 4321;
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  emitStdout(value: string) {
    this.stdout.emit('data', Buffer.from(value));
  }

  emitStderr(value: string) {
    this.stderr.emit('data', Buffer.from(value));
  }

  emitError(error: Error) {
    this.emit('error', error);
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emit('exit', code, signal);
  }
}

const hapiServerTestDoubles = vi.hoisted(() => {
  const exec = vi.fn();
  const spawn = vi.fn();
  const randomBytes = vi.fn();
  const killProcessTree = vi.fn();
  const execInPty = vi.fn();
  const getEnvForCommand = vi.fn();
  const getShellForCommand = vi.fn();
  const spawned: FakeChildProcess[] = [];

  function mockExecImplementation(impl: (command: string, callback: ExecCallback) => void) {
    exec.mockImplementation(
      (command: string, optionsOrCallback: unknown, maybeCallback?: ExecCallback) => {
        const callback =
          typeof optionsOrCallback === 'function'
            ? (optionsOrCallback as ExecCallback)
            : maybeCallback;
        if (!callback) {
          throw new Error('Missing exec callback');
        }
        impl(command, callback);
        return {} as never;
      }
    );
    Object.assign(exec, {
      [promisify.custom]: (command: string) =>
        new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          impl(command, (error, stdout, stderr = '') => {
            if (error) {
              reject(Object.assign(error, { stdout, stderr }));
              return;
            }
            resolve({ stdout, stderr });
          });
        }),
    });
  }

  function reset() {
    exec.mockReset();
    spawn.mockReset();
    randomBytes.mockReset();
    killProcessTree.mockReset();
    execInPty.mockReset();
    getEnvForCommand.mockReset();
    getShellForCommand.mockReset();
    spawned.length = 0;

    randomBytes.mockReturnValue(Buffer.from('a'.repeat(32)));
    execInPty.mockResolvedValue('happy 2.3.4');
    getEnvForCommand.mockImplementation((env?: Record<string, string>) => ({
      PATH: '/mock/bin',
      ...(env ?? {}),
    }));
    getShellForCommand.mockReturnValue({
      shell: '/bin/zsh',
      args: ['-lc'],
    });
    mockExecImplementation((_command, callback) => {
      callback(null, 'hapi 1.2.3\n', '');
    });
    spawn.mockImplementation(() => {
      const child = new FakeChildProcess();
      spawned.push(child);
      return child;
    });
  }

  return {
    exec,
    spawn,
    randomBytes,
    killProcessTree,
    execInPty,
    getEnvForCommand,
    getShellForCommand,
    spawned,
    mockExecImplementation,
    reset,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    exec: hapiServerTestDoubles.exec,
    spawn: hapiServerTestDoubles.spawn,
  };
});

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: hapiServerTestDoubles.randomBytes,
  };
});

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: hapiServerTestDoubles.killProcessTree,
}));

vi.mock('../../../utils/shell', () => ({
  execInPty: hapiServerTestDoubles.execInPty,
  getEnvForCommand: hapiServerTestDoubles.getEnvForCommand,
  getShellForCommand: hapiServerTestDoubles.getShellForCommand,
}));

describe('HapiServerManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hapiServerTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates tokens and caches global install checks', async () => {
    const { hapiServerManager } = await import('../HapiServerManager');

    expect(hapiServerManager.generateToken()).toBe(
      '6161616161616161616161616161616161616161616161616161616161616161'
    );

    await expect(hapiServerManager.checkGlobalInstall()).resolves.toEqual({
      installed: true,
      version: '1.2.3',
    });
    await expect(hapiServerManager.checkGlobalInstall()).resolves.toEqual({
      installed: true,
      version: '1.2.3',
    });
  });

  it('reads version from exec errors and reports failed global installs', async () => {
    hapiServerTestDoubles.mockExecImplementation((_command, callback) => {
      const error = Object.assign(new Error('profile warning'), {
        stdout: 'hapi 9.8.7\n',
      });
      callback(error, 'hapi 9.8.7\n', '');
    });

    const { hapiServerManager } = await import('../HapiServerManager');

    await expect(hapiServerManager.checkGlobalInstall(true)).resolves.toEqual({
      installed: true,
      version: '9.8.7',
    });

    hapiServerTestDoubles.mockExecImplementation((_command, callback) => {
      callback(new Error('missing'), '', '');
    });
    vi.resetModules();
    const refreshed = await import('../HapiServerManager');
    await expect(refreshed.hapiServerManager.checkGlobalInstall(true)).resolves.toEqual({
      installed: false,
    });
  });

  it('checks happy installation with PTY output and fallback behavior', async () => {
    const { hapiServerManager } = await import('../HapiServerManager');

    await expect(hapiServerManager.checkHappyGlobalInstall()).resolves.toEqual({
      installed: true,
      version: '2.3.4',
    });
    await expect(hapiServerManager.checkHappyGlobalInstall()).resolves.toEqual({
      installed: true,
      version: '2.3.4',
    });
    expect(hapiServerTestDoubles.execInPty).toHaveBeenCalledTimes(1);

    hapiServerTestDoubles.execInPty.mockResolvedValueOnce('happy is installed');
    await expect(hapiServerManager.checkHappyGlobalInstall(true)).resolves.toEqual({
      installed: true,
      version: undefined,
    });

    hapiServerTestDoubles.execInPty.mockResolvedValueOnce('');
    await expect(hapiServerManager.checkHappyGlobalInstall(true)).resolves.toEqual({
      installed: false,
    });

    hapiServerTestDoubles.execInPty.mockRejectedValueOnce(new Error('not found'));
    await expect(hapiServerManager.checkHappyGlobalInstall(true)).resolves.toEqual({
      installed: false,
    });
  });

  it('starts hapi, detects readiness, and handles process lifecycle events', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hapiServerManager } = await import('../HapiServerManager');
    const statuses: Array<Record<string, unknown>> = [];
    hapiServerManager.on('statusChanged', (status) => {
      statuses.push({ ...status });
    });

    const startStatus = await hapiServerManager.start({
      webappPort: 3010,
      cliApiToken: 'cli-token',
      telegramBotToken: 'tg-token',
      webappUrl: 'http://localhost:3010',
      allowedChatIds: '1,2',
    });

    expect(startStatus).toEqual({
      running: true,
      pid: 4321,
      port: 3010,
    });
    expect(hapiServerTestDoubles.spawn).toHaveBeenCalledWith('/bin/zsh', ['-lc', 'hapi server'], {
      env: {
        PATH: '/mock/bin',
        WEBAPP_PORT: '3010',
        CLI_API_TOKEN: 'cli-token',
        TELEGRAM_BOT_TOKEN: 'tg-token',
        WEBAPP_URL: 'http://localhost:3010',
        ALLOWED_CHAT_IDS: '1,2',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const child = hapiServerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing child process');
    }

    child.emitStdout('server started and listening');
    expect(statuses).toContainEqual({
      running: true,
      pid: 4321,
      port: 3010,
      ready: true,
    });

    child.emitError(new Error('spawn failed'));
    expect(hapiServerManager.getStatus()).toEqual({
      running: false,
      error: 'spawn failed',
    });

    await expect(
      hapiServerManager.start({
        webappPort: 3010,
        cliApiToken: '',
        telegramBotToken: '',
        webappUrl: '',
        allowedChatIds: '',
      })
    ).resolves.toEqual({
      running: true,
      pid: 4321,
      port: 3010,
    });
    const secondChild = hapiServerTestDoubles.spawned[1];
    if (!secondChild) {
      throw new Error('Missing second child process');
    }
    secondChild.emitStderr('ready on stderr');
    secondChild.emitExit(0, null);
    expect(hapiServerManager.getStatus()).toEqual({ running: false });
    expect(logSpy).toHaveBeenCalledWith('[hapi] Server ready detected!');
    expect(logSpy).toHaveBeenCalledWith('[hapi] Server ready detected (stderr)!');
    expect(errorSpy).toHaveBeenCalledWith('[hapi] Process error:', expect.any(Error));
  });

  it('stops, restarts, and cleans up running processes', async () => {
    const { hapiServerManager } = await import('../HapiServerManager');

    await hapiServerManager.start({
      webappPort: 4000,
      cliApiToken: '',
      telegramBotToken: '',
      webappUrl: '',
      allowedChatIds: '',
    });
    const child = hapiServerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing child process');
    }

    const stopPromise = hapiServerManager.stop();
    expect(hapiServerTestDoubles.killProcessTree).toHaveBeenCalledWith(child, 'SIGTERM');
    child.emit('exit');
    await expect(stopPromise).resolves.toEqual({ running: false });

    await expect(
      hapiServerManager.restart({
        webappPort: 5000,
        cliApiToken: '',
        telegramBotToken: '',
        webappUrl: '',
        allowedChatIds: '',
      })
    ).resolves.toEqual({
      running: true,
      pid: 4321,
      port: 5000,
    });

    expect(hapiServerTestDoubles.spawn).toHaveBeenCalledTimes(2);

    hapiServerManager.cleanup();
    expect(hapiServerTestDoubles.killProcessTree).toHaveBeenCalledWith(
      hapiServerTestDoubles.spawned[1]
    );
  });

  it('returns npx fallback command and start errors when global install is unavailable', async () => {
    hapiServerTestDoubles.mockExecImplementation((_command, callback) => {
      callback(new Error('missing'), '', '');
    });
    hapiServerTestDoubles.spawn.mockImplementationOnce(() => {
      throw new Error('spawn exploded');
    });

    const { hapiServerManager } = await import('../HapiServerManager');

    await expect(hapiServerManager.getHapiCommand()).resolves.toBe('npx -y @twsxtd/hapi');
    await expect(
      hapiServerManager.start({
        webappPort: 8080,
        cliApiToken: '',
        telegramBotToken: '',
        webappUrl: '',
        allowedChatIds: '',
      })
    ).resolves.toEqual({
      running: false,
      error: 'spawn exploded',
    });

    expect(await hapiServerManager.stop()).toEqual({
      running: false,
      error: 'spawn exploded',
    });
  });
});
