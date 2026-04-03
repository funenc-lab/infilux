import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type AgentWheelProbeScenario,
  createAgentWheelProbeScenario,
  readProbeLog,
  waitForProbeMarker,
} from './helpers/agentWheelProbeScenario';
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
    if (!cleanup) {
      continue;
    }
    await cleanup();
  }
}

describe.sequential('electron agent wheel scroll handling', () => {
  beforeAll(() => {
    ensureElectronBuildExists();
  });

  afterEach(async () => {
    await runCleanupTasks();
  });

  it('sends page navigation sequences for alternate-buffer agent sessions', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await dispatchWheel(launch.page, scenario, -480);
      await waitForProbeMarker(scenario.probeLogPath, 'PAGE_UP');

      const log = await readProbeLog(scenario.probeLogPath);
      expect(log).toContain('PAGE_UP');
      expect(log).not.toContain('ARROW_UP');
    } catch (error) {
      const probeLog = await readProbeLog(scenario.probeLogPath).catch((probeError) => {
        return `Failed to read probe log: ${
          probeError instanceof Error ? probeError.message : String(probeError)
        }`;
      });
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          'Probe log:',
          probeLog,
          'Renderer diagnostics:',
          formatElectronDiagnostics(launch),
        ].join('\n\n')
      );
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('maps repeated small upward wheel deltas to page-up navigation for alternate-buffer agent sessions', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await dispatchSmallWheelUntilMarker(launch.page, scenario, {
        deltaY: -15,
        marker: 'PAGE_UP',
        maxAttempts: 12,
      });

      const log = await readProbeLog(scenario.probeLogPath);
      expect(log).toContain('PAGE_UP');
      expect(log).not.toContain('ARROW_UP');
    } catch (error) {
      const probeLog = await readProbeLog(scenario.probeLogPath).catch((probeError) => {
        return `Failed to read probe log: ${
          probeError instanceof Error ? probeError.message : String(probeError)
        }`;
      });
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          'Probe log:',
          probeLog,
          'Renderer diagnostics:',
          formatElectronDiagnostics(launch),
        ].join('\n\n')
      );
    } finally {
      await quitElectronApplication(launch.app);
    }
  });
});

async function openSeededSession(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
): Promise<void> {
  const worktreeButton = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .locator('button[data-surface="row"]')
    .first();
  await worktreeButton.click();

  const sessionTab = page.getByRole('tab', { name: scenario.sessionDisplayName });
  await expect
    .poll(async () => await sessionTab.count(), { timeout: 30000 })
    .toBeGreaterThanOrEqual(1);

  const terminal = page.locator(`#${scenario.sessionPanelId} .xterm`).first();
  await terminal.waitFor({ state: 'visible', timeout: 30000 });
  await terminal.click();
}

async function dispatchSmallWheelUntilMarker(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  options: {
    deltaY: number;
    marker: string;
    maxAttempts: number;
  }
): Promise<void> {
  const { deltaY, marker, maxAttempts } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await dispatchWheel(page, scenario, deltaY);

    try {
      await waitForProbeMarker(scenario.probeLogPath, marker, 250);
      return;
    } catch {
      // Continue dispatching modest wheel deltas until the accumulated carry yields a step.
    }
  }

  await waitForProbeMarker(scenario.probeLogPath, marker);
}

async function dispatchWheel(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  deltaY: number
): Promise<void> {
  const terminal = page.locator(`#${scenario.sessionPanelId} .xterm`).first();
  const box = await terminal.boundingBox();
  if (!box) {
    throw new Error(`Missing terminal bounding box for session panel ${scenario.sessionPanelId}`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
}
