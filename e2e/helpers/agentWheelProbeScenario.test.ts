import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPersistentAgentHostSessionKey } from '../../src/shared/utils/runtimeIdentity';
import { buildManagedTmuxSocketPath } from '../../src/shared/utils/tmux';
import {
  type AgentWheelProbeScenario,
  createAgentWheelProbeScenario,
  readProbeLog,
  waitForProbeMarker,
} from './agentWheelProbeScenario';

async function runProbeLine(scenario: AgentWheelProbeScenario, text: string): Promise<string[]> {
  const socket = buildManagedTmuxSocketPath(scenario.homeDir, 'infilux-dev');
  const target = buildPersistentAgentHostSessionKey(scenario.uiSessionId, 'dev');
  const command = `python3 -u '${scenario.probeScriptPath}' '${scenario.probeLogPath}'`;
  execFileSync('tmux', ['-S', socket, 'respawn-pane', '-k', '-t', target, command]);
  await waitForProbeMarker(scenario.probeLogPath, 'READY', 3000);
  execFileSync('tmux', ['-S', socket, 'send-keys', '-t', target, '-l', '--', text]);
  execFileSync('tmux', ['-S', socket, 'send-keys', '-t', target, 'Enter']);
  await waitForProbeMarker(scenario.probeLogPath, `TEXT:${text}`, 3000);
  return (await readProbeLog(scenario.probeLogPath)).split(/\r?\n/u);
}

describe('createAgentWheelProbeScenario', () => {
  it('echoes input only when the performance probe is enabled', async () => {
    const scenario = await createAgentWheelProbeScenario({ echoInput: true });
    try {
      const lines = await runProbeLine(scenario, 'echo-performance-probe');
      expect(lines.filter((line) => line === 'TEXT:echo-performance-probe')).toHaveLength(1);
      const pane = execFileSync(
        'tmux',
        [
          '-S',
          buildManagedTmuxSocketPath(scenario.homeDir, 'infilux-dev'),
          'capture-pane',
          '-p',
          '-t',
          buildPersistentAgentHostSessionKey(scenario.uiSessionId, 'dev'),
        ],
        { encoding: 'utf8' }
      );
      expect(pane).toContain('ECHO:echo-performance-probe');
    } finally {
      await scenario.cleanup();
    }
  });

  it('preserves Unicode input across the probe read chunk boundary', async () => {
    const scenario = await createAgentWheelProbeScenario();
    try {
      const text = `${'x'.repeat(31)}\u4e2d\u6587`;
      const lines = await runProbeLine(scenario, text);
      expect(lines.filter((line) => line === `TEXT:${text}`)).toHaveLength(1);
    } finally {
      await scenario.cleanup();
    }
  });

  it('places separate background output before streaming performance echoes', async () => {
    const scenario = await createAgentWheelProbeScenario({ echoInput: true });
    try {
      await runProbeLine(scenario, 'streamed-echo-fixture');
      const capturePane = () =>
        execFileSync(
          'tmux',
          [
            '-S',
            buildManagedTmuxSocketPath(scenario.homeDir, 'infilux-dev'),
            'capture-pane',
            '-p',
            '-t',
            buildPersistentAgentHostSessionKey(scenario.uiSessionId, 'dev'),
          ],
          { encoding: 'utf8' }
        );
      await expect.poll(capturePane, { timeout: 3000 }).toContain('ECHO:streamed-echo-fixture');
      const pane = capturePane();
      expect(pane.indexOf('BACKGROUND:streamed-echo-fixture')).toBeGreaterThanOrEqual(0);
      expect(pane.indexOf('BACKGROUND:streamed-echo-fixture')).toBeLessThan(
        pane.indexOf('ECHO:streamed-echo-fixture')
      );
    } finally {
      await scenario.cleanup();
    }
  });

  it('creates a local repo fixture and browser snapshot for a seeded transcript probe session', async () => {
    const scenario = await createAgentWheelProbeScenario();

    try {
      expect(existsSync(scenario.repoPath)).toBe(true);
      expect(existsSync(scenario.worktreePath)).toBe(true);
      expect(existsSync(scenario.probeScriptPath)).toBe(true);
      expect(existsSync(scenario.probeLogPath)).toBe(true);

      const repositories = JSON.parse(scenario.browserLocalStorage['enso-repositories'] ?? '[]') as
        | Array<{ path: string }>
        | undefined;
      const activeWorktrees = JSON.parse(
        scenario.browserLocalStorage['enso-active-worktrees'] ?? '{}'
      ) as Record<string, string>;
      const sessionsSnapshot = JSON.parse(
        scenario.browserLocalStorage['enso-agent-sessions'] ?? '{}'
      ) as {
        sessions: Array<{
          id: string;
          repoPath: string;
          cwd: string;
          agentCommand: string;
          customArgs?: string;
          activated?: boolean;
          persistenceEnabled?: boolean;
        }>;
      };

      expect(repositories?.[0]?.path).toBe(scenario.repoPath);
      expect(activeWorktrees[scenario.repoPath]).toBe(scenario.worktreePath);
      expect(sessionsSnapshot.sessions).toHaveLength(1);
      expect(sessionsSnapshot.sessions[0]).toMatchObject({
        id: scenario.uiSessionId,
        repoPath: scenario.repoPath,
        cwd: scenario.worktreePath,
        agentCommand: 'python3',
        activated: true,
        persistenceEnabled: true,
      });
      expect(sessionsSnapshot.sessions[0]?.customArgs).toContain(scenario.probeScriptPath);
      expect(sessionsSnapshot.sessions[0]?.customArgs).toContain(scenario.probeLogPath);

      const probeScript = readFileSync(scenario.probeScriptPath, 'utf8');
      expect(probeScript).toContain('TRANSCRIPT-LINE-');
      expect(probeScript).toContain('MOUSE_EVENT');
      expect(probeScript).toContain('TEXT:');
    } finally {
      await scenario.cleanup();
    }
  });
});
