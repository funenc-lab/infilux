import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type AgentSessionRecoveryScenario,
  createAgentSessionRecoveryScenario,
  ensureTmuxAvailable,
} from './helpers/agentSessionRecoveryScenario';
import {
  ensureElectronBuildExists,
  formatElectronDiagnostics,
  launchInfiluxForScenario,
  quitElectronApplication,
  waitForRepositoryAndWorktree,
} from './helpers/electronApp';

const cleanupTasks: Array<() => Promise<void>> = [];

async function runCleanupTasks(): Promise<void> {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop();
    if (!cleanup) {
      continue;
    }
    await cleanup();
  }
}

describe.sequential('electron agent session recovery', () => {
  beforeAll(() => {
    ensureElectronBuildExists();
    ensureTmuxAvailable();
  });

  afterEach(async () => {
    await runCleanupTasks();
  });

  it('restores the recovered session after restart when the user selects the worktree', async () => {
    console.info('[e2e] creating recovery scenario');
    const scenario = await createAgentSessionRecoveryScenario();
    cleanupTasks.push(scenario.cleanup);

    console.info('[e2e] launching first app instance');
    const firstLaunch = await launchInfiluxForScenario(scenario);
    console.info('[e2e] waiting for first app repository/worktree');
    await waitForRepositoryAndWorktree(firstLaunch.page, scenario);
    console.info('[e2e] closing first app instance');
    await quitElectronApplication(firstLaunch.app);

    console.info('[e2e] launching second app instance');
    const secondLaunch = await launchInfiluxForScenario(scenario);

    try {
      console.info('[e2e] waiting for second app repository/worktree');
      await waitForRepositoryAndWorktree(secondLaunch.page, scenario);
      console.info('[e2e] asserting recovered session after worktree selection');
      await assertSessionIsRecoveredAfterWorktreeSelection(secondLaunch.page, scenario);
    } catch (error) {
      const recoveryDiagnostics = await collectRecoveryDiagnostics(secondLaunch.page, scenario).catch(
        (diagnosticError) =>
          `Failed to collect recovery diagnostics: ${
            diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)
          }`
      );
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          'Recovery diagnostics:',
          recoveryDiagnostics,
          'Renderer diagnostics:',
          formatElectronDiagnostics(secondLaunch),
        ].join('\n\n')
      );
    } finally {
      console.info('[e2e] closing second app instance');
      await quitElectronApplication(secondLaunch.app);
    }
  });
});

async function assertSessionIsRecoveredAfterWorktreeSelection(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<void> {
  console.info('[e2e] verifying recovered tab is absent before selection');
  const sessionTab = page.getByRole('tab', { name: scenario.sessionDisplayName });
  expect(await sessionTab.count()).toBe(0);

  const worktreeButton = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .locator('button[data-surface="row"]')
    .first();

  console.info('[e2e] clicking recovery worktree row');
  await worktreeButton.click();

  console.info('[e2e] waiting for recovered session tab');
  await expect
    .poll(async () => await sessionTab.count(), { timeout: 30000 })
    .toBeGreaterThanOrEqual(1);
  expect(await sessionTab.isVisible()).toBe(true);
  expect(await sessionTab.getAttribute('data-active')).toBe('true');

  console.info('[e2e] waiting for terminal rows');
  const terminalRows = page.locator(`#${scenario.sessionPanelId} .xterm-rows`).first();
  await terminalRows.waitFor({ state: 'visible', timeout: 30000 });
  console.info('[e2e] waiting for tmux greeting in terminal');
  await expect
    .poll(async () => (await terminalRows.textContent()) ?? '', { timeout: 30000 })
    .toContain(scenario.tmuxGreeting);
}

async function collectRecoveryDiagnostics(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<string> {
  const diagnostics = await page.evaluate(
    async ({ repoPath, worktreePath, sessionDisplayName }) => {
      const selectedRepo = localStorage.getItem('enso-selected-repo');
      const recoverable = await window.electronAPI.agentSession.listRecoverable();
      const restoreResult = await window.electronAPI.agentSession.restoreWorktreeSessions({
        repoPath,
        cwd: worktreePath,
      });
      const tabTexts = Array.from(document.querySelectorAll('[role="tab"]')).map((node) =>
        node.textContent?.trim()
      );

      return {
        selectedRepo,
        recoverableCount: recoverable.length,
        recoverableItems: recoverable.map((item) => ({
          uiSessionId: item.record.uiSessionId,
          displayName: item.record.displayName,
          repoPath: item.record.repoPath,
          cwd: item.record.cwd,
          hostKind: item.record.hostKind,
          hostSessionKey: item.record.hostSessionKey,
          runtimeState: item.runtimeState,
          recoverable: item.recoverable,
          reason: item.reason ?? null,
        })),
        restoreCount: restoreResult.items.length,
        restoreItems: restoreResult.items.map((item) => ({
          uiSessionId: item.record.uiSessionId,
          displayName: item.record.displayName,
          runtimeState: item.runtimeState,
          recoverable: item.recoverable,
          reason: item.reason ?? null,
        })),
        sessionTabPresent: tabTexts.includes(sessionDisplayName),
        tabTexts,
        bodyText: document.body.innerText.slice(0, 2000),
      };
    },
    {
      repoPath: scenario.repoPath,
      worktreePath: scenario.worktreePath,
      sessionDisplayName: scenario.sessionDisplayName,
    }
  );

  return JSON.stringify(diagnostics, null, 2);
}
