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
type ScenarioPage = Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'];
type ScenarioLocator = ReturnType<ScenarioPage['locator']>;

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
      await enableE2ETerminalHooks(secondLaunch.page);
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
      const tmuxScrollCalls = await secondLaunch.page.evaluate(() => {
        const windowWithProbe = window as typeof window & {
          __tmuxScrollProbe?: {
            calls: unknown[];
          };
        };
        return windowWithProbe.__tmuxScrollProbe?.calls ?? [];
      });
      expect(tmuxScrollCalls).toEqual([]);
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

  it('does not surface a foreign workspace session when selecting a worktree', async () => {
    console.info('[e2e] creating foreign-scope recovery scenario');
    const scenario = await createAgentSessionRecoveryScenario({ includeForeignWorkspace: true });
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

      const currentSessionTab = secondLaunch.page.getByRole('tab', {
        name: scenario.sessionDisplayName,
      });
      const foreignSessionTab = secondLaunch.page.getByRole('tab', {
        name: scenario.foreignSessionDisplayName,
      });
      expect(await currentSessionTab.count()).toBe(0);
      expect(await foreignSessionTab.count()).toBe(0);

      await selectRecoveryWorktree(secondLaunch.page, scenario);
      await expect
        .poll(async () => await currentSessionTab.count(), { timeout: 30000 })
        .toBeGreaterThanOrEqual(1);

      expect(await foreignSessionTab.count()).toBe(0);
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

  it('keeps a recovered canvas terminal mounted when returning to its worktree', async () => {
    const scenario = await createAgentSessionRecoveryScenario({
      agentSessionDisplayMode: 'canvas',
    });
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await selectRecoveryWorktree(launch.page, scenario);

      const terminal = resolveTerminalLocator(launch.page, scenario);
      await terminal.waitFor({ state: 'visible', timeout: 30000 });
      await installXtermMountProbe(launch.page, scenario.sessionPanelId);

      await selectWorktreeByBranch(launch.page, scenario.mainWorktreeBranch);
      await selectRecoveryWorktree(launch.page, scenario);
      await terminal.waitFor({ state: 'visible', timeout: 30000 });

      await expect
        .poll(async () => await readXtermMountProbe(launch.page), { timeout: 5000 })
        .toEqual({ added: 0, removed: 0 });
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('does not repeatedly hide a recovered canvas terminal while its session keeps producing output', async () => {
    const scenario = await createAgentSessionRecoveryScenario({
      agentSessionDisplayMode: 'canvas',
      continuousOutput: true,
    });
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await selectRecoveryWorktree(launch.page, scenario);

      const terminal = resolveTerminalLocator(launch.page, scenario);
      await terminal.waitFor({ state: 'visible', timeout: 30000 });
      if (!scenario.startContinuousOutput) {
        throw new Error('Continuous output fixture is unavailable');
      }
      await scenario.startContinuousOutput();
      await expect
        .poll(async () => await readVisibleTerminalText(launch.page, scenario), { timeout: 30000 })
        .toContain(scenario.liveOutputLine);
      await installXtermReplaySurfaceProbe(launch.page, scenario.sessionPanelId);

      await selectWorktreeByBranch(launch.page, scenario.mainWorktreeBranch);
      await selectRecoveryWorktree(launch.page, scenario);
      await terminal.waitFor({ state: 'visible', timeout: 30000 });

      expect(await waitForXtermReplaySurfaceToSettle(launch.page)).toBe(1);
    } finally {
      await quitElectronApplication(launch.app);
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

  await selectRecoveryWorktree(page, scenario);

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

async function selectRecoveryWorktree(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<void> {
  await selectWorktreeByBranch(page, scenario.worktreeBranch);
}

async function selectWorktreeByBranch(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  branch: string
): Promise<void> {
  const worktreeButton = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: branch })
    .locator('button[data-surface="row"]')
    .first();

  await revealWorktreeSidebarForInteraction(worktreeButton);
  console.info(`[e2e] clicking worktree row: ${branch}`);
  await worktreeButton.click();
}

async function installXtermMountProbe(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  sessionPanelId: string
): Promise<void> {
  await page.evaluate((targetPanelId) => {
    type XtermMountProbe = {
      added: number;
      observer: MutationObserver;
      removed: number;
    };
    const windowWithProbe = window as typeof window & {
      __xtermMountProbe?: XtermMountProbe;
    };
    windowWithProbe.__xtermMountProbe?.observer.disconnect();

    const panel = document.getElementById(targetPanelId);
    if (!panel) {
      throw new Error(`Missing terminal panel: ${targetPanelId}`);
    }

    const probe: XtermMountProbe = {
      added: 0,
      observer: new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (
              node instanceof Element &&
              (node.matches('.xterm') || node.querySelector('.xterm'))
            ) {
              probe.added += 1;
            }
          }
          for (const node of record.removedNodes) {
            if (
              node instanceof Element &&
              (node.matches('.xterm') || node.querySelector('.xterm'))
            ) {
              probe.removed += 1;
            }
          }
        }
      }),
      removed: 0,
    };
    probe.observer.observe(panel, { childList: true, subtree: true });
    windowWithProbe.__xtermMountProbe = probe;
  }, sessionPanelId);
}

async function readXtermMountProbe(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<{ added: number; removed: number }> {
  return await page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __xtermMountProbe?: { added: number; removed: number };
      }
    ).__xtermMountProbe;
    return {
      added: probe?.added ?? 0,
      removed: probe?.removed ?? 0,
    };
  });
}

async function installXtermReplaySurfaceProbe(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  sessionPanelId: string
): Promise<void> {
  await page.evaluate((targetPanelId) => {
    type XtermReplaySurfaceProbe = {
      hiddenCount: number;
      observer: MutationObserver;
    };
    const windowWithProbe = window as typeof window & {
      __xtermReplaySurfaceProbe?: XtermReplaySurfaceProbe;
    };
    windowWithProbe.__xtermReplaySurfaceProbe?.observer.disconnect();

    const panel = document.getElementById(targetPanelId);
    const surface = panel?.querySelector('.xterm')?.parentElement;
    if (!surface) {
      throw new Error(`Missing xterm replay surface for panel: ${targetPanelId}`);
    }

    const probe: XtermReplaySurfaceProbe = {
      hiddenCount: 0,
      observer: new MutationObserver(() => {
        if (surface instanceof HTMLElement && surface.style.visibility === 'hidden') {
          probe.hiddenCount += 1;
        }
      }),
    };
    probe.observer.observe(surface, { attributes: true, attributeFilter: ['style'] });
    windowWithProbe.__xtermReplaySurfaceProbe = probe;
  }, sessionPanelId);
}

async function waitForXtermReplaySurfaceToSettle(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<number> {
  return await page.evaluate(async () => {
    const probe = (
      window as typeof window & {
        __xtermReplaySurfaceProbe?: { hiddenCount: number };
      }
    ).__xtermReplaySurfaceProbe;
    if (!probe) {
      throw new Error('Missing xterm replay surface probe');
    }

    const timeoutAt = performance.now() + 10000;
    let previousCount = probe.hiddenCount;
    let lastChangeAt = performance.now();
    while (performance.now() < timeoutAt) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 50);
      });
      if (probe.hiddenCount !== previousCount) {
        previousCount = probe.hiddenCount;
        lastChangeAt = performance.now();
      }
      if (probe.hiddenCount > 0 && performance.now() - lastChangeAt >= 500) {
        return probe.hiddenCount;
      }
    }

    throw new Error(`Xterm replay surface did not settle; hide count: ${probe.hiddenCount}`);
  });
}

async function revealWorktreeSidebarForInteraction(worktreeButton: ScenarioLocator): Promise<void> {
  const hoverRevealGroup = worktreeButton
    .locator('xpath=ancestor::*[@data-sidebar-hover-reveal-group="active"]')
    .first();

  if ((await hoverRevealGroup.count()) === 0) {
    return;
  }

  const hoverRevealTrigger = hoverRevealGroup
    .locator('[data-sidebar-hover-reveal="active"]')
    .first();
  await hoverRevealTrigger.hover();
  await expect
    .poll(async () => await hoverRevealGroup.getAttribute('data-sidebar-hover-reveal-state'))
    .toBe('open');
  await expect
    .poll(async () =>
      worktreeButton.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hitTarget = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );

        return (
          hitTarget === element || hitTarget?.closest('button[data-surface="row"]') === element
        );
      })
    )
    .toBe(true);
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
      const activeWorktreesSnapshot = localStorage.getItem('enso-active-worktrees');
      const worktreeTabsSnapshot = localStorage.getItem('enso-worktree-tabs');
      const agentSessionsSnapshot = localStorage.getItem('enso-agent-sessions');
      const parseJson = (value: string | null): unknown => {
        if (!value) {
          return null;
        }
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      };
      const recoverable = await window.electronAPI.agentSession.listRecoverable();
      const restoreResult = await window.electronAPI.agentSession.restoreWorktreeSessions({
        repoPath,
        cwd: worktreePath,
      });
      const tabTexts = Array.from(document.querySelectorAll('[role="tab"]')).map((node) =>
        node.textContent?.trim()
      );
      const terminalPanels = Array.from(document.querySelectorAll('[id^="agent-session-panel-"]'))
        .map((node) => ({
          id: node.id,
          text: node.textContent?.trim().slice(0, 200) ?? '',
          visible:
            node instanceof HTMLElement ? node.offsetWidth > 0 && node.offsetHeight > 0 : false,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
      const activeWorktreeRows = Array.from(
        document.querySelectorAll('[data-node-kind="worktree"]')
      ).map((node) => ({
        active: node.getAttribute('data-active'),
        text: node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300) ?? '',
      }));
      const selectedTabs = Array.from(document.querySelectorAll('[aria-selected="true"]')).map(
        (node) => ({
          role: node.getAttribute('role'),
          text: node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) ?? '',
        })
      );

      return {
        selectedRepo,
        activeWorktreesSnapshot: parseJson(activeWorktreesSnapshot),
        worktreeTabsSnapshot: parseJson(worktreeTabsSnapshot),
        agentSessionsSnapshot: parseJson(agentSessionsSnapshot),
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
        selectedTabs,
        activeWorktreeRows,
        terminalPanels,
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

async function enableE2ETerminalHooks(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__INFILUX_E2E_ENABLE__', {
      configurable: true,
      value: true,
      writable: true,
    });
  });
  await page.evaluate(() => {
    Object.defineProperty(window, '__INFILUX_E2E_ENABLE__', {
      configurable: true,
      value: true,
      writable: true,
    });
  });
}

async function readVisibleTerminalText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentSessionRecoveryScenario
): Promise<string> {
  const bufferText = await page.evaluate(() => {
    type E2EXtermBufferLine = {
      translateToString: (trimRight?: boolean) => string;
    };
    type E2EXtermBuffer = {
      getLine: (line: number) => E2EXtermBufferLine | undefined;
      viewportY: number;
    };
    type E2EXterm = {
      buffer?: {
        active?: E2EXtermBuffer;
      };
      rows?: number;
    };
    const terminal = (
      window as typeof window & {
        __INFILUX_E2E_LAST_XTERM__?: E2EXterm;
      }
    ).__INFILUX_E2E_LAST_XTERM__;
    const buffer = terminal?.buffer?.active;
    const rows = terminal?.rows ?? 0;
    if (!buffer || rows <= 0) {
      return '';
    }

    const lines: string[] = [];
    for (let index = 0; index < rows; index += 1) {
      lines.push(buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? '');
    }
    return lines.join('\n');
  });
  if (bufferText.trim().length > 0) {
    return bufferText;
  }

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
