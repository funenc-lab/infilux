import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { quitElectronApplication } from './electronApp';

describe('quitElectronApplication', () => {
  it('requests app.exit(0) from the main process and waits for the close event', async () => {
    const exit = vi.fn();
    const evaluate = vi.fn(
      async (pageFunction: ({ app }: { app: { exit: (code?: number) => void } }) => void) => {
        pageFunction({ app: { exit } });
      }
    );
    const waitForEvent = vi.fn(async () => undefined);
    const process = vi.fn(() => ({ kill: vi.fn(), exitCode: null, killed: false }));

    await quitElectronApplication(
      {
        evaluate,
        waitForEvent,
        process,
      } as never,
      {
        closeTimeoutMs: 1234,
        forceKillTimeoutMs: 5678,
      }
    );

    expect(waitForEvent).toHaveBeenNthCalledWith(1, 'close', { timeout: 1234 });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(process).not.toHaveBeenCalled();
  });

  it('force kills the Electron process tree when the close event does not arrive in time', async () => {
    const exit = vi.fn();
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
      async (pageFunction: ({ app }: { app: { exit: (code?: number) => void } }) => void) => {
        pageFunction({ app: { exit } });
      }
    );
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
    expect(exit).toHaveBeenCalledWith(0);
    expect(process).toHaveBeenCalledTimes(1);
    expect(resolveProcessTreePids).toHaveBeenCalledWith(42);
    expect(killProcess.mock.calls).toEqual([
      [421, 'SIGKILL'],
      [420, 'SIGKILL'],
      [42, 'SIGKILL'],
    ]);
  });
});
