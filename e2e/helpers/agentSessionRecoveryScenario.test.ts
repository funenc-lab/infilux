import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_STATE_DIRNAME,
  SESSION_STATE_FILENAME,
  SETTINGS_FILENAME,
} from '../../src/shared/paths';
import {
  buildAppRuntimeIdentity,
  buildPersistentAgentHostSessionKey,
} from '../../src/shared/utils/runtimeIdentity';
import {
  createAgentSessionRecoveryScenario,
  ensureTmuxAvailable,
} from './agentSessionRecoveryScenario';

describe('createAgentSessionRecoveryScenario', () => {
  it('writes recovery fixture into the development shared-state profile and aligns tmux identity', async () => {
    ensureTmuxAvailable();
    const runtimeIdentity = buildAppRuntimeIdentity('dev');
    const scenario = await createAgentSessionRecoveryScenario();

    try {
      const runtimeRoot = join(
        scenario.homeDir,
        `${RUNTIME_STATE_DIRNAME}-dev`,
        scenario.profileName
      );
      const settingsPath = join(runtimeRoot, SETTINGS_FILENAME);
      const sessionStatePath = join(runtimeRoot, SESSION_STATE_FILENAME);

      expect(existsSync(settingsPath)).toBe(true);
      expect(existsSync(sessionStatePath)).toBe(true);

      const sessionState = JSON.parse(readFileSync(sessionStatePath, 'utf8')) as {
        persistentAgentSessions: Array<{ hostSessionKey: string }>;
      };

      expect(scenario.tmuxSessionName).toBe(
        buildPersistentAgentHostSessionKey(scenario.uiSessionId, 'dev')
      );
      expect(sessionState.persistentAgentSessions[0]?.hostSessionKey).toBe(
        scenario.tmuxSessionName
      );

      const tmuxSessionProbe = spawnSync(
        'tmux',
        ['-L', runtimeIdentity.tmuxServerName, 'has-session', '-t', scenario.tmuxSessionName],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      expect(tmuxSessionProbe.status).toBe(0);
    } finally {
      await scenario.cleanup();
    }
  });
});
