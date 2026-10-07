import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCodexWorktreeHistoryScenario } from './codexWorktreeHistoryScenario';
import { buildElectronLaunchEnvironment, quitElectronApplication } from './electronApp';

describe('scenario-specific Electron environment isolation', () => {
  it('keeps Codex credentials and app state out of an isolated worktree history launch', async () => {
    const scenario = await createCodexWorktreeHistoryScenario();
    const fakeHostEnvironment: NodeJS.ProcessEnv = {
      PATH: '/fixture/bin',
      HOME: '/host/home',
      USERPROFILE: '/host/home',
      CODEX_HOME: '/host/codex-home',
      CODEX_CONFIG_DIR: '/host/codex-config',
      CODEX_SQLITE_HOME: '/host/codex-sqlite',
      CODEX_HISTORY_E2E_LOG: '/host/private.log',
      CODEX_API_KEY: 'fake-codex-api-key',
      CODEX_ACCESS_TOKEN: 'fake-codex-token',
      OPENAI_API_KEY: 'fake-openai-api-key',
      OPENAI_ORG_ID: 'fake-openai-org',
      AZURE_OPENAI_API_KEY: 'fake-azure-api-key',
      AZURE_OPENAI_ENDPOINT: 'https://host.invalid',
      INFILUX_CODEX_API_KEY: 'fake-managed-codex-api-key',
      INFILUX_CODEX_PROVIDER_KEY: 'fake-managed-provider-key',
      CLAUDE_CONFIG_DIR: '/host/claude-config',
      ANTHROPIC_AUTH_TOKEN: 'fake-anthropic-token',
      CURSOR_CONFIG_DIR: '/host/cursor-config',
      CURSOR_API_KEY: 'fake-cursor-api-key',
      GEMINI_CONFIG_DIR: '/host/gemini-config',
      GEMINI_CLI_HOME: '/host/gemini-home',
      GEMINI_API_KEY: 'fake-gemini-api-key',
      GOOGLE_API_KEY: 'fake-google-api-key',
      GOOGLE_GEMINI_BASE_URL: 'https://host.invalid',
      APPDATA: '/host/appdata',
      LOCALAPPDATA: '/host/localappdata',
      XDG_CONFIG_HOME: '/host/config',
      XDG_DATA_HOME: '/host/data',
      XDG_CACHE_HOME: '/host/cache',
    };

    try {
      const environment = buildElectronLaunchEnvironment(scenario, fakeHostEnvironment);
      expect(environment.PATH).toBe('/fixture/bin');
      expect(environment.HOME).toBe(scenario.homeDir);
      expect(environment.USERPROFILE).toBe(scenario.homeDir);
      expect(environment.CODEX_HOME).toBe(join(scenario.homeDir, '.codex'));
      expect(environment.CODEX_HISTORY_E2E_LOG).toBe(scenario.invocationLogPath);
      expect(environment.APPDATA).toBe(join(scenario.homeDir, 'AppData', 'Roaming'));
      expect(environment.LOCALAPPDATA).toBe(join(scenario.homeDir, 'AppData', 'Local'));
      expect(environment.XDG_CONFIG_HOME).toBe(join(scenario.homeDir, '.config'));
      expect(environment.XDG_DATA_HOME).toBe(join(scenario.homeDir, '.local', 'share'));
      expect(environment.XDG_CACHE_HOME).toBe(join(scenario.homeDir, '.cache'));
      for (const name of [
        'CODEX_CONFIG_DIR',
        'CODEX_SQLITE_HOME',
        'CODEX_API_KEY',
        'CODEX_ACCESS_TOKEN',
        'OPENAI_API_KEY',
        'OPENAI_ORG_ID',
        'AZURE_OPENAI_API_KEY',
        'AZURE_OPENAI_ENDPOINT',
        'INFILUX_CODEX_API_KEY',
        'INFILUX_CODEX_PROVIDER_KEY',
        'CLAUDE_CONFIG_DIR',
        'ANTHROPIC_AUTH_TOKEN',
        'CURSOR_CONFIG_DIR',
        'CURSOR_API_KEY',
        'GEMINI_CONFIG_DIR',
        'GEMINI_CLI_HOME',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_GEMINI_BASE_URL',
      ]) {
        expect(Object.hasOwn(environment, name)).toBe(false);
      }

      const ordinaryLaunch = buildElectronLaunchEnvironment(
        { homeDir: scenario.homeDir, profileName: scenario.profileName },
        fakeHostEnvironment
      );
      expect(ordinaryLaunch.CODEX_HOME).toBe(fakeHostEnvironment.CODEX_HOME);
      expect(ordinaryLaunch.OPENAI_API_KEY).toBeDefined();
      expect(ordinaryLaunch.APPDATA).toBe(fakeHostEnvironment.APPDATA);
      expect(ordinaryLaunch.CLAUDE_CONFIG_DIR).toBe(fakeHostEnvironment.CLAUDE_CONFIG_DIR);
      expect(ordinaryLaunch.CURSOR_API_KEY).toBeDefined();
      expect(ordinaryLaunch.GEMINI_CLI_HOME).toBe(fakeHostEnvironment.GEMINI_CLI_HOME);
    } finally {
      await scenario.cleanup();
    }
  });
});

describe('quitElectronApplication', () => {
  it('installs renderer confirmations, requests app.quit(), and waits for the close event', async () => {
    const quit = vi.fn();
    const pageEvaluate = vi.fn(async () => undefined);
    const windows = vi.fn(() => [{ evaluate: pageEvaluate }]);
    const evaluate = vi.fn(
      async (pageFunction: ({ app }: { app: { quit: () => void } }) => void) => {
        pageFunction({ app: { quit } });
      }
    );
    const waitForEvent = vi.fn(async () => undefined);
    const process = vi.fn(() => ({ kill: vi.fn(), exitCode: null, killed: false }));

    await quitElectronApplication(
      {
        evaluate,
        windows,
        waitForEvent,
        process,
      } as never,
      {
        closeTimeoutMs: 1234,
        forceKillTimeoutMs: 5678,
      }
    );

    expect(waitForEvent).toHaveBeenNthCalledWith(1, 'close', { timeout: 1234 });
    expect(windows).toHaveBeenCalledTimes(1);
    expect(pageEvaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(process).not.toHaveBeenCalled();
  });

  it('force kills the Electron process tree when the close event does not arrive in time', async () => {
    const quit = vi.fn();
    const childProcess = new EventEmitter() as ChildProcess &
      EventEmitter & {
        pid: number;
        exitCode: number | null;
        killed: boolean;
      };
    childProcess.pid = 42;
    childProcess.exitCode = null;
    childProcess.killed = false;

    const evaluate = vi.fn(
      async (pageFunction: ({ app }: { app: { quit: () => void } }) => void) => {
        pageFunction({ app: { quit } });
      }
    );
    const windows = vi.fn(() => []);
    const killProcess = vi.fn((pid: number) => {
      if (pid === 42) {
        childProcess.exitCode = 0;
        childProcess.killed = true;
        queueMicrotask(() => {
          childProcess.emit('exit', 0, 'SIGKILL');
        });
      }
    });
    const waitForEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('Timeout 1500ms exceeded while waiting for event "close"'))
      .mockRejectedValueOnce(new Error('close event did not fire after process kill'));
    const process = vi.fn(() => childProcess);
    const resolveProcessTreePids = vi.fn(async () => [42, 420, 421]);

    await quitElectronApplication(
      {
        evaluate,
        windows,
        waitForEvent,
        process,
      } as never,
      {
        closeTimeoutMs: 1500,
        forceKillTimeoutMs: 2500,
        resolveProcessTreePids,
        killProcess,
      }
    );

    expect(waitForEvent).toHaveBeenNthCalledWith(1, 'close', { timeout: 1500 });
    expect(waitForEvent).toHaveBeenNthCalledWith(2, 'close', { timeout: 2500 });
    expect(windows).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledTimes(1);
    expect(resolveProcessTreePids).toHaveBeenCalledWith(42);
    expect(killProcess.mock.calls).toEqual([
      [421, 'SIGKILL'],
      [420, 'SIGKILL'],
      [42, 'SIGKILL'],
    ]);
  });
});
