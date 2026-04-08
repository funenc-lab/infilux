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

  it('surfaces the recovered session in SessionBar after restart when the user selects the worktree', async () => {
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
      const recoveryDiagnostics = await collectRecoveryDiagnostics(
        secondLaunch.page,
        scenario
      ).catch(
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

  it('restores transcript scrolling for recovered tmux-backed sessions after restart', async () => {
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
      await openRecoveredSessionAfterWorktreeSelection(secondLaunch.page, scenario);

      await expect
        .poll(async () => await readVisibleTerminalText(secondLaunch.page, scenario), {
          timeout: 30000,
        })
        .toContain(scenario.transcriptLastLine);

      await expect
        .poll(async () => await readVisibleTerminalText(secondLaunch.page, scenario), {
          timeout: 30000,
        })
        .not.toContain(scenario.transcriptFirstLine);

      await scrollUntilVisibleLine(secondLaunch.page, scenario, scenario.transcriptFirstLine);

      const visibleText = await readVisibleTerminalText(secondLaunch.page, scenario);
      expect(visibleText).toContain(scenario.transcriptFirstLine);
    } catch (error) {
      const recoveryDiagnostics = await collectRecoveryDiagnostics(
        secondLaunch.page,
        scenario
      ).catch(
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
          'Visible terminal text:',
          await readVisibleTerminalText(secondLaunch.page, scenario).catch((visibleError) =>
            visibleError instanceof Error ? visibleError.message : String(visibleError)
          ),
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
  await installRecoveryProbe(page);
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
  expect(await sessionTab.getAttribute('aria-selected')).toBe('true');
  await expect
    .poll(async () => (await sessionTab.textContent())?.trim() ?? '', { timeout: 10000 })
    .toContain(scenario.sessionDisplayName);
}

async function openRecoveredSessionAfterWorktreeSelection(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<void> {
  await assertSessionIsRecoveredAfterWorktreeSelection(page, scenario);
  await installTmuxScrollProbe(page);
  await resolveTerminalLocator(page, scenario).waitFor({ state: 'visible', timeout: 30000 });
}

async function collectRecoveryDiagnostics(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<string> {
  const diagnostics = await page.evaluate(
    async ({ repoPath, worktreePath, sessionDisplayName }) => {
      const probe = (
        window as typeof window & {
          __agentRecoveryProbe?: {
            calls: Array<{ repoPath: string; cwd: string }>;
            results: Array<{
              count: number;
              items: Array<{ uiSessionId: string; recoverable: boolean; reason: string | null }>;
            }>;
            errors: string[];
          };
          __tmuxScrollProbe?: {
            calls: Array<{
              repoPath?: string;
              sessionName: string;
              direction: 'up' | 'down';
              amount: number;
              serverName?: string;
            }>;
            results: Array<{ applied: boolean; sessionName?: string; paneId?: string }>;
            errors: string[];
          };
        }
      ).__agentRecoveryProbe;
      const tmuxScrollProbe = (
        window as typeof window & {
          __tmuxScrollProbe?: {
            calls: Array<{
              repoPath?: string;
              sessionName: string;
              direction: 'up' | 'down';
              amount: number;
              serverName?: string;
            }>;
            results: Array<{ applied: boolean; sessionName?: string; paneId?: string }>;
            errors: string[];
          };
        }
      ).__tmuxScrollProbe;
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
        automaticRestoreProbe: probe ?? null,
        tmuxScrollProbe: tmuxScrollProbe ?? null,
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

async function installRecoveryProbe(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page.evaluate(() => {
    type RecoveryProbe = {
      calls: Array<{ repoPath: string; cwd: string }>;
      results: Array<{
        count: number;
        items: Array<{ uiSessionId: string; recoverable: boolean; reason: string | null }>;
      }>;
      errors: string[];
      installed: boolean;
    };

    const windowWithProbe = window as typeof window & {
      __agentRecoveryProbe?: RecoveryProbe;
    };

    if (windowWithProbe.__agentRecoveryProbe?.installed) {
      return;
    }

    const originalRestore = window.electronAPI.agentSession.restoreWorktreeSessions;
    const probe: RecoveryProbe = {
      calls: [],
      results: [],
      errors: [],
      installed: true,
    };

    windowWithProbe.__agentRecoveryProbe = probe;
    window.electronAPI.agentSession.restoreWorktreeSessions = async (request) => {
      probe.calls.push({ repoPath: request.repoPath, cwd: request.cwd });

      try {
        const result = await originalRestore(request);
        probe.results.push({
          count: result.items.length,
          items: result.items.map((item) => ({
            uiSessionId: item.record.uiSessionId,
            recoverable: item.recoverable,
            reason: item.reason ?? null,
          })),
        });
        return result;
      } catch (error) {
        probe.errors.push(error instanceof Error ? error.message : String(error));
        throw error;
      }
    };
  });
}

async function installTmuxScrollProbe(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page.evaluate(() => {
    type TmuxScrollProbe = {
      calls: Array<{
        repoPath?: string;
        sessionName: string;
        direction: 'up' | 'down';
        amount: number;
        serverName?: string;
      }>;
      results: Array<{ applied: boolean; sessionName?: string; paneId?: string }>;
      errors: string[];
      installed: boolean;
    };

    const windowWithProbe = window as typeof window & {
      __tmuxScrollProbe?: TmuxScrollProbe;
    };

    if (windowWithProbe.__tmuxScrollProbe?.installed) {
      return;
    }

    const originalScrollClient = window.electronAPI.tmux.scrollClient;
    const probe: TmuxScrollProbe = {
      calls: [],
      results: [],
      errors: [],
      installed: true,
    };

    windowWithProbe.__tmuxScrollProbe = probe;
    window.electronAPI.tmux.scrollClient = async (repoPath, request) => {
      probe.calls.push({
        repoPath: repoPath ?? undefined,
        sessionName: request.sessionName,
        direction: request.direction,
        amount: request.amount,
        serverName: request.serverName,
      });

      try {
        const result = await originalScrollClient(repoPath, request);
        probe.results.push(result);
        return result;
      } catch (error) {
        probe.errors.push(error instanceof Error ? error.message : String(error));
        throw error;
      }
    };
  });
}

function resolveTerminalLocator(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
) {
  return page.locator(`#${scenario.sessionPanelId} .xterm`).first();
}

async function readVisibleTerminalText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<string> {
  const rows = page.locator(`#${scenario.sessionPanelId} .xterm-rows`).first();
  return await rows.innerText();
}

async function scrollUntilVisibleLine(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario,
  expectedLine: string
): Promise<void> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const visibleText = await readVisibleTerminalText(page, scenario);
    if (visibleText.includes(expectedLine)) {
      return;
    }

    await dispatchWheel(page, scenario, -720);
  }

  await expect
    .poll(async () => await readVisibleTerminalText(page, scenario), { timeout: 30000 })
    .toContain(expectedLine);
}

async function dispatchWheel(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario,
  deltaY: number
): Promise<void> {
  const terminal = resolveTerminalLocator(page, scenario);
  const box = await terminal.boundingBox();
  if (!box) {
    throw new Error(`Missing terminal bounding box for session panel ${scenario.sessionPanelId}`);
  }

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, deltaY);
}
