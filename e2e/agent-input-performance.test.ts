import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Terminal } from '@xterm/xterm';
import type { Page } from 'playwright';
import { describe, expect, it } from 'vitest';
import { sanitizeMainProcessDiagnostics } from '../scripts/runtime-performance-diagnostics';
import {
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

interface InputEchoProbe {
  expectedEcho: string;
  sentAt: number | null;
  samples: number[];
  dispose: () => void;
}

type ProbeWindow = Window & {
  __INFILUX_E2E_ENABLE__?: boolean;
  __INFILUX_E2E_LAST_XTERM__?: Terminal;
  __INFILUX_E2E_INPUT_ECHO_PROBE__?: InputEchoProbe;
};

function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    minMs: sorted[0] ?? null,
    medianMs: sorted.length
      ? sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
      : null,
    maxMs: sorted.at(-1) ?? null,
    samplesMs: samples,
  };
}

async function installInputEchoProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probeWindow = window as ProbeWindow;
    probeWindow.__INFILUX_E2E_INPUT_ECHO_PROBE__?.dispose();
    const terminal = probeWindow.__INFILUX_E2E_LAST_XTERM__;
    if (!terminal?.textarea) throw new Error('No interactive terminal is available');
    const textarea = terminal.textarea;
    const probe: InputEchoProbe = {
      expectedEcho: '',
      sentAt: null,
      samples: [],
      dispose: () => undefined,
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Enter' && !event.isComposing && probe.expectedEcho)
        probe.sentAt = window.performance.now();
    };
    textarea.addEventListener('keydown', handleKey, true);
    const parsed = terminal.onWriteParsed(() => {
      if (probe.sentAt === null || !probe.expectedEcho) return;
      const buffer = terminal.buffer.active;
      for (
        let index = Math.max(0, buffer.length - terminal.rows);
        index < buffer.length;
        index += 1
      ) {
        if (buffer.getLine(index)?.translateToString(true).includes(probe.expectedEcho)) {
          probe.samples.push(window.performance.now() - probe.sentAt);
          probe.expectedEcho = '';
          probe.sentAt = null;
          break;
        }
      }
    });
    probe.dispose = () => {
      textarea.removeEventListener('keydown', handleKey, true);
      parsed.dispose();
    };
    probeWindow.__INFILUX_E2E_INPUT_ECHO_PROBE__ = probe;
    terminal.focus();
  });
}

async function measureEcho(page: Page, text: string, insertUnicode = false): Promise<number> {
  const expectedCount = await page.evaluate((echo) => {
    const probe = (window as ProbeWindow).__INFILUX_E2E_INPUT_ECHO_PROBE__;
    if (!probe) throw new Error('Input echo probe is not installed');
    probe.expectedEcho = `ECHO:${echo}`;
    probe.sentAt = null;
    return probe.samples.length + 1;
  }, text);
  if (insertUnicode) await page.keyboard.insertText(text);
  else await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as ProbeWindow).__INFILUX_E2E_INPUT_ECHO_PROBE__?.samples.length ?? 0
        ),
      { timeout: 10000, intervals: [10, 25, 50, 100] }
    )
    .toBe(expectedCount);
  const sample = await page.evaluate(() =>
    (window as ProbeWindow).__INFILUX_E2E_INPUT_ECHO_PROBE__?.samples.at(-1)
  );
  if (sample === undefined || !Number.isFinite(sample) || sample < 0)
    throw new Error('Invalid input echo timing');
  return sample;
}

async function readTerminalText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const terminal = (window as ProbeWindow).__INFILUX_E2E_LAST_XTERM__;
    if (!terminal) return '';
    const buffer = terminal.buffer.active;
    const lines: string[] = [];
    for (let index = Math.max(0, buffer.length - terminal.rows); index < buffer.length; index += 1)
      lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
    return lines.join('\n');
  });
}

async function captureRuntime(page: Page) {
  const runtime = await page.evaluate(() => window.electronAPI.app.getRuntimeMetrics());
  const main = await page.evaluate(() =>
    window.electronAPI.log.captureMainProcessDiagnostics({ fdTimeoutMs: 500 })
  );
  return {
    processCount: runtime.processCount,
    appWorkingSetSizeKb: runtime.totalAppWorkingSetSizeKb,
    rendererWorkingSetSizeKb: runtime.rendererMetric?.workingSetSizeKb ?? null,
    main: sanitizeMainProcessDiagnostics(main),
  };
}

async function activatePanel(page: Page, name: 'File' | 'Agent'): Promise<void> {
  await page.getByRole('button', { name, exact: true }).focus();
  await page.keyboard.press('Enter');
}

describe.sequential('electron Agent input performance', () => {
  it('measures keyboard echo and retains Unicode input after panel switches and surface restoration', async () => {
    ensureElectronBuildExists();
    const label = process.env.INFILUX_E2E_PERF_LABEL ?? 'current';
    if (!/^[a-z0-9-]+$/u.test(label)) throw new Error('Invalid performance report label');
    const scenario = await createAgentWheelProbeScenario({ echoInput: true });
    let launch: Awaited<ReturnType<typeof launchInfiluxForScenario>> | undefined;
    try {
      const launchStartedAt = performance.now();
      launch = await launchInfiluxForScenario(scenario, {
        executablePath: process.env.INFILUX_E2E_EXECUTABLE_PATH,
      });
      const launchToFirstWindowMs = performance.now() - launchStartedAt;
      const page = launch.page;
      await page.addInitScript(() => {
        (window as ProbeWindow).__INFILUX_E2E_ENABLE__ = true;
      });
      await seedRendererLocalStorageAndReload(page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(page, scenario);
      const openStartedAt = performance.now();
      await page
        .locator('[data-node-kind="worktree"]')
        .filter({ hasText: scenario.worktreeBranch })
        .locator('button[data-surface="row"]')
        .first()
        .click();
      const terminalLocator = page.locator(`#${scenario.sessionPanelId} .xterm`).first();
      await terminalLocator.waitFor({ state: 'visible', timeout: 30000 });
      await waitForProbeMarker(scenario.probeLogPath, 'READY');
      await expect
        .poll(() => readTerminalText(page), { timeout: 30000 })
        .toContain('TRANSCRIPT-LINE-');
      const openToVisibleHistoryMs = performance.now() - openStartedAt;
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await page.mouse.move(viewport.width * 0.75, viewport.height * 0.5);
      const beforeRuntime = await captureRuntime(page);
      await installInputEchoProbe(page);
      const initialSamples: number[] = [];
      for (let index = 0; index < 12; index += 1)
        initialSamples.push(await measureEcho(page, `initial-echo-${index}`));

      const switchedSamples: number[] = [];
      for (let index = 0; index < 3; index += 1) {
        await activatePanel(page, 'File');
        await terminalLocator.waitFor({ state: 'hidden' });
        await activatePanel(page, 'Agent');
        await terminalLocator.waitFor({ state: 'visible' });
        await installInputEchoProbe(page);
        switchedSamples.push(await measureEcho(page, `switched-echo-${index}`));
      }

      const hideStartedAt = performance.now();
      await activatePanel(page, 'File');
      await terminalLocator.waitFor({ state: 'hidden' });
      await expect
        .poll(() => terminalLocator.count(), { timeout: 75000, intervals: [250, 500, 1000] })
        .toBe(0);
      const hideToSurfaceDisposalMs = performance.now() - hideStartedAt;
      const restoreStartedAt = performance.now();
      await activatePanel(page, 'Agent');
      await terminalLocator.waitFor({ state: 'visible' });
      await expect.poll(() => readTerminalText(page), { timeout: 30000 }).toContain('ECHO:');
      const restoreToVisibleHistoryMs = performance.now() - restoreStartedAt;
      await installInputEchoProbe(page);
      const restoredSamples: number[] = [];
      for (let index = 0; index < 5; index += 1)
        restoredSamples.push(await measureEcho(page, `restored-echo-${index}`));
      const unicodeText = 'unicode-\u4e2d\u6587';
      const unicodeEchoMs = await measureEcho(page, unicodeText, true);
      const lines = (await readProbeLog(scenario.probeLogPath)).split(/\r?\n/u);
      expect(lines.filter((line) => line === `TEXT:${unicodeText}`)).toHaveLength(1);
      const afterRuntime = await captureRuntime(page);
      const diagnostics = await page.evaluate(() => window.electronAPI.log.getDiagnostics(250));
      const stages = diagnostics.lines.flatMap((line) => {
        const match =
          /\[agent-startup\]\[renderer\]\[[^\]]+\] ([a-z0-9-]+) \+(\d+)ms \((\d+)ms total\)/u.exec(
            line
          );
        return match
          ? [{ stage: match[1], deltaMs: Number(match[2]), elapsedMs: Number(match[3]) }]
          : [];
      });
      const report = {
        label,
        generatedAt: new Date().toISOString(),
        launchToFirstWindowMs,
        openToVisibleHistoryMs,
        hideToSurfaceDisposalMs,
        restoreToVisibleHistoryMs,
        initial: summarize(initialSamples),
        switched: summarize(switchedSamples),
        restored: summarize(restoredSamples),
        unicodeEchoMs,
        beforeRuntime,
        afterRuntime,
        stages,
        limitations: [
          'Fixture PTY, not a real provider startup',
          'Parsed output, not painted pixels',
          'Panel switches, not repository switches',
          'Surface disposal may be immediate unmount, not timer-driven hibernation',
          'Unicode insertion, not native OS IME candidate UI',
          'Short workload, not a long-duration soak',
        ],
      };
      await mkdir('.tmp/e2e', { recursive: true });
      await writeFile(
        join('.tmp/e2e', `agent-input-performance-${label}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      );
      await page.screenshot({ path: join('.tmp/e2e', `agent-input-performance-${label}.png`) });
      console.info(
        `[agent-input-performance] ${JSON.stringify({ label, initial: report.initial, switched: report.switched, restored: report.restored, unicodeEchoMs, launchToFirstWindowMs, openToVisibleHistoryMs, restoreToVisibleHistoryMs })}`
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${launch ? formatElectronDiagnostics(launch) : ''}`
      );
    } finally {
      try {
        if (launch) await quitElectronApplication(launch.app);
      } finally {
        await scenario.cleanup();
      }
    }
  });
});
