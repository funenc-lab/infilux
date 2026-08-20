import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type CodexWorktreeHistoryScenario,
  createCodexWorktreeHistoryScenario,
  readFakeCodexInvocations,
} from './helpers/codexWorktreeHistoryScenario';
import {
  ensureElectronBuildExists,
  formatElectronDiagnostics,
  launchInfiluxForScenario,
  quitElectronApplication,
  seedRendererLocalStorageAndReload,
  waitForRepositoryAndWorktree,
} from './helpers/electronApp';

const cleanupTasks: Array<() => Promise<void>> = [];

async function runCleanupTasks(): Promise<void> {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop();
    if (cleanup) {
      await cleanup();
    }
  }
}

describe.sequential('electron Codex worktree history recovery', () => {
  beforeAll(() => {
    ensureElectronBuildExists();
  });

  afterEach(async () => {
    await runCleanupTasks();
  });

  it('keeps legacy worktree history available to /resume after an app restart', async () => {
    const scenario = await createCodexWorktreeHistoryScenario();
    cleanupTasks.push(scenario.cleanup);
    const firstLaunch = await launchCodexHistoryScenario(scenario);

    try {
      await prepareScenarioPage(firstLaunch.page, scenario);
      await launchCodexFromEmptyState(firstLaunch.page);
      await expect
        .poll(async () => (await readFakeCodexInvocations(scenario.invocationLogPath)).length, {
          timeout: 30000,
        })
        .toBe(1);
      await expectStartedInWorktree(scenario, 1);
    } finally {
      await quitElectronApplication(firstLaunch.app);
    }

    const secondLaunch = await launchCodexHistoryScenario(scenario);
    try {
      await prepareScenarioPage(secondLaunch.page, scenario);
      await launchCodexFromEmptyState(secondLaunch.page);
      await expect
        .poll(async () => (await readFakeCodexInvocations(scenario.invocationLogPath)).length, {
          timeout: 30000,
        })
        .toBe(2);
      await expectStartedInWorktree(scenario, 2);

      const terminal = secondLaunch.page.locator('.xterm').last();
      await terminal.waitFor({ state: 'visible', timeout: 30000 });
      await terminal.click();
      await secondLaunch.page.keyboard.type('/resume');
      await secondLaunch.page.keyboard.press('Enter');

      await expect
        .poll(async () => await readVisibleTerminalText(secondLaunch.page), { timeout: 10000 })
        .toContain(`RESUME_SESSIONS:${scenario.legacySessionId}`);
      await expect
        .poll(async () => await readLatestResumedSessionIds(scenario), { timeout: 10000 })
        .toEqual([scenario.legacySessionId]);
      expect(await readVisibleTerminalText(secondLaunch.page)).not.toContain(
        scenario.siblingSessionId
      );

      const activeCodexSession = await getActiveCodexSession(secondLaunch.page);
      const sessionHistoryPath = await realpath(
        join(activeCodexSession.runtimeHomePath, 'sessions')
      );

      await secondLaunch.page.evaluate(
        async (sessionId) => window.electronAPI.session.kill(sessionId),
        activeCodexSession.sessionId
      );

      await expect
        .poll(() => existsSync(activeCodexSession.runtimeHomePath), { timeout: 10000 })
        .toBe(false);
      await expect(
        readFile(
          join(sessionHistoryPath, '2026', '08', '20', `rollout-${scenario.legacySessionId}.jsonl`),
          'utf8'
        )
      ).resolves.toContain(scenario.legacySessionId);
    } catch (error) {
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          'Fake Codex invocations:',
          JSON.stringify(await readFakeCodexInvocations(scenario.invocationLogPath), null, 2),
          'Renderer diagnostics:',
          formatElectronDiagnostics(secondLaunch),
        ].join('\n\n')
      );
    } finally {
      await quitElectronApplication(secondLaunch.app);
    }
  });
});

async function readStartedWorkingDirectories(
  scenario: CodexWorktreeHistoryScenario
): Promise<string[]> {
  return (await readFakeCodexInvocations(scenario.invocationLogPath))
    .filter((invocation) => invocation.type === 'start')
    .map((invocation) => invocation.cwd);
}

async function expectStartedInWorktree(
  scenario: CodexWorktreeHistoryScenario,
  expectedLaunchCount: number
): Promise<void> {
  const expectedWorktreePath = await realpath(scenario.worktreePath);
  const actualWorktreePaths = await Promise.all(
    (await readStartedWorkingDirectories(scenario)).map((cwd) => realpath(cwd))
  );

  expect(actualWorktreePaths).toEqual(
    Array.from({ length: expectedLaunchCount }, () => expectedWorktreePath)
  );
}

async function readLatestResumedSessionIds(
  scenario: CodexWorktreeHistoryScenario
): Promise<string[]> {
  const invocations = await readFakeCodexInvocations(scenario.invocationLogPath);
  for (let index = invocations.length - 1; index >= 0; index -= 1) {
    const invocation = invocations[index];
    if (invocation.type === 'resume') {
      return invocation.sessionIds;
    }
  }
  return [];
}

async function getActiveCodexSession(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<{ sessionId: string; runtimeHomePath: string }> {
  return page.evaluate(async () => {
    const session = (await window.electronAPI.session.list()).find((candidate) => {
      const runtimeHome = candidate.metadata?.codexRuntimeHome;
      return (
        candidate.kind === 'agent' &&
        typeof runtimeHome === 'object' &&
        runtimeHome !== null &&
        !Array.isArray(runtimeHome) &&
        typeof (runtimeHome as { homePath?: unknown }).homePath === 'string'
      );
    });
    const runtimeHome = session?.metadata?.codexRuntimeHome as { homePath?: unknown } | undefined;
    if (!session || typeof runtimeHome?.homePath !== 'string') {
      throw new Error('Expected an active Codex session with a managed runtime home');
    }

    return {
      sessionId: session.sessionId,
      runtimeHomePath: runtimeHome.homePath,
    };
  });
}

async function launchCodexHistoryScenario(scenario: CodexWorktreeHistoryScenario) {
  const originalLogPath = process.env.CODEX_HISTORY_E2E_LOG;
  process.env.CODEX_HISTORY_E2E_LOG = scenario.invocationLogPath;

  try {
    return await launchInfiluxForScenario(scenario);
  } finally {
    if (originalLogPath === undefined) {
      delete process.env.CODEX_HISTORY_E2E_LOG;
    } else {
      process.env.CODEX_HISTORY_E2E_LOG = originalLogPath;
    }
  }
}

async function prepareScenarioPage(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: CodexWorktreeHistoryScenario
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__INFILUX_E2E_ENABLE__', {
      configurable: true,
      value: true,
      writable: true,
    });
  });
  await seedRendererLocalStorageAndReload(page, scenario.browserLocalStorage);
  await waitForRepositoryAndWorktree(page, scenario);
  const worktreeRow = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .first();
  if ((await worktreeRow.getAttribute('data-active')) !== 'worktree') {
    await worktreeRow.locator('button[data-surface="row"]').click({ force: true });
  }
  await expect
    .poll(async () => await worktreeRow.getAttribute('data-active'), { timeout: 30000 })
    .toBe('worktree');
  await page.getByRole('button', { name: /Choose Profile/i }).waitFor({ timeout: 30000 });
}

async function launchCodexFromEmptyState(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page
    .getByRole('button', { name: /Choose Profile/i })
    .first()
    .click();
  const profileMenu = page.locator('[role="menu"]').filter({ hasText: /Codex/ }).first();
  await profileMenu.waitFor({ state: 'visible', timeout: 30000 });
  const codexProfileButton = profileMenu
    .locator('button')
    .filter({ hasText: /^Codex$/ })
    .first();
  await codexProfileButton.waitFor({ state: 'visible', timeout: 30000 });
  await codexProfileButton.locator('xpath=following-sibling::button').click();
  await page.getByRole('button', { name: /Launch Agent/ }).click();
}

async function readVisibleTerminalText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<string> {
  return await page.evaluate(() => {
    const terminal = (
      window as typeof window & {
        __INFILUX_E2E_LAST_XTERM__?: {
          rows: number;
          buffer: {
            active: {
              getLine: (
                index: number
              ) => { translateToString: (trimRight?: boolean) => string } | undefined;
              viewportY: number;
            };
          };
        };
      }
    ).__INFILUX_E2E_LAST_XTERM__;
    if (!terminal) {
      return '';
    }

    const rows: string[] = [];
    for (let rowIndex = 0; rowIndex < terminal.rows; rowIndex += 1) {
      rows.push(
        terminal.buffer.active
          .getLine(terminal.buffer.active.viewportY + rowIndex)
          ?.translateToString(true) ?? ''
      );
    }
    return rows.join('\n');
  });
}
