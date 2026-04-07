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

describe.sequential('electron agent transcript interactions', () => {
  beforeAll(() => {
    ensureElectronBuildExists();
  });

  afterEach(async () => {
    await runCleanupTasks();
  });

  it('scrolls agent transcript history without sending wheel control sequences into the process', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');

      await expect
        .poll(async () => await readVisibleTerminalText(launch.page, scenario), { timeout: 30000 })
        .toContain('TRANSCRIPT-LINE-180');

      await expect
        .poll(async () => await readVisibleTerminalText(launch.page, scenario), { timeout: 30000 })
        .not.toContain('TRANSCRIPT-LINE-001');

      await scrollUntilVisibleLine(launch.page, scenario, 'TRANSCRIPT-LINE-001');

      const visibleText = await readVisibleTerminalText(launch.page, scenario);
      expect(visibleText).toContain('TRANSCRIPT-LINE-001');

      const log = await readProbeLog(scenario.probeLogPath);
      expect(log).not.toContain('PAGE_UP');
      expect(log).not.toContain('PAGE_DOWN');
      expect(log).not.toContain('ARROW_UP');
      expect(log).not.toContain('ARROW_DOWN');
      expect(log).not.toContain('MOUSE_EVENT');
    } catch (error) {
      throw await buildScenarioError(error, launch, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('keeps pointer gestures out of the agent process and still accepts typed input after clicking the transcript', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');

      await clickTerminalAt(launch.page, scenario, {
        xRatio: 0.45,
        yRatio: 0.2,
      });
      await dispatchWheel(launch.page, scenario, -240, {
        xRatio: 0.45,
        yRatio: 0.2,
      });

      const typedLine = 'focus-lock-check';
      await launch.page.keyboard.type(typedLine);
      await launch.page.keyboard.press('Enter');
      await waitForProbeMarker(scenario.probeLogPath, `TEXT:${typedLine}`);

      const log = await readProbeLog(scenario.probeLogPath);
      expect(log).toContain(`TEXT:${typedLine}`);
      expect(log).not.toContain('MOUSE_EVENT');
      expect(log).not.toContain('PAGE_UP');
      expect(log).not.toContain('PAGE_DOWN');
      expect(log).not.toContain('ARROW_UP');
      expect(log).not.toContain('ARROW_DOWN');
    } catch (error) {
      throw await buildScenarioError(error, launch, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('copies selected transcript output through the terminal clipboard bridge without sending control input to the process', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await installClipboardWriteSpy(launch.page);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await scrollUntilVisibleLine(launch.page, scenario, 'TRANSCRIPT-LINE-001');
      await selectAllTranscriptOutput(launch.page);

      await expect
        .poll(async () => await readTerminalSelectionText(launch.page), { timeout: 10000 })
        .toContain('TRANSCRIPT-LINE-001');
      await expect
        .poll(async () => await readTerminalSelectionText(launch.page), { timeout: 10000 })
        .toContain('TRANSCRIPT-LINE-180');

      await launch.page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');

      await expect
        .poll(async () => await readClipboardWriteLog(launch.page), { timeout: 10000 })
        .toContain('TRANSCRIPT-LINE-001');

      const log = await readProbeLog(scenario.probeLogPath);
      expect(log).not.toContain('TEXT:c');
      expect(log).not.toContain('MOUSE_EVENT');
      expect(log).not.toContain('PAGE_UP');
      expect(log).not.toContain('PAGE_DOWN');
      expect(log).not.toContain('ARROW_UP');
      expect(log).not.toContain('ARROW_DOWN');
    } catch (error) {
      throw await buildScenarioError(error, launch, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });
});

async function buildScenarioError(
  error: unknown,
  launch: Awaited<ReturnType<typeof launchInfiluxForScenario>>,
  scenario: AgentWheelProbeScenario
): Promise<Error> {
  const probeLog = await readProbeLog(scenario.probeLogPath).catch((probeError) => {
    return `Failed to read probe log: ${
      probeError instanceof Error ? probeError.message : String(probeError)
    }`;
  });
  const visibleText = await readVisibleTerminalText(launch.page, scenario).catch((visibleError) => {
    return `Failed to read visible terminal text: ${
      visibleError instanceof Error ? visibleError.message : String(visibleError)
    }`;
  });
  const clipboardWrites = await readClipboardWriteLog(launch.page).catch((clipboardError) => {
    return `Failed to read clipboard writes: ${
      clipboardError instanceof Error ? clipboardError.message : String(clipboardError)
    }`;
  });
  const domSelectionText = await readDomSelectionText(launch.page).catch((selectionError) => {
    return `Failed to read DOM selection: ${
      selectionError instanceof Error ? selectionError.message : String(selectionError)
    }`;
  });
  const terminalSelectionText = await readTerminalSelectionText(launch.page).catch(
    (selectionError) => {
      return `Failed to read terminal selection: ${
        selectionError instanceof Error ? selectionError.message : String(selectionError)
      }`;
    }
  );

  return new Error(
    [
      error instanceof Error ? error.message : String(error),
      'Probe log:',
      probeLog,
      'Visible terminal text:',
      visibleText,
      'Clipboard writes:',
      clipboardWrites,
      'DOM selection:',
      domSelectionText,
      'Terminal selection:',
      terminalSelectionText,
      'Renderer diagnostics:',
      formatElectronDiagnostics(launch),
    ].join('\n\n')
  );
}

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

  const terminal = resolveTerminalLocator(page, scenario);
  await terminal.waitFor({ state: 'visible', timeout: 30000 });
}

function resolveTerminalLocator(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
) {
  return page.locator(`#${scenario.sessionPanelId} .xterm`).first();
}

async function readVisibleTerminalText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
): Promise<string> {
  const rows = page.locator(`#${scenario.sessionPanelId} .xterm-rows`).first();
  return await rows.innerText();
}

async function installClipboardWriteSpy(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page.evaluate(() => {
    const existingClipboard = navigator.clipboard ?? {};
    const writes: string[] = [];

    Object.defineProperty(window, '__INFILUX_E2E_CLIPBOARD_WRITES__', {
      configurable: true,
      value: writes,
      writable: true,
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        ...existingClipboard,
        writeText: async (text: string) => {
          writes.push(text);
        },
        readText: async () => writes[writes.length - 1] ?? '',
      },
    });
  });
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
}

async function readClipboardWriteLog(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<string> {
  return await page.evaluate(() => {
    const writes = (window as typeof window & { __INFILUX_E2E_CLIPBOARD_WRITES__?: string[] })
      .__INFILUX_E2E_CLIPBOARD_WRITES__;
    return JSON.stringify(writes ?? []);
  });
}

async function readDomSelectionText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<string> {
  return await page.evaluate(() => document.getSelection()?.toString() ?? '');
}

async function readTerminalSelectionText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<string> {
  return await page.evaluate(() => {
    const terminal = (
      window as typeof window & {
        __INFILUX_E2E_LAST_XTERM__?: { getSelection?: () => string; hasSelection?: () => boolean };
      }
    ).__INFILUX_E2E_LAST_XTERM__;

    if (!terminal?.hasSelection?.()) {
      return '';
    }

    return terminal.getSelection?.() ?? '';
  });
}

async function selectAllTranscriptOutput(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page']
): Promise<void> {
  await page.evaluate(() => {
    const terminal = (
      window as typeof window & {
        __INFILUX_E2E_LAST_XTERM__?: { selectAll?: () => void };
      }
    ).__INFILUX_E2E_LAST_XTERM__;

    terminal?.selectAll?.();
  });
}

async function scrollUntilVisibleLine(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
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

async function clickTerminalAt(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  options: {
    xRatio: number;
    yRatio: number;
  }
): Promise<void> {
  const terminal = resolveTerminalLocator(page, scenario);
  const box = await terminal.boundingBox();
  if (!box) {
    throw new Error(`Missing terminal bounding box for session panel ${scenario.sessionPanelId}`);
  }

  await page.mouse.click(box.x + box.width * options.xRatio, box.y + box.height * options.yRatio);
}

async function dispatchWheel(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  deltaY: number,
  options: {
    xRatio?: number;
    yRatio?: number;
  } = {}
): Promise<void> {
  const terminal = resolveTerminalLocator(page, scenario);
  const box = await terminal.boundingBox();
  if (!box) {
    throw new Error(`Missing terminal bounding box for session panel ${scenario.sessionPanelId}`);
  }

  const xRatio = options.xRatio ?? 0.5;
  const yRatio = options.yRatio ?? 0.5;
  await page.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await page.mouse.wheel(0, deltaY);
}
