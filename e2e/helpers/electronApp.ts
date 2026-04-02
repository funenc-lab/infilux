import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pidtree from 'pidtree';
import { type ElectronApplication, _electron as electron, type Page } from 'playwright';
import type { AgentSessionRecoveryScenario } from './agentSessionRecoveryScenario';

const PROJECT_ROOT = process.cwd();
const ELECTRON_BUILD_ENTRY = join(PROJECT_ROOT, 'out', 'main', 'index.cjs');
const DEFAULT_CLOSE_TIMEOUT_MS = 15000;
const DEFAULT_FORCE_KILL_TIMEOUT_MS = 5000;
const FORCE_KILL_SIGNAL = 'SIGKILL';

type ElectronAppLike = Pick<ElectronApplication, 'evaluate' | 'waitForEvent' | 'process'>;
type KillProcess = (pid: number, signal?: NodeJS.Signals | number) => void;
type ResolveProcessTreePids = (pid: number) => Promise<number[]>;

export interface LaunchedElectronApp {
  app: ElectronApplication;
  page: Page;
  consoleMessages: string[];
}

export interface QuitElectronApplicationOptions {
  closeTimeoutMs?: number;
  forceKillTimeoutMs?: number;
  killProcess?: KillProcess;
  resolveProcessTreePids?: ResolveProcessTreePids;
}

export function ensureElectronBuildExists(): void {
  if (!existsSync(ELECTRON_BUILD_ENTRY)) {
    throw new Error('Missing out/main/index.cjs. Run pnpm build before pnpm test:e2e.');
  }
}

export async function launchInfiluxForScenario(
  scenario: AgentSessionRecoveryScenario
): Promise<LaunchedElectronApp> {
  const consoleMessages: string[] = [];
  const app = await electron.launch({
    args: [PROJECT_ROOT],
    env: {
      ...process.env,
      HOME: scenario.homeDir,
      USERPROFILE: scenario.homeDir,
      ENSOAI_PROFILE: scenario.profileName,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
  });

  app.on('console', async (message) => {
    const values = await Promise.all(
      message.args().map(async (arg) => {
        try {
          return JSON.stringify(await arg.jsonValue());
        } catch {
          return `[unserializable:${arg.toString()}]`;
        }
      })
    );
    const renderedValues = values.length > 0 ? ` ${values.join(' ')}` : '';
    consoleMessages.push(`[main:${message.type()}] ${message.text()}${renderedValues}`);
  });

  const page = await app.firstWindow();

  page.on('console', (message) => {
    consoleMessages.push(`[renderer:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    consoleMessages.push(`[pageerror] ${error.message}`);
  });

  return {
    app,
    page,
    consoleMessages,
  };
}

function isExpectedCloseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Target page, context or browser has been closed/i.test(error.message);
}

async function requestMainProcessQuit(app: ElectronAppLike): Promise<void> {
  try {
    await app.evaluate(({ app }) => {
      app.exit(0);
    });
  } catch (error) {
    if (isExpectedCloseError(error)) {
      return;
    }
    throw error;
  }
}

async function defaultResolveProcessTreePids(pid: number): Promise<number[]> {
  const pids = await pidtree(pid, { root: true });
  return [...new Set(pids.filter((value) => Number.isInteger(value) && value > 0))];
}

function defaultKillProcess(
  pid: number,
  signal: NodeJS.Signals | number = FORCE_KILL_SIGNAL
): void {
  process.kill(pid, signal);
}

async function waitForChildProcessExit(
  childProcess: ChildProcess,
  timeoutMs: number
): Promise<void> {
  if (childProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      childProcess.off('exit', handleExit);
      childProcess.off('close', handleClose);
      callback();
    };

    const handleExit = () => finalize(resolve);
    const handleClose = () => finalize(resolve);

    timeout = setTimeout(() => {
      finalize(() => {
        reject(new Error(`Timed out waiting ${String(timeoutMs)}ms for Electron process exit.`));
      });
    }, timeoutMs);

    childProcess.once('exit', handleExit);
    childProcess.once('close', handleClose);
  });
}

function shouldIgnoreMissingProcess(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

async function forceKillElectronProcessTree(
  childProcess: ChildProcess,
  options: Required<Pick<QuitElectronApplicationOptions, 'forceKillTimeoutMs'>> &
    Pick<QuitElectronApplicationOptions, 'killProcess' | 'resolveProcessTreePids'>
): Promise<void> {
  const rootPid = childProcess.pid;
  if (!rootPid || rootPid <= 0) {
    await waitForChildProcessExit(childProcess, options.forceKillTimeoutMs);
    return;
  }

  const resolveProcessTreePids = options.resolveProcessTreePids ?? defaultResolveProcessTreePids;
  const killProcess = options.killProcess ?? defaultKillProcess;

  let pidsToKill: number[];
  try {
    pidsToKill = await resolveProcessTreePids(rootPid);
  } catch {
    pidsToKill = [rootPid];
  }

  const orderedPids = [...new Set(pidsToKill.filter((pid) => pid > 0))].sort((left, right) => {
    return right - left;
  });

  for (const pid of orderedPids) {
    try {
      killProcess(pid, FORCE_KILL_SIGNAL);
    } catch (error) {
      if (shouldIgnoreMissingProcess(error)) {
        continue;
      }
      throw error;
    }
  }

  await waitForChildProcessExit(childProcess, options.forceKillTimeoutMs);
}

export async function quitElectronApplication(
  app: ElectronAppLike,
  options: QuitElectronApplicationOptions = {}
): Promise<void> {
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const forceKillTimeoutMs = options.forceKillTimeoutMs ?? DEFAULT_FORCE_KILL_TIMEOUT_MS;
  const closePromise = app.waitForEvent('close', { timeout: closeTimeoutMs });

  await requestMainProcessQuit(app);

  try {
    await closePromise;
    return;
  } catch (error) {
    const childProcess = app.process();
    if (childProcess.exitCode !== null) {
      throw error;
    }

    const forcedClosePromise = app.waitForEvent('close', { timeout: forceKillTimeoutMs });
    await forceKillElectronProcessTree(childProcess, {
      forceKillTimeoutMs,
      killProcess: options.killProcess,
      resolveProcessTreePids: options.resolveProcessTreePids,
    });
    await forcedClosePromise.catch(() => undefined);
  }
}

export async function waitForRepositoryAndWorktree(
  page: Page,
  scenario: AgentSessionRecoveryScenario
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  const selectedRepoRow = page
    .locator('[data-active="repo"]')
    .filter({ hasText: scenario.repoName })
    .first();
  await selectedRepoRow.waitFor({ state: 'visible', timeout: 30000 });

  const disclosureButton = selectedRepoRow.locator('button.control-tree-disclosure').first();
  const expanded = await disclosureButton.getAttribute('aria-expanded');
  if (expanded === 'false') {
    await disclosureButton.click();
  }

  const worktreeButton = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .locator('button[data-surface="row"]')
    .first();
  await worktreeButton.waitFor({ state: 'visible', timeout: 30000 });
}

export function formatElectronDiagnostics(launched: LaunchedElectronApp): string {
  if (launched.consoleMessages.length === 0) {
    return 'No renderer diagnostics captured.';
  }
  return launched.consoleMessages.join('\n');
}
