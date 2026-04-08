import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const claudeHookManagerTestState = vi.hoisted(() => ({
  userDataPath: '/tmp/infilux-claude-hook-user-data',
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData' ? claudeHookManagerTestState.userDataPath : `/tmp/${name}`,
  },
}));

import { ensureStatusLineHook, ensureStopHook } from '../ClaudeHookManager';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('ClaudeHookManager', () => {
  let configDir: string;
  let hooksDir: string;
  let settingsPath: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'infilux-claude-hooks-'));
    hooksDir = join(configDir, 'hooks');
    settingsPath = join(configDir, 'settings.json');
    claudeHookManagerTestState.userDataPath = mkdtempSync(
      join(tmpdir(), 'infilux-claude-user-data-')
    );
    process.env.CLAUDE_CONFIG_DIR = configDir;
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    rmSync(configDir, { recursive: true, force: true });
    rmSync(claudeHookManagerTestState.userDataPath, { recursive: true, force: true });
  });

  it('writes the Stop hook using the Infilux hook script name', () => {
    const ok = ensureStopHook();

    expect(ok).toBe(true);
    expect(existsSync(join(hooksDir, 'infilux-hook.cjs'))).toBe(true);
    expect(existsSync(join(hooksDir, 'ensoai-hook.cjs'))).toBe(false);

    const settings = readJson(settingsPath);
    const stopHooks = (settings.hooks as Record<string, unknown>).Stop as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    expect(stopHooks[0]?.hooks[0]?.command).toContain('infilux-hook.cjs');
    expect(stopHooks[0]?.hooks[0]?.command).not.toContain('ensoai-hook.cjs');
  });

  it('migrates the status line hook to the Infilux script name', () => {
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'enso-statusline.cjs'), '// legacy', 'utf8');
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: 'command',
            command: 'node "/legacy/enso-statusline.cjs"',
            padding: 1,
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const ok = ensureStatusLineHook();

    expect(ok).toBe(true);
    expect(existsSync(join(hooksDir, 'infilux-statusline.cjs'))).toBe(true);
    expect(existsSync(join(hooksDir, 'enso-statusline.cjs'))).toBe(false);

    const settings = readJson(settingsPath);
    expect(settings.statusLine).toMatchObject({
      type: 'command',
      padding: 0,
    });
    expect((settings.statusLine as { command?: string }).command).toContain(
      'infilux-statusline.cjs'
    );
    expect((settings.statusLine as { command?: string }).command).not.toContain(
      'enso-statusline.cjs'
    );
  });
});
