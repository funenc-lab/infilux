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

  it('keeps drag selection active while crossing the scroll-to-bottom control and restores the control after release', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await scrollUntilVisibleLine(launch.page, scenario, 'TRANSCRIPT-LINE-001');

      const scrollButton = resolveScrollToBottomButton(launch.page, scenario);
      await scrollButton.waitFor({ state: 'visible', timeout: 30000 });

      const visibleLines = extractVisibleTranscriptLines(
        await readVisibleTerminalText(launch.page, scenario)
      );
      expect(visibleLines.length).toBeGreaterThanOrEqual(8);

      const upperSelectionLine = visibleLines[Math.floor(visibleLines.length * 0.25)];
      const middleVisibleLine = visibleLines[Math.floor(visibleLines.length / 2)];
      const lowerSelectionLine = visibleLines[Math.floor(visibleLines.length * 0.8)];

      const terminal = resolveTerminalLocator(launch.page, scenario);
      const terminalBox = await terminal.boundingBox();
      const scrollButtonBox = await scrollButton.boundingBox();
      if (!terminalBox || !scrollButtonBox) {
        throw new Error(`Missing terminal or scroll button box for ${scenario.sessionPanelId}`);
      }

      const dragStartX = terminalBox.x + terminalBox.width * 0.12;
      const dragStartY = terminalBox.y + terminalBox.height * 0.22;
      const scrollButtonCenterX = scrollButtonBox.x + scrollButtonBox.width / 2;
      const scrollButtonCenterY = scrollButtonBox.y + scrollButtonBox.height / 2;
      const dragEndX = terminalBox.x + terminalBox.width * 0.82;
      const dragEndY = terminalBox.y + terminalBox.height * 0.88;

      await launch.page.mouse.move(dragStartX, dragStartY);
      await launch.page.mouse.down();

      await expect
        .poll(async () => await readScrollToBottomPointerEvents(launch.page, scenario), {
          timeout: 10000,
        })
        .toBe('none');

      await launch.page.mouse.move(scrollButtonCenterX, scrollButtonCenterY, { steps: 16 });

      const scrollButtonMatchedAtCenter = await elementAtPointMatchesScrollButton(
        launch.page,
        scenario,
        scrollButtonCenterX,
        scrollButtonCenterY
      );
      expect(scrollButtonMatchedAtCenter).toBe(false);

      await launch.page.mouse.move(dragEndX, dragEndY, { steps: 16 });
      await launch.page.mouse.up();

      await expect
        .poll(async () => (await readTerminalSelectionText(launch.page)).length, { timeout: 10000 })
        .toBeGreaterThan(0);

      const selectedText = await readTerminalSelectionText(launch.page);
      expect(selectedText).toContain(upperSelectionLine);
      expect(selectedText).toContain(middleVisibleLine);
      expect(selectedText).toContain(lowerSelectionLine);

      await expect
        .poll(
          async () => (await readScrollToBottomPointerEvents(launch.page, scenario)) === 'none',
          {
            timeout: 10000,
          }
        )
        .toBe(false);

      await scrollButton.click();

      await expect
        .poll(async () => await readVisibleTerminalText(launch.page, scenario), { timeout: 10000 })
        .toContain('TRANSCRIPT-LINE-180');

      const log = await readProbeLog(scenario.probeLogPath);
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

  it('auto-scrolls agent transcript downward while drag-selecting near the terminal edge', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario);
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await expectAutoScrollWhileDragSelecting(launch, scenario);
    } catch (error) {
      throw await buildScenarioError(error, launch, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('auto-scrolls canvas agent transcript downward while drag-selecting near the terminal edge', async () => {
    const scenario = await createAgentWheelProbeScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchInfiluxForScenario(scenario);

    try {
      await enableE2ETerminalHooks(launch.page);
      await writeAgentSessionDisplayMode(launch.page, 'canvas');
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await openSeededSession(launch.page, scenario, { requireSessionTab: false });
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await expectAutoScrollWhileDragSelecting(launch, scenario);
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

async function expectAutoScrollWhileDragSelecting(
  launch: Awaited<ReturnType<typeof launchInfiluxForScenario>>,
  scenario: AgentWheelProbeScenario
): Promise<void> {
  await scrollUntilVisibleLine(launch.page, scenario, 'TRANSCRIPT-LINE-001');

  const initialVisibleLines = extractVisibleTranscriptLines(
    await readVisibleTerminalText(launch.page, scenario)
  );
  expect(initialVisibleLines.length).toBeGreaterThanOrEqual(8);
  const firstInitialLine = initialVisibleLines[0] ?? '';
  const firstInitialLineNumber = parseTranscriptLineNumber(firstInitialLine);
  expect(firstInitialLineNumber).not.toBeNull();

  const terminal = resolveTerminalLocator(launch.page, scenario);
  const terminalBox = await terminal.boundingBox();
  if (!terminalBox) {
    throw new Error(`Missing terminal bounding box for ${scenario.sessionPanelId}`);
  }

  const dragStartX = terminalBox.x + terminalBox.width * 0.18;
  const dragStartY = terminalBox.y + terminalBox.height * 0.25;
  const dragHoldX = terminalBox.x + terminalBox.width * 0.72;
  const dragHoldY = terminalBox.y + terminalBox.height - 4;

  await launch.page.mouse.move(dragStartX, dragStartY);
  await launch.page.mouse.down();
  await launch.page.mouse.move(dragHoldX, dragHoldY, { steps: 20 });

  await expect
    .poll(
      async () => {
        const lines = extractVisibleTranscriptLines(
          await readVisibleTerminalText(launch.page, scenario)
        );
        const firstVisibleLineNumber = parseTranscriptLineNumber(lines[0] ?? '');
        return (
          firstVisibleLineNumber !== null &&
          firstInitialLineNumber !== null &&
          firstVisibleLineNumber > firstInitialLineNumber
        );
      },
      { timeout: 10000 }
    )
    .toBe(true);

  const scrolledVisibleLines = extractVisibleTranscriptLines(
    await readVisibleTerminalText(launch.page, scenario)
  );
  const scrolledSelectionLine =
    scrolledVisibleLines[Math.floor(scrolledVisibleLines.length / 2)] ?? '';
  expect(scrolledSelectionLine).not.toBe('');

  await launch.page.mouse.up();

  await expect
    .poll(async () => (await readTerminalSelectionText(launch.page)).length, { timeout: 10000 })
    .toBeGreaterThan(0);
  expect(await readTerminalSelectionText(launch.page)).toContain(scrolledSelectionLine);

  const log = await readProbeLog(scenario.probeLogPath);
  expect(log).not.toContain('MOUSE_EVENT');
  expect(log).not.toContain('PAGE_UP');
  expect(log).not.toContain('PAGE_DOWN');
  expect(log).not.toContain('ARROW_UP');
  expect(log).not.toContain('ARROW_DOWN');
}

async function openSeededSession(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  options: { requireSessionTab?: boolean } = {}
): Promise<void> {
  const requireSessionTab = options.requireSessionTab ?? true;
  const worktreeButton = page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .locator('button[data-surface="row"]')
    .first();
  await worktreeButton.click();

  if (requireSessionTab) {
    const sessionTab = page.getByRole('tab', { name: scenario.sessionDisplayName });
    await expect
      .poll(async () => await sessionTab.count(), { timeout: 30000 })
      .toBeGreaterThanOrEqual(1);
  }

  const terminal = resolveTerminalLocator(page, scenario);
  await terminal.waitFor({ state: 'visible', timeout: 30000 });
}

async function writeAgentSessionDisplayMode(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  agentSessionDisplayMode: 'tab' | 'canvas' | 'global-canvas'
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async (displayMode) => {
    await window.electronAPI.settings.write({
      'enso-settings': {
        state: {
          agentSessionDisplayMode: displayMode,
        },
      },
    });
  }, agentSessionDisplayMode);
}

function resolveTerminalLocator(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
) {
  return page.locator(`#${scenario.sessionPanelId} .xterm`).first();
}

async function readVisibleTerminalText(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  _scenario: AgentWheelProbeScenario
): Promise<string> {
  return await page.evaluate(() => {
    const terminal = (
      window as typeof window & {
        __INFILUX_E2E_LAST_XTERM__?: {
          rows: number;
          buffer: {
            active: {
              viewportY: number;
              getLine: (index: number) =>
                | {
                    translateToString: (trimRight?: boolean, startColumn?: number) => string;
                  }
                | undefined;
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
      const line = terminal.buffer.active.getLine(terminal.buffer.active.viewportY + rowIndex);
      rows.push(line?.translateToString(true) ?? '');
    }

    return rows.join('\n');
  });
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

function extractVisibleTranscriptLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^TRANSCRIPT-LINE-\d{3}$/u.test(line));
}

function parseTranscriptLineNumber(line: string): number | null {
  const match = /^TRANSCRIPT-LINE-(\d{3})$/u.exec(line);
  return match ? Number(match[1]) : null;
}

function resolveScrollToBottomButton(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
) {
  return page.locator(`#${scenario.sessionPanelId} button.bottom-3.right-3`).first();
}

async function readScrollToBottomPointerEvents(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario
): Promise<string | null> {
  return await page.evaluate((panelId) => {
    const button = document.querySelector<HTMLButtonElement>(`#${panelId} button.bottom-3.right-3`);
    return button ? window.getComputedStyle(button).pointerEvents : null;
  }, scenario.sessionPanelId);
}

async function elementAtPointMatchesScrollButton(
  page: Awaited<ReturnType<typeof launchInfiluxForScenario>>['page'],
  scenario: AgentWheelProbeScenario,
  x: number,
  y: number
): Promise<boolean> {
  return await page.evaluate(
    ({ panelId, x: pointX, y: pointY }) => {
      const element = document.elementFromPoint(pointX, pointY);
      return (
        element instanceof HTMLElement &&
        element.closest(`#${panelId} button.bottom-3.right-3`) !== null
      );
    },
    { panelId: scenario.sessionPanelId, x, y }
  );
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
