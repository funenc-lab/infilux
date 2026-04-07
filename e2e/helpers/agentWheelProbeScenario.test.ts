import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAgentWheelProbeScenario } from './agentWheelProbeScenario';

describe('createAgentWheelProbeScenario', () => {
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
